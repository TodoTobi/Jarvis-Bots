/**
 * ModelService.js — v3 FIXED
 * FIX: removes response_format (causes 400), trims context, forces Spanish
 */

const axios = require("axios");
const logger = require("../logs/logger");

const MAX_CONTEXT_CHARS = 2000; // keep context small for local models

class ModelService {
    constructor() {
        this.baseURL = (process.env.LM_API_URL || "").replace(/\/$/, "");
        this.apiKey = process.env.LM_API_TOKEN || "";
        this.model = process.env.LM_MODEL || "";

        if (!this.baseURL) throw new Error("LM_API_URL not defined in .env");

        this._axiosConfig = {
            headers: {
                "Content-Type": "application/json",
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            timeout: 90000
        };

        this._checkConnection().catch(() => { });
    }

    async _checkConnection() {
        try {
            const res = await axios.get(`${this.baseURL}/models`, {
                ...this._axiosConfig, timeout: 5000
            });
            const models = res.data?.data || [];
            if (models.length > 0) {
                logger.info(`ModelService: LM Studio connected. Loaded models: ${models.map(m => m.id).join(", ")}`);
            } else {
                logger.warn("ModelService: LM Studio running but no models loaded.");
            }
        } catch (err) {
            logger.error(`ModelService: Cannot reach LM Studio — ${err.message}`);
        }
    }

    _buildBody(messages, opts = {}) {
        // NO response_format — causes 400 on most local models
        const body = {
            messages,
            temperature: opts.temperature ?? 0.1,
            max_tokens: opts.max_tokens ?? 300,
        };
        if (this.model) body.model = this.model;
        return body;
    }

    async generateIntent(fullContext) {
        // Compact system prompt — local models can't handle massive contexts
        const systemPrompt = [
            "Eres el orquestador de JarvisCore. RESPONDE SOLO con un JSON válido, sin texto adicional.",
            "",
            "Formato: {\"intent\":\"nombre\",\"parameters\":{},\"priority\":\"normal\"}",
            "",
            "Intents disponibles:",
            "- Conversación/pregunta → {\"intent\":\"chat_response\",\"parameters\":{\"query\":\"[mensaje]\"},\"priority\":\"normal\"}",
            "- Subir volumen → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"volume_up\"},\"priority\":\"normal\"}",
            "- Bajar volumen → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"volume_down\"},\"priority\":\"normal\"}",
            "- YouTube PC → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"media_youtube\",\"query\":\"[búsqueda]\"},\"priority\":\"normal\"}",
            "- Spotify → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"media_spotify\"},\"priority\":\"normal\"}",
            "- Bloquear PC → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"system_lock\"},\"priority\":\"normal\"}",
            "- Screenshot → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"system_screenshot\"},\"priority\":\"normal\"}",
            "- Discord → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"app_discord\"},\"priority\":\"normal\"}",
            "- VS Code → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"app_vscode\"},\"priority\":\"normal\"}",
            "- Control PC → {\"intent\":\"computer_control\",\"parameters\":{\"task\":\"[tarea]\"},\"priority\":\"high\"}",
        ].join("\n");

        // Trim context to avoid token overflow
        const trimmedContext = fullContext.length > MAX_CONTEXT_CHARS
            ? fullContext.slice(-MAX_CONTEXT_CHARS)
            : fullContext;

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: trimmedContext.replace(/```/g, "").trim() }
                ], { temperature: 0.1, max_tokens: 200 }),
                this._axiosConfig
            );

            const raw = response.data?.choices?.[0]?.message?.content;
            if (!raw) throw new Error("Empty response from model");

            logger.info(`ModelService raw: ${raw.substring(0, 120)}`);
            const parsed = this._safeParse(raw);
            return this._validateIntent(parsed);

        } catch (error) {
            if (error.response) {
                logger.error(`ModelService generateIntent HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 300)}`);
            } else {
                logger.error(`ModelService generateIntent: ${error.message}`);
            }
            return this._errorIntent("Model communication failure", error.message);
        }
    }

    async generateText(prompt) {
        // Always force Spanish in generateText
        const systemPrompt = "Eres Jarvis, un asistente IA local. Responde SIEMPRE en español de Argentina. Sé directo y claro.";

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt.replace(/```/g, "").trim().substring(0, 3000) }
                ], { temperature: 0.5, max_tokens: 1024 }),
                this._axiosConfig
            );

            const text = response.data?.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty text response from model");
            return text.trim();

        } catch (error) {
            if (error.response) {
                logger.error(`ModelService generateText HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 300)}`);
            } else {
                logger.error(`ModelService generateText: ${error.message}`);
            }
            throw new Error(`Error al generar respuesta: ${error.message}`);
        }
    }

    _safeParse(raw) {
        try {
            let cleaned = raw.trim()
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();

            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) cleaned = match[0];

            return JSON.parse(cleaned);
        } catch {
            logger.warn(`ModelService: non-JSON response, treating as chat: ${raw.substring(0, 80)}`);
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