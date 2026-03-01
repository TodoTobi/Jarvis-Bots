/**
 * chatController.js — Fixed
 *
 * BUGS CORREGIDOS vs original:
 *
 * 1. conversation_id estaba dentro de setImmediate() (fire-and-forget),
 *    por eso nunca se devolvía al frontend y cada mensaje creaba un chat nuevo.
 *    FIX: la conversación se crea ANTES de responder y se incluye
 *    conversation_id en la respuesta JSON.
 *
 * 2. Cuando el modelo devuelve texto plano (no JSON), _safeParse() lo envuelve
 *    como { intent: "chat_response", parameters: { query: TEXTO_DEL_MODELO } }.
 *    Luego WebBot recibía ESA RESPUESTA como query, la re-procesaba y devolvía
 *    basura de 38 caracteres.
 *    FIX: si intent === "chat_response", forzamos query = mensaje ORIGINAL del usuario.
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

            /* 3. FIX: si el modelo devolvió texto plano (no JSON), _safeParse()
               lo convierte en { intent: "chat_response", parameters: { query: TEXTO_DEL_MODELO } }
               Si luego WebBot recibe ese texto como query, vuelve a llamar al modelo con su
               propia respuesta → loop que devuelve basura.
               Solución: si el intent es chat_response, forzamos query = mensaje ORIGINAL. */
            if (
                intentObject.intent === "chat_response" ||
                intentObject.intent.startsWith("chat_") ||
                intentObject.intent === "talk_jarvis"
            ) {
                intentObject.parameters = {
                    ...intentObject.parameters,
                    query: trimmed  // siempre el mensaje ORIGINAL del usuario
                };
            }

            /* 4. Execute via BotManager */
            const result = await botManager.executeIntent(intentObject);

            /* 5. Persist to Supabase — ahora SÍNCRONO para poder devolver el conversation_id */
            let convId = conversation_id || null;

            try {
                if (supabase.isConnected()) {
                    // Crear conversación nueva si no se pasó una
                    if (!convId) {
                        const conv = await supabase.createConversation("Nueva conversación");
                        if (conv) {
                            convId = conv.id;
                            // Auto-titular con el primer mensaje
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
            } catch (err) {
                logger.warn(`Chat persistence error: ${err.message}`);
            }

            // Append to memory (non-blocking)
            setImmediate(() => {
                try {
                    instructionLoader.appendToMemory(
                        `User: ${trimmed}\nIntent: ${intentObject.intent}\nResult: ${result.reply?.substring(0, 200) || "empty"}`
                    );
                } catch { }
            });

            /* 6. Responder — INCLUYE conversation_id para que el frontend lo guarde */
            return res.json({
                success: !result.error,
                reply: result.reply,
                intent: intentObject.intent,
                bot: botManager._mapIntent?.(intentObject.intent) || "unknown",
                conversation_id: convId   // ← el frontend necesita esto para el tracking
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ChatController();