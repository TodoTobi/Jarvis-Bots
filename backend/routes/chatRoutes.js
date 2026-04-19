const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

router.post("/chat", chatController.handleChat);

router.get("/health", chatController.health);

module.exports = router;