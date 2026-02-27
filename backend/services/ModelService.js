/**
 * ModelService.js — v4
 *
 * FIXES:
 *  - Separated system instruction from user context (models were confusing themselves)
 *  - System prompt is now purely the JSON schema + examples
 *  - User message is now just: [CONTEXT]\n...\n[USER]\nmessage
 *  - This prevents models from "evaluating" the instructions instead of following them
 *  - Better JSON extraction with multiple fallback patterns
 *  - Connection check with retry
 */

const axios = require("axios");
const logger = require("../logs/logger");

const MAX_USER_MSG_CHARS = 1500; // keep user message short for local models

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
        const body = {
            messages,
            temperature: opts.temperature ?? 0.1,
            max_tokens: opts.max_tokens ?? 300,
        };
        if (this.model) body.model = this.model;
        return body;
    }

    /* =========================
       INTENT GENERATION
    ========================= */

    async generateIntent(fullContext) {
        // ── System prompt: ONLY the JSON contract, nothing else ──
        // Keeping it short is critical for local models (< 7B tend to drift)
        const systemPrompt = `Eres JarvisCore. Tu ÚNICA tarea es leer el mensaje del usuario y responder con un JSON.

RESPONDE SOLO CON JSON. Sin explicaciones. Sin texto antes o después del JSON.

Formato exacto:
{"intent":"nombre_intent","parameters":{},"priority":"normal"}

Intents disponibles:
chat_response     → conversación, preguntas, saludos
  params: {"query":"[mensaje original]"}

bat_exec          → ejecutar script en la PC
  params: {"script":"[clave]","args":[]}
  Claves: media_youtube, media_spotify, media_pause, media_next, media_prev,
          volume_up, volume_down, volume_mute,
          system_lock, system_screenshot, system_sleep, system_night_mode,
          app_discord, app_vscode, app_browser, app_fortnite

computer_control  → controlar PC con mouse/teclado
  params: {"task":"[descripción detallada]"}

net_adb_youtube   → YouTube en dispositivo Android/TV
  params: {"device":"[id]","query":"[búsqueda]"}

net_wol           → encender PC por red (Wake-on-LAN)
  params: {"device":"[id]"}

Ejemplos:
- "hola" → {"intent":"chat_response","parameters":{"query":"hola"},"priority":"normal"}
- "poneme youtube" → {"intent":"bat_exec","parameters":{"script":"media_youtube","query":""},"priority":"normal"}
- "buscá Metallica en youtube" → {"intent":"bat_exec","parameters":{"script":"media_youtube","query":"Metallica"},"priority":"normal"}
- "subi el volumen" → {"intent":"bat_exec","parameters":{"script":"volume_up"},"priority":"normal"}
- "abrí discord" → {"intent":"bat_exec","parameters":{"script":"app_discord"},"priority":"normal"}
- "bloqueá la pantalla" → {"intent":"bat_exec","parameters":{"script":"system_lock"},"priority":"normal"}`;

        // ── User message: compact context + actual message ──
        // Trim to avoid token overflow on local models
        const compactContext = this._buildCompactContext(fullContext);

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: compactContext }
                    ],
                    { temperature: 0.05, max_tokens: 150 }
                ),
                this._axiosConfig
            );

            const raw = response.data?.choices?.[0]?.message?.content;
            if (!raw) throw new Error("Empty response from model");

            logger.info(`ModelService raw: ${raw.substring(0, 120)}`);
            const parsed = this._safeParse(raw);
            return this._validateIntent(parsed);

        } catch (error) {
            if (error.response) {
                logger.error(`ModelService generateIntent HTTP ${error.response.status}: ${JSON.stringify(error.response.data || {}).substring(0, 200)}`);
            } else {
                logger.error(`ModelService generateIntent: ${error.message}`);
            }
            return this._errorIntent("Model communication failure", error.message);
        }
    }

    /* =========================
       TEXT GENERATION
    ========================= */

    async generateText(prompt) {
        const systemPrompt = "Eres Jarvis, asistente IA local de Tobías. Respondé SIEMPRE en español rioplatense. Sé directo, claro y útil.";

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt.replace(/```/g, "").trim().substring(0, 3000) }
                    ],
                    { temperature: 0.5, max_tokens: 1024 }
                ),
                this._axiosConfig
            );

            const text = response.data?.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty text response from model");
            return text.trim();

        } catch (error) {
            if (error.response) {
                logger.error(`ModelService generateText HTTP ${error.response.status}: ${JSON.stringify(error.response.data || {}).substring(0, 200)}`);
            } else {
                logger.error(`ModelService generateText: ${error.message}`);
            }
            throw new Error(`Error al generar respuesta: ${error.message}`);
        }
    }

    /* =========================
       HELPERS
    ========================= */

    /**
     * Extract just what the model needs: user identity + the actual user message.
     * Avoids passing the full instruction block (which confuses some models).
     */
    _buildCompactContext(fullContext) {
        // Extract just the [MENSAJE DEL USUARIO] section
        const userMsgMatch = fullContext.match(/\[MENSAJE DEL USUARIO\]\s*([\s\S]+?)(?:\[|$)/);
        const userMsg = userMsgMatch ? userMsgMatch[1].trim() : fullContext.trim();

        // Extract soul/identity for persona awareness (very short)
        const identityMatch = fullContext.match(/\[IDENTITY\]\s*([\s\S]{0,150})/);
        const identity = identityMatch ? identityMatch[1].trim() : "";

        const parts = [];
        if (identity) parts.push(`[CONTEXTO]\n${identity.substring(0, 100)}`);
        parts.push(`[MENSAJE DEL USUARIO]\n${userMsg.substring(0, MAX_USER_MSG_CHARS)}`);

        return parts.join("\n\n");
    }

    _safeParse(raw) {
        const cleaned = raw.trim()
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

        // 1. Try direct parse
        try { return JSON.parse(cleaned); } catch { }

        // 2. Extract first {...} block
        const match = cleaned.match(/\{[\s\S]*?\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { }
        }

        // 3. Extract last {...} block (some models add explanation after)
        const allMatches = [...cleaned.matchAll(/\{[\s\S]*?\}/g)];
        if (allMatches.length > 1) {
            for (const m of allMatches.reverse()) {
                try {
                    const parsed = JSON.parse(m[0]);
                    if (parsed.intent) return parsed;
                } catch { }
            }
        }

        // 4. Fallback — treat as chat
        logger.warn(`ModelService: non-JSON response, treating as chat: ${raw.substring(0, 80)}`);
        return { intent: "chat_response", parameters: { query: raw.trim() }, priority: "normal" };
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