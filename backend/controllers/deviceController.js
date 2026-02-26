/**
 * deviceController.js — API endpoints for network device management
 */

const botManager = require("../bots/BotManager");
const logger = require("../logs/logger");

class DeviceController {

    getDevices(req, res, next) {
        try {
            const netBot = botManager.bots["NetBot"];
            if (!netBot) {
                return res.json({ devices: [] });
            }
            return res.json({ devices: netBot.getDeviceList() });
        } catch (err) {
            next(err);
        }
    }

    async pingDevice(req, res, next) {
        try {
            const { deviceId } = req.params;
            const netBot = botManager.bots["NetBot"];

            if (!netBot) throw new Error("NetBot not available");

            const result = await netBot.run({ action: "ping", device: deviceId });

            return res.json({ success: true, result });
        } catch (err) {
            next(err);
        }
    }

    async sendCommand(req, res, next) {
        try {
            const { deviceId } = req.params;
            const { action, query, value } = req.body;

            if (!action) {
                return res.status(400).json({ success: false, error: "action is required" });
            }

            // Ensure NetBot is active
            if (!botManager.isBotActive("NetBot")) {
                botManager.activateBot("NetBot");
            }

            const result = await botManager.executeIntent({
                intent: `net_${action}`,
                parameters: { action, device: deviceId, query, value }
            });

            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    reloadDevices(req, res, next) {
        try {
            const netBot = botManager.bots["NetBot"];
            if (netBot) {
                netBot.reloadDevices();
            }
            return res.json({ success: true, message: "Devices reloaded" });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new DeviceController();