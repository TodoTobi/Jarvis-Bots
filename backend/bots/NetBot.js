/**
 * NetBot.js — Controls network devices via ADB (Android TV, phones)
 *
 * FIXES:
 *  - _ensureConnected() verifies connection before running commands
 *  - Handles 'unknown host service 5555:features' with actionable instructions
 *  - Connection state cached per device to avoid repeated connect overhead
 *  - Added 'adb_connect' action for manual reconnect from chat
 *  - Wireless Debugging (Android 11+) vs legacy TCP mode properly handled
 */

const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const Bot = require("./Bot");
const logger = require("../logs/logger");

class NetBot extends Bot {
    constructor() {
        super("NetBot", "Control de dispositivos en la red local");
        this.devicesPath = path.resolve(__dirname, "../config/devices.json");
        this.devices = this._loadDevices();
        this.adbExe = this._resolveAdbPath();
        this._connectedDevices = new Set(); // cache per session
    }

    /* ─── ADB PATH ────────────────────────────────────────── */

    _resolveAdbPath() {
        const envPath = process.env.ADB_PATH;
        if (envPath && fs.existsSync(envPath)) {
            logger.info(`NetBot: ADB from ADB_PATH: ${envPath}`);
            return `"${envPath}"`;
        }
        if (envPath) logger.warn(`NetBot: ADB_PATH set but not found: ${envPath}`);

        const home = process.env.USERPROFILE || process.env.HOME || "";
        const localApp = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

        const candidates = [
            path.join(localApp, "Android", "Sdk", "platform-tools", "adb.exe"),
            "C:\\platform-tools\\adb.exe",
            "C:\\Android\\platform-tools\\adb.exe",
            "C:\\adb\\adb.exe",
        ];

        for (const c of candidates) {
            if (c && fs.existsSync(c)) {
                logger.info(`NetBot: ADB auto-detected: ${c}`);
                return `"${c}"`;
            }
        }

        logger.warn("NetBot: ADB not found in common paths. Set ADB_PATH in .env");
        return "adb";
    }

    _getAdbNotFoundMessage() {
        return (
            "ADB no encontrado.\n" +
            "1. Descargá: https://developer.android.com/studio/releases/platform-tools\n" +
            "2. Descomprimí en C:\\platform-tools\\\n" +
            "3. En backend/config/.env: ADB_PATH=C:\\platform-tools\\adb.exe\n" +
            "4. Reiniciá el servidor"
        );
    }

    _getWirelessDebugHelp(ip, port) {
        return (
            `❌ No se pudo conectar a ${ip}:${port}\n\n` +
            `📱 Depuración Inalámbrica (Android 11+):\n` +
            `  • Ajustes → Opciones de desarrollador → Depuración inalámbrica\n` +
            `  • El PUERTO mostrado ahí es el correcto — actualizalo en devices.json\n` +
            `  • Luego pedime "conectar al celular"\n\n` +
            `🔌 Método legacy (USB primero):\n` +
            `  • Conectá por USB y ejecutá: adb tcpip 5555\n` +
            `  • Desconectá USB y ejecutá: adb connect ${ip}:5555\n\n` +
            `El puerto actual configurado (${port}) no coincide con el dispositivo.`
        );
    }

    /* ─── DEVICE REGISTRY ─────────────────────────────────── */

    _loadDevices() {
        try {
            const raw = fs.readFileSync(this.devicesPath, "utf-8");
            const parsed = JSON.parse(raw);
            logger.info(`NetBot: ${parsed.devices.length} devices loaded`);
            return parsed.devices;
        } catch (err) {
            logger.warn(`NetBot: could not load devices.json — ${err.message}`);
            return [];
        }
    }

    reloadDevices() {
        this.devices = this._loadDevices();
        this.adbExe = this._resolveAdbPath();
        this._connectedDevices.clear();
    }

    getDevice(id) {
        const device = this.devices.find(
            (d) => d.id === id || d.name.toLowerCase() === id.toLowerCase()
        );
        if (!device) throw new Error(`Dispositivo "${id}" no encontrado`);
        if (!device.authorized) throw new Error(`Dispositivo "${id}" no está autorizado`);
        return device;
    }

    getDeviceList() {
        return this.devices.map((d) => ({
            id: d.id, name: d.name, type: d.type,
            ip: d.ip, adb_port: d.adb_port || 5555, authorized: d.authorized,
        }));
    }

