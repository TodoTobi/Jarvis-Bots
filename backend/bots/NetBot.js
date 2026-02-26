/**
 * NetBot.js — Controls devices on the local network
 *
 * Supports:
 *  - Android phones & Android TV via ADB over WiFi
 *  - Wake-on-LAN for any device
 *  - (future) Samsung/LG TV APIs
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
        logger.info("NetBot: device list reloaded");
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
            case "adb_youtube":
                return this._adbOpenYouTube(deviceId, query);

            case "adb_volume":
                return this._adbSetVolume(deviceId, value);

            case "adb_screenshot":
                return this._adbScreenshot(deviceId);

            case "adb_home":
                return this._adbKeyEvent(deviceId, 3); // HOME key

            case "adb_back":
                return this._adbKeyEvent(deviceId, 4); // BACK key

            case "adb_wakeup":
                return this._adbKeyEvent(deviceId, 224); // POWER/WAKEUP

            case "adb_open_app":
                return this._adbOpenApp(deviceId, query);

            case "adb_input_text":
                return this._adbInputText(deviceId, query);

            case "wol":
                return this._wakeOnLan(deviceId);

            case "ping":
                return this._pingDevice(deviceId);

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

        const target = `${device.ip}:${device.adb_port || 5555}`;

        // Try connect first (silently)
        await this._execCommand(`adb connect ${target}`).catch(() => { });

        const fullCmd = `adb -s ${target} ${command}`;
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
        // Android volume streams: 3 = media, 0-15 range
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

        // Use PowerShell WOL on Windows
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
        const cmd = `ping -n 1 -w 1000 ${device.ip}`;

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
                    reject(new Error(stderr?.trim() || error.message));
                    return;
                }
                resolve(stdout?.trim() || "");
            });
        });
    }
}

module.exports = NetBot;