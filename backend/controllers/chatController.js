/**
 * chatController.js — Handles chat messages + Supabase persistence
 */

const instructionLoader = require("../utils/InstructionLoader");
const modelService = require("../services/ModelService");
const botManager = require("../bots/BotManager");
const supabase = require("../services/SupabaseService");
const logger = require("../logs/logger");

class ChatController {

    health(req, res) {
        res.json({
            status: "OK",
            timestamp: new Date().toISOString(),
            bots: botManager.getAllStates().length,
            supabase: supabase.isConnected()
        });
    }

    async handleChat(req, res, next) {
        try {
            const { message, conversation_id } = req.body;

            if (!message || typeof message !== "string" || !message.trim()) {
                return res.status(400).json({ success: false, error: "El mensaje no puede estar vacío" });
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

            /* 4. Persist to Supabase (non-blocking) */
            setImmediate(async () => {
                try {
                    // Auto-create conversation if not provided
                    let convId = conversation_id;
                    if (!convId && supabase.isConnected()) {
                        const conv = await supabase.createConversation("Nueva conversación");
                        if (conv) {
                            convId = conv.id;
                            // Auto-title from first message
                            await supabase.autoTitleConversation(convId, trimmed);
                        }
                    }

                    if (convId && supabase.isConnected()) {
                        await supabase.saveMessage(convId, "user", trimmed);
                        await supabase.saveMessage(
                            convId,
                            result.error ? "error" : "assistant",
                            result.reply || "",
                            intentObject.intent,
                            botManager._mapIntent?.(intentObject.intent) || null
                        );
                    }
                } catch (err) {
                    logger.warn(`Chat persistence error: ${err.message}`);
                }

                // Also append to memory
                try {
                    instructionLoader.appendToMemory(
                        `User: ${trimmed}\nIntent: ${intentObject.intent}\nResult: ${result.reply?.substring(0, 200) || "empty"}`
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