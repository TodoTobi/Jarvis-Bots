/**
 * ModelService.js — Communication layer with LM Studio (LLaMA 13B)
 *
 * FIX: Removed response_format: { type: "json_object" } — many models
 *      don't support it and return HTTP 400. JSON is enforced via the prompt instead.
 */

const axios = require("axios");
const logger = require("../logs/logger");

class ModelService {
    constructor() {
        this.baseURL = process.env.LM_API_URL;
        this.apiKey = process.env.LM_API_TOKEN;
        this.model = process.env.LM_MODEL || "local-model";

        if (!this.baseURL) {
            throw new Error("LM_API_URL not defined in .env");
        }

        this._axiosConfig = {
            headers: {
                "Content-Type": "application/json",
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            timeout: 90000
        };
    }

    /* =========================
       GENERATE INTENT
    ========================= */

    async generateIntent(fullContext) {
        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        {
                            role: "system",
                            content: [
                                "Eres el orquestador de JarvisCore, un sistema de control local modular.",
                                "Tu ÚNICA tarea es analizar la instrucción del usuario y devolver un JSON con la intención y parámetros.",
                                "",
                                "REGLA ABSOLUTA: Responde ÚNICAMENTE con JSON válido. Sin explicaciones. Sin markdown. Sin texto antes o después.",
                                "Si no sabes qué intent usar, devuelve: {\"intent\":\"chat_response\",\"parameters\":{\"query\":\"[repite el mensaje del usuario]\"},\"priority\":\"normal\"}",
                                "",
                                "Estructura obligatoria:",
                                "{\"intent\": \"string\", \"parameters\": {}, \"priority\": \"low|normal|high\"}",
                                "",
                                "EJEMPLOS (sigue este patrón exactamente):",
                                "- 'poneme música de youtube' → {\"intent\":\"media_play_youtube\",\"parameters\":{\"query\":\"musica\"},\"priority\":\"normal\"}",
                                "- 'subí el volumen' → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"volume_up\"},\"priority\":\"normal\"}",
                                "- 'abrí youtube en la tele' → {\"intent\":\"net_adb_youtube\",\"parameters\":{\"action\":\"adb_youtube\",\"device\":\"tv_living\",\"query\":\"\"},\"priority\":\"normal\"}",
                                "- 'bloqueá la pantalla' → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"system_lock\"},\"priority\":\"normal\"}",
                                "- 'hola cómo estás' → {\"intent\":\"chat_response\",\"parameters\":{\"query\":\"hola cómo estás\"},\"priority\":\"normal\"}",
                                "- 'abrí Discord' → {\"intent\":\"bat_exec\",\"parameters\":{\"script\":\"app_discord\"},\"priority\":\"normal\"}"
                            ].join("\n")
                        },
                        {
                            role: "user",
                            content: fullContext.replace(/```/g, "").trim()
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 256
                    // ✅ NO response_format — not all models support it, causes HTTP 400
                },
                this._axiosConfig
            );

            const raw = response.data?.choices?.[0]?.message?.content;

            if (!raw) throw new Error("Empty response from model");

            logger.info(`ModelService raw response: ${raw.substring(0, 200)}`);

            const parsed = this._safeParse(raw);
            return this._validateIntent(parsed);

        } catch (error) {
            logger.error(`ModelService generateIntent: ${error.message}`);
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
                {
                    model: this.model,
                    messages: [
                        {
                            role: "system",
                            content: "Eres Jarvis, un asistente de IA local inteligente y directo. Respondé de forma clara y concisa en el idioma del usuario. Evitá respuestas largas a menos que sea necesario."
                        },
                        {
                            role: "user",
                            content: prompt.replace(/```/g, "").trim()
                        }
                    ],
                    temperature: 0.5,
                    max_tokens: 1024
                },
                this._axiosConfig
            );

            const text = response.data?.choices?.[0]?.message?.content || "";

            if (!text) throw new Error("Empty text response from model");

            return text.trim();

        } catch (error) {
            logger.error(`ModelService generateText: ${error.message}`);
            throw new Error(`Error al generar respuesta: ${error.message}`);
        }
    }

    /* =========================
       HELPERS
    ========================= */

    _safeParse(raw) {
        try {
            // Remove any markdown code fences or extra text before/after JSON
            let cleaned = raw.trim();

            // Strip ```json ... ``` or ``` ... ```
            cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

            // Try to extract JSON object if there's text around it
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleaned = jsonMatch[0];
            }

            return JSON.parse(cleaned);
        } catch {
            logger.warn(`ModelService: invalid JSON from model: ${raw.substring(0, 200)}`);
            // If the model returned plain text instead of JSON, treat it as a chat response
            return {
                intent: "chat_response",
                parameters: { query: raw.trim() },
                priority: "normal"
            };
        }
    }

    _validateIntent(obj) {
        if (!obj || typeof obj !== "object") {
            return this._errorIntent("Intent is not an object");
        }

        const intent = typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : null;

        if (!intent) {
            return this._errorIntent("Missing intent field");
        }

        return {
            intent,
            parameters: (obj.parameters && typeof obj.parameters === "object") ? obj.parameters : {},
            priority: ["low", "normal", "high"].includes(obj.priority) ? obj.priority : "normal",
            notes: obj.notes || null
        };
    }

    _errorIntent(reason, notes = null) {
        return {
            intent: "error",
            parameters: { reason },
            priority: "normal",
            notes
        };
    }
}

module.exports = new ModelService();