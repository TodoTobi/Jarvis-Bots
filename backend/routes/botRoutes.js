const express = require("express");
const router = express.Router();
const botManager = require("../bots/BotManager");

router.get("/bots", (req, res, next) => {
    try {
        const states = botManager.getAllStates();
        res.json(states);
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

module.exports = router;