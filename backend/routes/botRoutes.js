const express = require("express");
const router = express.Router();
const botManager = require("../bots/BotManager");

router.get("/bots", (req, res, next) => {
    try {
        res.json(botManager.getAllStates());
    } catch (err) {
        next(err);
    }
});

router.post("/bot/:name/activate", (req, res, next) => {
    try {
        botManager.activateBot(req.params.name);
        res.json({ success: true, message: `${req.params.name} activated` });
    } catch (err) {
        next(err);
    }
});

router.post("/bot/:name/deactivate", (req, res, next) => {
    try {
        botManager.deactivateBot(req.params.name);
        res.json({ success: true, message: `${req.params.name} deactivated` });
    } catch (err) {
        next(err);
    }
});

// List all available .bat scripts
router.get("/scripts", (req, res, next) => {
    try {
        const batBot = botManager.bots["BatBot"];
        if (!batBot) return res.json([]);
        res.json(batBot.getAvailableScripts());
    } catch (err) {
        next(err);
    }
});

// Execute a script directly (for manual testing)
router.post("/script/run", async (req, res, next) => {
    try {
        const { script, args } = req.body;
        if (!script) return res.status(400).json({ error: "script key required" });

        if (!botManager.isBotActive("BatBot")) {
            botManager.activateBot("BatBot");
        }

        const result = await botManager.executeIntent({
            intent: "bat_exec",
            parameters: { script, args: args || [] }
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;