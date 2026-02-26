/**
 * chatController.js — Handles chat messages
 * Orchestrates: message → model → intent → bot → response
 */

const instructionLoader = require("../utils/InstructionLoader");
const modelService = require("../services/ModelService");
const botManager = require("../bots/BotManager");
const logger = require("../logs/logger");

class ChatController {

    health(req, res) {
        res.json({
            status: "OK",
            timestamp: new Date().toISOString(),
            bots: botManager.getAllStates().length
        });
    }

    async handleChat(req, res, next) {
        try {
            const { message } = req.body;

            if (!message || typeof message !== "string" || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    error: "El mensaje no puede estar vacío"
                });
            }

            const trimmed = message.trim();
            logger.info(`Chat request: "${trimmed.substring(0, 100)}"`);

            /* 1. Build full context */
            const fullContext = instructionLoader.buildFullContext(trimmed);

            /* 2. Get intent from model */
            const intentObject = await modelService.generateIntent(fullContext);

            if (!intentObject?.intent) {
                throw new Error("Invalid intent structure from model");
            }

            logger.info(`Intent resolved: ${intentObject.intent}`);

            /* 3. Execute via BotManager */
            const result = await botManager.executeIntent(intentObject);

            /* 4. Persist to memory (non-blocking) */
            setImmediate(() => {
                try {
                    instructionLoader.appendToMemory(
                        `User: ${trimmed}\nIntent: ${intentObject.intent}\nResult: ${result.reply?.substring(0, 300) || "empty"}`
                    );
                } catch { }
            });

            return res.json({
                success: !result.error,
                reply: result.reply,
                intent: intentObject.intent,
                bot: botManager._mapIntent?.(intentObject.intent) || "unknown"
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ChatController();