    isAdbAvailable() {
        return new Promise((resolve) => {
            exec(`${this.adbExe} version`, { timeout: 5000 }, (err) => resolve(!err));
        });
    }

    /* ─── MAIN EXECUTION ──────────────────────────────────── */

    async run(parameters) {
        const action = this.requireParam(parameters, "action");
        const deviceId = this.getParam(parameters, "device", null);
        const query = this.getParam(parameters, "query", "");
        const value = this.getParam(parameters, "value", null);

        switch (action) {
            case "adb_connect": return this._adbForceConnect(deviceId);
            case "adb_youtube": return this._adbOpenYouTube(deviceId, query);
            case "adb_volume": return this._adbSetVolume(deviceId, value);
            case "adb_screenshot": return this._adbScreenshot(deviceId);
            case "adb_home": return this._adbKeyEvent(deviceId, 3);
            case "adb_back": return this._adbKeyEvent(deviceId, 4);
            case "adb_wakeup": return this._adbKeyEvent(deviceId, 224);
            case "adb_open_app": return this._adbOpenApp(deviceId, query);
            case "adb_input_text": return this._adbInputText(deviceId, query);
            case "wol": return this._wakeOnLan(deviceId);
            case "ping": return this._pingDevice(deviceId);
            default:
                throw new Error(`NetBot: acción desconocida "${action}"`);
        }
    }

    /* ─── CONNECTION MANAGEMENT ───────────────────────────── */

    /**
     * Ensures device is connected via ADB.
     * Caches connections and handles the 'unknown host service' bug.
     */
    async _ensureConnected(device) {
        const target = `${device.ip}:${device.adb_port || 5555}`;

        // Quick check if we think we're already connected
        if (this._connectedDevices.has(target)) {
            try {
                await this._execRaw(`${this.adbExe} -s ${target} shell echo ok`, 4000);
                return target;
            } catch {
                this._connectedDevices.delete(target);
                logger.warn(`NetBot: lost connection to ${target}, reconnecting...`);
            }
        }

        // Attempt connection
        logger.info(`NetBot: connecting to ${target}...`);
        let connectOut = "";
        try {
            connectOut = await this._execRaw(`${this.adbExe} connect ${target}`, 8000);
        } catch (err) {
            const msg = err.message || "";
            if (msg.includes("no se reconoce") || msg.includes("not recognized") || msg.includes("command not found")) {
                throw new Error(this._getAdbNotFoundMessage());
            }
            throw new Error(this._getWirelessDebugHelp(device.ip, device.adb_port || 5555));
        }

        logger.info(`NetBot: adb connect → ${connectOut}`);

        if (!connectOut.includes("connected")) {
            throw new Error(this._getWirelessDebugHelp(device.ip, device.adb_port || 5555));
        }

        // Verify a real command works (catches the '5555:features' error)
        try {
            await this._execRaw(`${this.adbExe} -s ${target} shell echo ok`, 5000);
        } catch (err) {
            const msg = err.message || "";
            // 'unknown host service 5555:features' — wrong port for wireless debugging
            if (msg.includes("unknown host service") || msg.includes("features")) {
                throw new Error(
                    `⚠️ ADB conectó pero el dispositivo rechazó el comando.\n\n` +
                    `Error: ${msg}\n\n` +
                    this._getWirelessDebugHelp(device.ip, device.adb_port || 5555)
                );
            }
            throw new Error(`Conectado pero el dispositivo no responde: ${msg}`);
        }

        this._connectedDevices.add(target);
        logger.info(`NetBot: ✅ connected to ${target}`);
        return target;
    }

    async _adbForceConnect(deviceId) {
        const device = this.getDevice(deviceId);
        const target = `${device.ip}:${device.adb_port || 5555}`;
        this._connectedDevices.delete(target);
        const connected = await this._ensureConnected(device);
        return `✅ Conectado a ${device.name} (${connected})`;
    }

    /* ─── ADB COMMAND ─────────────────────────────────────── */

