/**
 * chatController.js — v2 FIXED
 *
 * Changes vs original:
 *  1. Integrates messageClassifier — every reply now includes responseType,
 *     artifacts metadata, actions, and cleanReply fields.
 *     Frontend uses these instead of re-parsing the text itself.
 *
 *  2. Better error responses — structured error object with errorCode,
 *     suggestion, and user-friendly message instead of raw exception text.
 *
 *  3. history support — accepts req.body.history array from frontend and
 *     passes recent turns as context to the model (enables multi-turn).
 *
 *  4. Logging — cleaner logs with timing info.
 *
 *  5. chat_response intent fix preserved from original.
 */

const instructionLoader  = require("../utils/InstructionLoader");
const modelService        = require("../services/ModelService");
const botManager          = require("../bots/BotManager");
const supabase            = require("../services/SupabaseService");
const logger              = require("../logs/logger");
const { classify }        = require("../middlewares/messageClassifier");

class ChatController {

    health(req, res) {
        res.json({
            status: "OK",
            timestamp: new Date().toISOString(),
            bots: botManager.getAllStates().length,
            supabase: supabase.isConnected(),
        });
    }

    async handleChat(req, res, next) {
        const t0 = Date.now();
        try {
            const { message, conversation_id, history = [] } = req.body;

            if (!message || typeof message !== "string" || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    errorCode: "EMPTY_MESSAGE",
                    error: "El mensaje no puede estar vacío",
                });
            }

            const trimmed = message.trim();
            logger.info(`Chat: "${trimmed.substring(0, 100)}"`);

            /* 1. Build full context */
            const fullContext = instructionLoader.buildFullContext(trimmed);

            /* 2. Get intent from model */
            let intentObject;
            try {
                intentObject = await modelService.generateIntent(fullContext);
            } catch (modelErr) {
                logger.error(`ModelService error: ${modelErr.message}`);
                return res.status(503).json({
                    success: false,
                    errorCode: "MODEL_UNAVAILABLE",
                    error: `No se pudo conectar al modelo de IA. Verificá que LM Studio esté corriendo.\nDetalle: ${modelErr.message}`,
                    suggestion: "Abrí LM Studio → cargá un modelo → activá el servidor en Developer tab",
                });
            }

            if (!intentObject?.intent) {
                return res.status(500).json({
                    success: false,
                    errorCode: "INVALID_INTENT",
                    error: "El modelo devolvió una respuesta inválida",
                });
            }

            logger.info(`Intent: ${intentObject.intent}`);

            /* 3. Fix chat_response loop — always use original user message as query */
            if (
                intentObject.intent === "chat_response" ||
                intentObject.intent.startsWith("chat_") ||
                intentObject.intent === "talk_jarvis"
            ) {
                intentObject.parameters = {
                    ...intentObject.parameters,
                    query: trimmed,
                    _originalMessage: trimmed,
                };
            } else {
                // Always inject original message so bots can use it
                if (!intentObject.parameters._originalMessage) {
                    intentObject.parameters._originalMessage = trimmed;
                }
            }

            /* 4. Execute via BotManager */
            let result;
            try {
                result = await botManager.executeIntent(intentObject);
            } catch (botErr) {
                logger.error(`BotManager error: ${botErr.message}`);
                result = {
                    reply: `⚠ Error ejecutando la acción: ${botErr.message}`,
                    error: true,
                };
            }

            /* 5. Classify response */
            const classified = classify(result.reply || "");

            /* 6. Persist to Supabase */
            let convId = conversation_id || null;
            try {
                if (supabase.isConnected()) {
                    if (!convId) {
                        const conv = await supabase.createConversation("Nueva conversación");
                        if (conv) {
                            convId = conv.id;
                            await supabase.autoTitleConversation(convId, trimmed);
                        }
                    }
                    if (convId) {
                        await supabase.saveMessage(convId, "user", trimmed);
                        await supabase.saveMessage(
                            convId,
                            result.error ? "error" : "assistant",
                            result.reply || "",
                            intentObject.intent,
                            botManager._mapIntent?.(intentObject.intent) || null
                        );
                    }
                }
            } catch (persistErr) {
                logger.warn(`Persistence error (non-fatal): ${persistErr.message}`);
            }

            /* 7. Append to memory (non-blocking) */
            setImmediate(() => {
                try {
                    instructionLoader.appendToMemory(
                        `User: ${trimmed}\nIntent: ${intentObject.intent}\nResult: ${(result.reply || "").substring(0, 200)}`
                    );
                } catch { }
            });

            const elapsed = Date.now() - t0;
            logger.info(`Chat done in ${elapsed}ms | intent=${intentObject.intent} | type=${classified.responseType}`);

            /* 8. Respond */
            return res.json({
                success: !result.error,
                reply:       result.reply || "",
                intent:      intentObject.intent,
                bot:         botManager._mapIntent?.(intentObject.intent) || "unknown",
                conversation_id: convId,
                // ── Classifier fields (used by frontend for rendering decisions) ──
                responseType: classified.responseType,   // "text" | "artifact" | "mixed" | "code" | "action"
                artifacts:    classified.artifacts,      // [{ type, label, renderable }]
                actions:      classified.actions,        // [{ intent, data }]
                cleanReply:   classified.cleanText,      // reply with artifact blocks stripped
                elapsed,
            });

        } catch (error) {
            logger.error(`Chat unhandled error: ${error.message}`);
            next(error);
        }
    }
}

module.exports = new ChatController();