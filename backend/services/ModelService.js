/**
 * ModelService.js — LM Studio communication layer
 *
 * FIX v2:
 *  - Logs the FULL error response body so you can see exactly what LM Studio complains about
 *  - Removes response_format (causes 400 on most models)
 *  - Omits the "model" field if LM_MODEL is not set (LM Studio uses whatever is loaded)
 *  - Extracts JSON from model response even when surrounded by markdown/text
 *  - Adds /v1/models health check on startup to verify connection
 */

const axios = require("axios");
const logger = require("../logs/logger");

class ModelService {
    constructor() {
        this.baseURL = (process.env.LM_API_URL || "").replace(/\/$/, "");
        this.apiKey = process.env.LM_API_TOKEN || "";
        this.model = process.env.LM_MODEL || "";  // empty = let LM Studio pick

        if (!this.baseURL) throw new Error("LM_API_URL not defined in .env");

        this._axiosConfig = {
            headers: {
                "Content-Type": "application/json",
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            timeout: 90000
        };

        // Verify connection on startup (non-blocking)
        this._checkConnection().catch(() => { });
    }

    /* =========================
       STARTUP HEALTH CHECK
    ========================= */

    async _checkConnection() {
        try {
            const res = await axios.get(`${this.baseURL}/models`, {
                ...this._axiosConfig,
                timeout: 5000
            });
            const models = res.data?.data || [];
            if (models.length > 0) {
                logger.info(`ModelService: LM Studio connected. Loaded models: ${models.map(m => m.id).join(", ")}`);
                if (this.model && !models.find(m => m.id === this.model)) {
                    logger.warn(`ModelService: WARNING — LM_MODEL="${this.model}" not found in LM Studio. Check your .env and LM Studio loaded models.`);
                    logger.warn(`ModelService: Available: ${models.map(m => m.id).join(", ")}`);
                }
            } else {
                logger.warn("ModelService: LM Studio is running but no models are loaded. Load a model in LM Studio.");
            }
        } catch (err) {
            logger.error(`ModelService: Cannot reach LM Studio at ${this.baseURL} — ${err.message}`);
            logger.error("ModelService: Make sure LM Studio is running and the server is started in the Developer tab.");
        }
    }

    /* =========================
       BUILD REQUEST BODY
    ========================= */

    _buildBody(messages, opts = {}) {
        const body = {
            messages,
            temperature: opts.temperature ?? 0.1,
            max_tokens: opts.max_tokens ?? 300,
        };
        // Only include model field if explicitly configured — avoids 400 on some LM Studio versions
        if (this.model) body.model = this.model;
        return body;
    }

    /* =========================
       GENERATE INTENT
    ========================= */

    async generateIntent(fullContext) {
        const systemPrompt = [
            "Eres el orquestador de JarvisCore.",
            "Tu ÚNICA salida es un objeto JSON válido. Sin explicaciones. Sin markdown. Sin texto antes o después del JSON.",
            "",
            "Formato obligatorio: {\"intent\": \"string\", \"parameters\": {}, \"priority\": \"normal\"}",
            "",
            "Reglas de intent:",
            "- Conversación / preguntas → {\"intent\":\"chat_response\",\"parameters\":{\"query\":\"[mensaje]\"},\"priority\":\"normal\"}",
            "- Subir volumen → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"volume_up\"},\"priority\":\"normal\"}",
            "- Bajar volumen → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"volume_down\"},\"priority\":\"normal\"}",
            "- YouTube en PC → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"media_youtube\",\"query\":\"[búsqueda]\"},\"priority\":\"normal\"}",
            "- YouTube en TV → {\"intent\":\"net_cmd\",\"parameters\":{\"action\":\"adb_youtube\",\"device\":\"tv_living\",\"query\":\"[búsqueda]\"},\"priority\":\"normal\"}",
            "- Spotify → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"media_spotify\"},\"priority\":\"normal\"}",
            "- Bloquear PC → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"system_lock\"},\"priority\":\"normal\"}",
            "- Screenshot → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"system_screenshot\"},\"priority\":\"normal\"}",
            "- Abrir Discord → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"app_discord\"},\"priority\":\"normal\"}",
            "- Abrir VS Code → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"app_vscode\"},\"priority\":\"normal\"}",
            "- Control de PC (clicks, automatización) → {\"intent\":\"computer_control\",\"parameters\":{\"task\":\"[descripción exacta de la tarea]\"},\"priority\":\"high\"}",
            "- Leer PDF/imagen/audio → {\"intent\":\"vision_analyze\",\"parameters\":{\"query\":\"[qué analizar]\"},\"priority\":\"normal\"}"
        ].join("\n");

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: fullContext.replace(/```/g, "").trim() }
                ], { temperature: 0.1, max_tokens: 300 }),
                this._axiosConfig
            );

            const raw = response.data?.choices?.[0]?.message?.content;
            if (!raw) throw new Error("Empty response from model");

            logger.info(`ModelService raw: ${raw.substring(0, 150)}`);
            const parsed = this._safeParse(raw);
            return this._validateIntent(parsed);

        } catch (error) {
            // ── Log the FULL error so user can diagnose ──
            if (error.response) {
                logger.error(`ModelService generateIntent HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 400)}`);
                logger.error(`ModelService hint: If you see "model not found" → check LM_MODEL in .env matches exactly the model name in LM Studio.`);
                logger.error(`ModelService hint: If you see "invalid request" → the model may not support some params. Model field sent: "${this.model || "(none)"}"`);
            } else {
                logger.error(`ModelService generateIntent: ${error.message}`);
            }
            return this._errorIntent("Model communication failure", error.message);
        }
    }

    /* =========================
       GENERATE TEXT (free-form)
    ========================= */

    async generateText(prompt) {
        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody([
                    { role: "system", content: "Sos Jarvis, un asistente IA local. Respondé de forma directa y clara en el idioma del usuario." },
                    { role: "user", content: prompt.replace(/```/g, "").trim() }
                ], { temperature: 0.5, max_tokens: 1024 }),
                this._axiosConfig
            );

            const text = response.data?.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty text response from model");
            return text.trim();

        } catch (error) {
            if (error.response) {
                logger.error(`ModelService generateText HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 400)}`);
            } else {
                logger.error(`ModelService generateText: ${error.message}`);
            }
            throw new Error(`Error al generar respuesta: ${error.message}`);
        }
    }

    /* =========================
       HELPERS
    ========================= */

    _safeParse(raw) {
        try {
            let cleaned = raw.trim()
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();

            // Extract first JSON object found
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) cleaned = match[0];

            return JSON.parse(cleaned);
        } catch {
            logger.warn(`ModelService: non-JSON response, treating as chat: ${raw.substring(0, 100)}`);
            return { intent: "chat_response", parameters: { query: raw.trim() }, priority: "normal" };
        }
    }

    _validateIntent(obj) {
        if (!obj || typeof obj !== "object") return this._errorIntent("Intent is not an object");
        const intent = typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : null;
        if (!intent) return this._errorIntent("Missing intent field");
        return {
            intent,
            parameters: (obj.parameters && typeof obj.parameters === "object") ? obj.parameters : {},
            priority: ["low", "normal", "high"].includes(obj.priority) ? obj.priority : "normal",
            notes: obj.notes || null
        };
    }

    _errorIntent(reason, notes = null) {
        return { intent: "error", parameters: { reason }, priority: "normal", notes };
    }
}

module.exports = new ModelService();