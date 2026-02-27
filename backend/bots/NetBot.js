/**
 * NetBot.js — Controls devices on the local network
 *
 * Supports:
 *  - Android phones & Android TV via ADB over WiFi
 *  - Wake-on-LAN for any device
 *
 * ADB Setup:
 *  Option A (recommended): Set ADB_PATH in .env pointing to adb.exe
 *    ADB_PATH=C:\platform-tools\adb.exe
 *  Option B: Add Android Platform Tools folder to Windows PATH
 *    Download: https://developer.android.com/studio/releases/platform-tools
 *
 * FIXES:
 *  - Added _resolveAdbPath() — auto-detects ADB in common Windows locations
 *  - All ADB commands use the resolved path instead of bare "adb"
 *  - Clear error message when ADB is missing (with download link)
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
    }

    /* =========================
       ADB PATH RESOLUTION
    ========================= */

    _resolveAdbPath() {
        // 1. Explicit env variable (highest priority)
        const envPath = process.env.ADB_PATH;
        if (envPath && fs.existsSync(envPath)) {
            logger.info(`NetBot: ADB resolved from ADB_PATH env: ${envPath}`);
            return `"${envPath}"`;
        }
        if (envPath && !fs.existsSync(envPath)) {
            logger.warn(`NetBot: ADB_PATH set but file not found: ${envPath}`);
        }

        // 2. Auto-detect common Windows locations
        const home = process.env.USERPROFILE || process.env.HOME || "";
        const localApp = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

        const candidates = [
            path.join(localApp, "Android", "Sdk", "platform-tools", "adb.exe"),
            path.join(home, "AppData", "Local", "Android", "Sdk", "platform-tools", "adb.exe"),
            "C:\\platform-tools\\adb.exe",
            "C:\\Android\\platform-tools\\adb.exe",
            "C:\\adb\\adb.exe",
            "C:\\tools\\platform-tools\\adb.exe",
            "C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe",
            "C:\\Users\\Public\\Android\\platform-tools\\adb.exe",
        ];

        for (const candidate of candidates) {
            if (candidate && fs.existsSync(candidate)) {
                logger.info(`NetBot: ADB auto-detected at: ${candidate}`);
                return `"${candidate}"`;
            }
        }

        // 3. Assume it's in system PATH (will fail with helpful error if not)
        logger.warn(
            "NetBot: ADB not found in common paths. " +
            "Download from https://developer.android.com/studio/releases/platform-tools " +
            "and set ADB_PATH=C:\\path\\to\\adb.exe in backend/config/.env"
        );
        return "adb";
    }

    _getAdbNotFoundMessage() {
        return (
            "ADB no está instalado o no se encuentra en el PATH del sistema.\n" +
            "Solución:\n" +
            "  1. Descargá Android Platform Tools desde:\n" +
            "     https://developer.android.com/studio/releases/platform-tools\n" +
            "  2. Descomprimí en C:\\platform-tools\\\n" +
            "  3. Agregá en backend/config/.env:\n" +
            "     ADB_PATH=C:\\platform-tools\\adb.exe\n" +
            "  4. Reiniciá el servidor"
        );
    }

    /* =========================
       DEVICE REGISTRY
    ========================= */

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
        this.adbExe = this._resolveAdbPath(); // re-check ADB path on reload
        logger.info("NetBot: device list and ADB path reloaded");
    }

    getDevice(id) {
        const device = this.devices.find(d => d.id === id || d.name.toLowerCase() === id.toLowerCase());
        if (!device) throw new Error(`Device "${id}" not found in registry`);
        if (!device.authorized) throw new Error(`Device "${id}" is not authorized`);
        return device;
    }

    getDeviceList() {
        return this.devices.map(d => ({
            id: d.id,
            name: d.name,
            type: d.type,
            authorized: d.authorized
        }));
    }

    isAdbAvailable() {
        return new Promise((resolve) => {
            exec(`${this.adbExe} version`, { timeout: 5000 }, (err) => resolve(!err));
        });
    }

    /* =========================
       MAIN EXECUTION
    ========================= */

    async run(parameters) {
        const action = this.requireParam(parameters, "action");
        const deviceId = this.getParam(parameters, "device", null);
        const query = this.getParam(parameters, "query", "");
        const value = this.getParam(parameters, "value", null);

        logger.info(`NetBot: action=${action}, device=${deviceId}, query="${query}"`);

        switch (action) {
            case "adb_youtube": return this._adbOpenYouTube(deviceId, query);
            case "adb_volume": return this._adbSetVolume(deviceId, value);
            case "adb_screenshot": return this._adbScreenshot(deviceId);
            case "adb_home": return this._adbKeyEvent(deviceId, 3);    // HOME
            case "adb_back": return this._adbKeyEvent(deviceId, 4);    // BACK
            case "adb_wakeup": return this._adbKeyEvent(deviceId, 224);  // POWER
            case "adb_open_app": return this._adbOpenApp(deviceId, query);
            case "adb_input_text": return this._adbInputText(deviceId, query);
            case "wol": return this._wakeOnLan(deviceId);
            case "ping": return this._pingDevice(deviceId);
            default:
                throw new Error(`NetBot: unknown action "${action}"`);
        }
    }

    /* =========================
       ADB HELPERS
    ========================= */

    async _adbCommand(deviceId, command) {
        const device = this.getDevice(deviceId);

        if (!["android_phone", "android_tv"].includes(device.type)) {
            throw new Error(`ADB not supported for device type: ${device.type}`);
        }

        // Check ADB availability first
        const adbOk = await this.isAdbAvailable();
        if (!adbOk) {
            throw new Error(this._getAdbNotFoundMessage());
        }

        const target = `${device.ip}:${device.adb_port || 5555}`;
        const connect = `${this.adbExe} connect ${target}`;

        // Try connect first (silently)
        await this._execCommand(connect).catch(() => { });

        const fullCmd = `${this.adbExe} -s ${target} ${command}`;
        logger.info(`NetBot ADB → ${device.name}: ${command.substring(0, 80)}`);

        return this._execCommand(fullCmd);
    }

    async _adbOpenYouTube(deviceId, query) {
        const encodedQuery = encodeURIComponent(query || "");
        const url = query
            ? `https://www.youtube.com/results?search_query=${encodedQuery}`
            : "https://www.youtube.com";

        const cmd = `shell am start -a android.intent.action.VIEW -d "${url}"`;
        await this._adbCommand(deviceId, cmd);
        return `✅ YouTube abierto en ${deviceId}${query ? ` | búsqueda: "${query}"` : ""}`;
    }

    async _adbSetVolume(deviceId, level) {
        const vol = Math.max(0, Math.min(15, parseInt(level) || 8));
        const cmd = `shell media volume --stream 3 --set ${vol}`;
        await this._adbCommand(deviceId, cmd);
        return `✅ Volumen de ${deviceId} ajustado a ${vol}/15`;
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
        const cmd = `shell input keyevent ${keyCode}`;
        await this._adbCommand(deviceId, cmd);
        return `✅ KeyEvent ${keyCode} enviado a ${deviceId}`;
    }

    async _adbOpenApp(deviceId, packageName) {
        const cmd = `shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
        await this._adbCommand(deviceId, cmd);
        return `✅ App "${packageName}" abierta en ${deviceId}`;
    }

    async _adbInputText(deviceId, text) {
        const safeText = text.replace(/\s+/g, "%s").replace(/[^a-zA-Z0-9%+]/g, "");
        const cmd = `shell input text "${safeText}"`;
        await this._adbCommand(deviceId, cmd);
        return `✅ Texto ingresado en ${deviceId}`;
    }

    /* =========================
       WAKE-ON-LAN
    ========================= */

    async _wakeOnLan(deviceId) {
        const device = this.getDevice(deviceId);

        if (!device.mac) {
            throw new Error(`Device "${deviceId}" has no MAC address configured`);
        }

        const mac = device.mac.replace(/[:-]/g, "").match(/.{2}/g).join(":");
        const cmd = `powershell -command "function Send-WOL { param([string]$mac); $broadcast = [Net.IPAddress]::Broadcast; $client = New-Object Net.Sockets.UdpClient; $client.Connect($broadcast, 9); $macBytes = $mac.Split(':') | ForEach-Object { [Convert]::ToByte($_, 16) }; $payload = @(,0xFF * 6) + ($macBytes * 16); $client.Send($payload, $payload.Length) | Out-Null }; Send-WOL '${mac}'"`;

        await this._execCommand(cmd);
        return `✅ Magic packet enviado a ${device.name} (${device.mac})`;
    }

    /* =========================
       PING
    ========================= */

    async _pingDevice(deviceId) {
        const device = this.getDevice(deviceId);
        const cmd = process.platform === "win32"
            ? `ping -n 1 -w 1000 ${device.ip}`
            : `ping -c 1 -W 1 ${device.ip}`;

        try {
            await this._execCommand(cmd);
            return `✅ ${device.name} (${device.ip}) está en línea`;
        } catch {
            return `❌ ${device.name} (${device.ip}) no responde`;
        }
    }

    /* =========================
       EXEC HELPER
    ========================= */

    _execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, { timeout: 20000 }, (error, stdout, stderr) => {
                if (error) {
                    // Enrich ADB not found error
                    const msg = stderr?.trim() || error.message;
                    if (msg.includes("no se reconoce") || msg.includes("not recognized") || msg.includes("command not found")) {
                        reject(new Error(this._getAdbNotFoundMessage()));
                    } else {
                        reject(new Error(msg));
                    }
                    return;
                }
                resolve(stdout?.trim() || "");
            });
        });
    }
}

module.exports = NetBot;