    async _adbCommand(deviceId, command) {
        const device = this.getDevice(deviceId);
        if (!["android_phone", "android_tv"].includes(device.type)) {
            throw new Error(`ADB no soportado para tipo: ${device.type}`);
        }

        const adbOk = await this.isAdbAvailable();
        if (!adbOk) throw new Error(this._getAdbNotFoundMessage());

        const target = await this._ensureConnected(device);
        logger.info(`NetBot ADB → ${device.name}: ${command.substring(0, 80)}`);
        return this._execRaw(`${this.adbExe} -s ${target} ${command}`, 20000);
    }

    /* ─── ADB ACTIONS ─────────────────────────────────────── */

    async _adbOpenYouTube(deviceId, query) {
        const url = query
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
            : "https://www.youtube.com";
        await this._adbCommand(deviceId, `shell am start -a android.intent.action.VIEW -d "${url}"`);
        return `✅ YouTube abierto${query ? ` — búsqueda: "${query}"` : ""}`;
    }

    async _adbSetVolume(deviceId, level) {
        const vol = Math.max(0, Math.min(15, parseInt(level) || 8));
        await this._adbCommand(deviceId, `shell media volume --stream 3 --set ${vol}`);
        return `✅ Volumen ajustado a ${vol}/15`;
    }

    async _adbScreenshot(deviceId) {
        const filename = `screenshot_${Date.now()}.png`;
        const remotePath = `/sdcard/${filename}`;
        const localPath = path.resolve(__dirname, `../../screenshots/${filename}`);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        await this._adbCommand(deviceId, `shell screencap -p ${remotePath}`);
        await this._adbCommand(deviceId, `pull ${remotePath} "${localPath}"`);
        await this._adbCommand(deviceId, `shell rm ${remotePath}`);
        return `✅ Screenshot guardado: ${filename}`;
    }

    async _adbKeyEvent(deviceId, keyCode) {
        await this._adbCommand(deviceId, `shell input keyevent ${keyCode}`);
        return `✅ KeyEvent ${keyCode} enviado a ${deviceId}`;
    }

    async _adbOpenApp(deviceId, packageName) {
        await this._adbCommand(deviceId, `shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
        return `✅ App "${packageName}" abierta`;
    }

    async _adbInputText(deviceId, text) {
        const safeText = text.replace(/\s+/g, "%s").replace(/[^a-zA-Z0-9%+]/g, "");
        await this._adbCommand(deviceId, `shell input text "${safeText}"`);
        return `✅ Texto ingresado en ${deviceId}`;
    }

    /* ─── WAKE-ON-LAN ─────────────────────────────────────── */

    async _wakeOnLan(deviceId) {
        const device = this.getDevice(deviceId);
        if (!device.mac) throw new Error(`"${deviceId}" no tiene MAC configurada`);
        const mac = device.mac.replace(/[:-]/g, "").match(/.{2}/g).join(":");
        const cmd = `powershell -command "function Send-WOL { param([string]$mac); $broadcast = [Net.IPAddress]::Broadcast; $client = New-Object Net.Sockets.UdpClient; $client.Connect($broadcast, 9); $macBytes = $mac.Split(':') | ForEach-Object { [Convert]::ToByte($_, 16) }; $payload = @(,0xFF * 6) + ($macBytes * 16); $client.Send($payload, $payload.Length) | Out-Null }; Send-WOL '${mac}'"`;
        await this._execRaw(cmd, 10000);
        return `✅ Magic packet enviado a ${device.name} (${device.mac})`;
    }

    /* ─── PING ────────────────────────────────────────────── */

    async _pingDevice(deviceId) {
        const device = this.getDevice(deviceId);
        const cmd = process.platform === "win32"
            ? `ping -n 1 -w 1000 ${device.ip}`
            : `ping -c 1 -W 1 ${device.ip}`;
        try {
            await this._execRaw(cmd, 5000);
            return `✅ ${device.name} (${device.ip}) está en línea`;
        } catch {
            return `❌ ${device.name} (${device.ip}) no responde`;
        }
    }

    /* ─── EXEC ────────────────────────────────────────────── */

    _execRaw(command, timeout = 15000) {
        return new Promise((resolve, reject) => {
            exec(command, { timeout }, (error, stdout, stderr) => {
                if (error) {
                    const msg = stderr?.trim() || error.message || "";
                    reject(new Error(msg || error.message));
                    return;
                }
                resolve(stdout?.trim() || "");
            });
        });
    }
}

module.exports = NetBot;