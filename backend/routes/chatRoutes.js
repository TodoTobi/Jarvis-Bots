const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

router.get("/health", chatController.health);
router.post("/chat", chatController.handleChat);

module.exports = router;