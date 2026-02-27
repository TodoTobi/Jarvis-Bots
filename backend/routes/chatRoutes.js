/**
 * chatRoutes.js — Chat API
 * Uses chatController which handles intent parsing, bot execution, and Supabase persistence.
 * conversation_id is passed through so chatController appends to existing conversation
 * instead of creating a new one every message (fixes the duplicate chat bug in Supabase).
 */

const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

router.get("/health", chatController.health.bind(chatController));
router.post("/chat", chatController.handleChat.bind(chatController));

module.exports = router;