const axios = require("axios");

class ModelService {
    constructor() {
        this.baseURL = process.env.LM_API_URL;
        this.apiKey = process.env.LM_API_TOKEN;
        this.model = process.env.LM_MODEL || "local-model";

        if (!this.baseURL) {
            throw new Error("LM_API_URL not defined in .env");
        }
    }

    /* =========================
       GENERATE INTENT
       Sends full context to the model and expects valid JSON response
    ========================= */
    async generateIntent(fullContext) {
        try {
            const cleanContext = fullContext.replace(/```/g, "").trim();

            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a modular AI agent orchestrator. Respond ONLY with valid JSON. No explanations. No markdown. No code fences."
                        },
                        {
                            role: "user",
                            content: cleanContext
                        }
                    ],
                    temperature: 0.3,
                    response_format: { type: "json_object" }
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        ...(this.apiKey && {
                            Authorization: `Bearer ${this.apiKey}`
                        })
                    },
                    timeout: 60000
                }
            );

            const raw = response.data?.choices?.[0]?.message?.content;

            if (!raw) {
                throw new Error("Empty response from model");
            }

            const parsed = this.safeParse(raw);
            return this.validateIntent(parsed);

        } catch (error) {
            console.error("ModelService generateIntent error:", error.message);

            return this.buildErrorIntent(
                "Model communication failure",
                error.message
            );
        }
    }

    /* =========================
       SAFE JSON PARSE
    ========================= */
    safeParse(raw) {
        try {
            const cleaned = raw
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
            return JSON.parse(cleaned);
        } catch (err) {
            console.error("Invalid JSON from model:", raw);
            return this.buildErrorIntent(
                "Invalid JSON returned by model",
                raw
            );
        }
    }

    /* =========================
       VALIDATE INTENT STRUCTURE
    ========================= */
    validateIntent(obj) {
        if (!obj || typeof obj !== "object") {
            return this.buildErrorIntent(
                "Intent is not an object",
                JSON.stringify(obj)
            );
        }

        const intent = typeof obj.intent === "string" ? obj.intent.trim() : null;
        const parameters = typeof obj.parameters === "object" && obj.parameters !== null
            ? obj.parameters
            : {};
        const priority = ["low", "normal", "high"].includes(obj.priority)
            ? obj.priority
            : "normal";

        if (!intent) {
            return this.buildErrorIntent(
                "Missing intent field",
                JSON.stringify(obj)
            );
        }

        return {
            intent,
            parameters,
            priority,
            notes: obj.notes || null
        };
    }

    /* =========================
       ERROR INTENT BUILDER
    ========================= */
    buildErrorIntent(reason, notes) {
        return {
            intent: "error",
            parameters: { reason },
            priority: "normal",
            notes
        };
    }

    /* =========================
       GENERATE TEXT (free-form)
       Used by bots for non-JSON responses
    ========================= */
    async generateText(prompt) {
        try {
            const cleanPrompt = prompt.replace(/```/g, "").trim();

            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful AI assistant. Respond clearly and directly in the user's language."
                        },
                        {
                            role: "user",
                            content: cleanPrompt
                        }
                    ],
                    temperature: 0.5
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        ...(this.apiKey && {
                            Authorization: `Bearer ${this.apiKey}`
                        })
                    },
                    timeout: 60000
                }
            );

            return response.data?.choices?.[0]?.message?.content || "";

        } catch (error) {
            throw new Error("Text generation failed: " + error.message);
        }
    }
}

module.exports = new ModelService();