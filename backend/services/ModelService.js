/**
 * ModelService.js — Communication layer with LM Studio (LLaMA 13B)
 *
 * Two modes:
 *  1. generateIntent(context) → parses JSON intent from model
 *  2. generateText(prompt)   → free-form text response
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
                                "Tu única tarea es analizar la instrucción del usuario y devolver un JSON con la intención y parámetros.",
                                "IMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin explicaciones. Sin markdown. Sin comillas de código.",
                                "",
                                "Estructura obligatoria:",
                                '{"intent": "string", "parameters": {}, "priority": "low|normal|high", "notes": "opcional"}',
                                "",
                                "Para ejecutar scripts .bat usa intent con prefijo bat_ y parameters.script con el key del script.",
                                "Para media usa prefijo media_ con parameters.intent y parameters.query.",
                                "Para dispositivos de red usa prefijo net_ con parameters.action y parameters.device.",
                                "Para conversación general usa chat_response con parameters.query = pregunta del usuario."
                            ].join("\n")
                        },
                        {
                            role: "user",
                            content: fullContext.replace(/```/g, "").trim()
                        }
                    ],
                    temperature: 0.2,
                    max_tokens: 300,
                    response_format: { type: "json_object" }
                },
                this._axiosConfig
            );

            const raw = response.data?.choices?.[0]?.message?.content;

            if (!raw) throw new Error("Empty response from model");

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
                            content: "Eres Jarvis, un asistente de IA local. Responde de forma clara, directa y en el idioma del usuario."
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
            const cleaned = raw
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
            return JSON.parse(cleaned);
        } catch {
            logger.warn(`ModelService: invalid JSON from model: ${raw.substring(0, 200)}`);
            return this._errorIntent("Invalid JSON from model", raw.substring(0, 200));
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