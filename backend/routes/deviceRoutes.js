const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/deviceController");

router.get("/devices", deviceController.getDevices);
router.get("/devices/reload", deviceController.reloadDevices);
router.get("/device/:deviceId/ping", deviceController.pingDevice);
router.post("/device/:deviceId/command", deviceController.sendCommand);

module.exports = router;