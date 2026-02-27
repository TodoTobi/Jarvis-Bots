/**
 * chatController.js — Chat messages + Supabase persistence
 *
 * FIX: Now returns `conversationId` in the response.
 * Frontend sends it back with each subsequent message,
 * so all messages in a session go to the SAME conversation
 * instead of creating a new one per message.
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
            logger.info(`Chat request: "${trimmed.substring(0, 100)}"${conversation_id ? ` [conv:${conversation_id.slice(-6)}]` : ""}`);

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

            /* 4. Persist to Supabase and capture/reuse conversationId (non-blocking) */
            // We track the resolved convId so we can return it in the response
            let resolvedConvId = conversation_id || null;

            // Run persistence async — don't await it so we respond fast
            setImmediate(async () => {
                try {
                    await supabase.ready();

                    if (supabase.isConnected()) {
                        // REUSE existing conversation or create one (only on first message)
                        if (!resolvedConvId) {
                            const conv = await supabase.createConversation("Nueva conversación");
                            if (conv?.id) {
                                resolvedConvId = conv.id;
                                // Auto-title from the first message
                                await supabase.autoTitleConversation(resolvedConvId, trimmed);
                            }
                        } else {
                            // Update updated_at so conversation stays at top of list
                            await supabase.updateConversation(resolvedConvId, {});
                        }

                        if (resolvedConvId) {
                            await supabase.saveMessage(resolvedConvId, "user", trimmed);
                            await supabase.saveMessage(
                                resolvedConvId,
                                result.error ? "error" : "assistant",
                                result.reply || "",
                                intentObject.intent,
                                botManager._mapIntent?.(intentObject.intent) || null
                            );
                        }
                    }
                } catch (err) {
                    logger.warn(`Chat persistence error: ${err.message}`);
                }

                // Append to memory (compact log)
                try {
                    instructionLoader.appendToMemory(
                        `User: ${trimmed}\nIntent: ${intentObject.intent}\nResult: ${result.reply?.substring(0, 200) || "empty"}`
                    );
                } catch { }
            });

            // ── BUT we need conversationId in the response ──
            // Since setImmediate is async and we haven't awaited it,
            // we resolve convId synchronously when it was already provided,
            // or return null on first message (frontend will store it on next round trip).
            // Better: create conv synchronously on first message, then fire setImmediate for saving.

            // Let's do the conv creation synchronously and message saving async:
            let syncConvId = conversation_id || null;
            if (!syncConvId && supabase.isConnected()) {
                try {
                    await supabase.ready();
                    const conv = await supabase.createConversation("Nueva conversación");
                    if (conv?.id) {
                        syncConvId = conv.id;
                        // Auto-title the conversation from first message
                        supabase.autoTitleConversation(syncConvId, trimmed).catch(() => { });
                    }
                } catch (e) {
                    logger.warn(`Conv creation failed: ${e.message}`);
                }
            }

            // Save messages async (don't block response)
            if (syncConvId && supabase.isConnected()) {
                supabase.saveMessage(syncConvId, "user", trimmed).catch(() => { });
                supabase.saveMessage(
                    syncConvId,
                    result.error ? "error" : "assistant",
                    result.reply || "",
                    intentObject.intent,
                    botManager._mapIntent?.(intentObject.intent) || null
                ).catch(() => { });
                // Update conversation timestamp
                supabase.updateConversation(syncConvId, {}).catch(() => { });
            }

            // Append to memory async
            setImmediate(() => {
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
                bot: botManager._mapIntent?.(intentObject.intent) || "unknown",
                conversationId: syncConvId,   // ← KEY: return so frontend reuses it
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ChatController();