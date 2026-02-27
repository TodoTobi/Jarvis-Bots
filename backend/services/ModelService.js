/**
 * ModelService.js — v5.0
 *
 * FIX CRÍTICO: El LLM no devuelve JSON consistentemente.
 * Solución: _quickClassify() intercepta comandos ANTES del LLM.
 * El LLM solo se usa para conversación libre o si no hay match.
 */

const axios = require("axios");
const logger = require("../logs/logger");

// ════════════════════════════════════════════════════════
//  CLASIFICADOR POR KEYWORDS (sin LLM, 100% confiable)
// ════════════════════════════════════════════════════════
const QUICK_RULES = [
    // WhatsApp QR
    { patterns: [/qr.*whatsapp|whatsapp.*qr|vincular.*whatsapp|whatsapp.*vincular|mostr[aá].*qr|mand[aá].*qr/], result: () => ({ intent: "whatsapp_qr", parameters: {}, priority: "normal" }) },

    // YouTube
    { patterns: [/abr[ií].*youtube|abre.*youtube|\byoutube\b|pone.*youtube|ejecut[aá].*youtube/], result: (m) => { const q = m.match(/(?:busca[r]?|busca)\s+(.+)/i)?.[1] || ""; return { intent: "bat_exec", parameters: { script: "media_youtube", args: q ? [q] : [] }, priority: "normal" }; } },

    // Spotify
    { patterns: [/abr[ií].*spotify|\bspotify\b|pon[ée].*spotify|m[uú]sica.*spotify/], result: () => ({ intent: "bat_exec", parameters: { script: "media_spotify", args: [] }, priority: "normal" }) },

    // VLC
    { patterns: [/abr[ií].*vlc|\bvlc\b/], result: () => ({ intent: "bat_exec", parameters: { script: "media_vlc", args: [] }, priority: "normal" }) },

    // Pausa
    { patterns: [/paus[aá]|detener m[uú]sica|para la m[uú]sica|stop m[uú]sica/], result: () => ({ intent: "bat_exec", parameters: { script: "media_pause", args: [] }, priority: "normal" }) },

    // Siguiente / anterior
    { patterns: [/siguiente canci[oó]n|next track|siguiente tema|skip/], result: () => ({ intent: "bat_exec", parameters: { script: "media_next", args: [] }, priority: "normal" }) },
    { patterns: [/anterior canci[oó]n|prev track|volver canci[oó]n/], result: () => ({ intent: "bat_exec", parameters: { script: "media_prev", args: [] }, priority: "normal" }) },

    // Volumen
    { patterns: [/sub[ií].*volumen|m[aá]s.*volumen|volumen.*arriba|aumenta.*volumen/], result: () => ({ intent: "bat_exec", parameters: { script: "volume_up", args: [] }, priority: "normal" }) },
    { patterns: [/baj[aá].*volumen|menos.*volumen|volumen.*abajo/], result: () => ({ intent: "bat_exec", parameters: { script: "volume_down", args: [] }, priority: "normal" }) },
    { patterns: [/silencia[r]?|mut[eé][ao]?|sin.*sonido/,], result: () => ({ intent: "bat_exec", parameters: { script: "volume_mute", args: [] }, priority: "normal" }) },

    // Apps
    { patterns: [/abr[ií].*discord|\bdiscord\b/], result: () => ({ intent: "bat_exec", parameters: { script: "app_discord", args: [] }, priority: "normal" }) },
    { patterns: [/abr[ií].*vscode|abr[ií].*code|\bvscode\b|visual studio/], result: () => ({ intent: "bat_exec", parameters: { script: "app_vscode", args: [] }, priority: "normal" }) },
    { patterns: [/abr[ií].*navegador|\bchrome\b|\bfirefox\b|\bbrowser\b|abr[ií].*internet/], result: () => ({ intent: "bat_exec", parameters: { script: "app_browser", args: [] }, priority: "normal" }) },
    { patterns: [/abr[ií].*fortnite|\bfortnite\b/], result: () => ({ intent: "bat_exec", parameters: { script: "app_fortnite", args: [] }, priority: "normal" }) },

    // Sistema
    { patterns: [/bloque[aá].*(?:pc|pantalla|compu)|lock pc/], result: () => ({ intent: "bat_exec", parameters: { script: "system_lock", args: [] }, priority: "normal" }) },
    { patterns: [/(?:sac[aá]|tom[aá]|hac[eé]).*captura|captura.*pantalla|\bscreenshot\b|print screen/], result: () => ({ intent: "bat_exec", parameters: { script: "system_screenshot", args: [] }, priority: "normal" }) },
    { patterns: [/modo nocturno|modo.*noche|night mode|dark mode|luz.*baja/], result: () => ({ intent: "bat_exec", parameters: { script: "system_night_mode", args: [] }, priority: "normal" }) },
    { patterns: [/dormir.*(?:pc|compu)|suspensi[oó]n|sleep.*pc/], result: () => ({ intent: "bat_exec", parameters: { script: "system_sleep", args: [] }, priority: "normal" }) },

    // Control PC
    { patterns: [/tom[aá].*control.*pc|control.*pc|automatiz[aá]|mover.*mouse|abr[ií].*carpeta/], result: (m) => ({ intent: "computer_control", parameters: { task: m }, priority: "normal" }) },

    // ADB Android
    { patterns: [/youtube.*celu|celu.*youtube/], result: () => ({ intent: "net_adb_youtube", parameters: { device: "phone_tobias", query: "" }, priority: "normal" }) },
    { patterns: [/captura.*celu|screenshot.*celu|celu.*captura/], result: () => ({ intent: "net_adb_screenshot", parameters: { device: "phone_tobias" }, priority: "normal" }) },

    // .bat genérico
    { patterns: [/\.bat\b/], result: (m) => { const s = m.match(/([a-z_]+)\.bat/i); return { intent: "bat_exec", parameters: { script: (s?.[1] || "media_youtube").toLowerCase(), args: [] }, priority: "normal" }; } },
];

function quickClassify(text) {
    const t = text.toLowerCase().trim();
    for (const rule of QUICK_RULES) {
        for (const pattern of rule.patterns) {
            if (pattern.test(t)) {
                const r = rule.result(t);
                logger.info(`QuickClassify: "${t.substring(0, 50)}" → ${r.intent}:${JSON.stringify(r.parameters)}`);
                return r;
            }
        }
    }
    return null;
}

// ════════════════════════════════════════════════════════

class ModelService {
    constructor() {
        this.baseURL = (process.env.LM_API_URL || "").replace(/\/$/, "");
        this.apiKey = process.env.LM_API_TOKEN || "";
        this.model = process.env.LM_MODEL || "";
        if (!this.baseURL) throw new Error("LM_API_URL not defined in .env");
        this._axiosConfig = {
            headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
            timeout: 90000
        };
        this._checkConnection().catch(() => { });
    }

    async _checkConnection() {
        try {
            const res = await axios.get(`${this.baseURL}/models`, { ...this._axiosConfig, timeout: 5000 });
            const models = res.data?.data || [];
            logger.info(`ModelService: connected. Models: ${models.map(m => m.id).join(", ") || "(none)"}`);
        } catch (err) {
            logger.error(`ModelService: Cannot reach LM Studio — ${err.message}`);
        }
    }

    _buildBody(messages, opts = {}) {
        const body = { messages, temperature: opts.temperature ?? 0.1, max_tokens: opts.max_tokens ?? 200 };
        if (this.model) body.model = this.model;
        return body;
    }

    async generateIntent(fullContext) {
        // Extraer mensaje del usuario
        const userMsgMatch = fullContext.match(/\[MENSAJE DEL USUARIO\]\s*([\s\S]+?)(?:\[|$)/);
        const userMsg = (userMsgMatch ? userMsgMatch[1].trim() : fullContext.trim()).substring(0, 1000);

        // 1. Clasificador rápido (keywords) — no usa el LLM
        const quick = quickClassify(userMsg);
        if (quick) return this._validateIntent(quick);

        // 2. Fallback LLM para conversación libre
        logger.info(`ModelService: no quick match, querying LLM: "${userMsg.substring(0, 60)}"`);
        const systemPrompt = `You are a JSON-only intent classifier. Output ONLY valid JSON.
Format: {"intent":"chat_response","parameters":{"query":"text"},"priority":"normal"}
No markdown, no explanation. Only JSON.`;

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody(
                    [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg.substring(0, 200) }],
                    { temperature: 0.0, max_tokens: 80 }
                ),
                this._axiosConfig
            );
            const raw = response.data?.choices?.[0]?.message?.content || "";
            logger.info(`ModelService raw: ${raw.substring(0, 100)}`);
            return this._validateIntent(this._safeParse(raw, userMsg));
        } catch (err) {
            logger.error(`ModelService LLM error: ${err.message}`);
            return { intent: "chat_response", parameters: { query: userMsg }, priority: "normal" };
        }
    }

    async generateText(prompt) {
        const systemPrompt = "Sos Jarvis, asistente IA local de Tobías. Respondé SIEMPRE en español rioplatense. Sé directo y conciso.";
        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody(
                    [{ role: "system", content: systemPrompt }, { role: "user", content: prompt.replace(/```/g, "").trim().substring(0, 3000) }],
                    { temperature: 0.5, max_tokens: 1024 }
                ),
                this._axiosConfig
            );
            const text = response.data?.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty text response from model");
            return text.trim();
        } catch (err) {
            logger.error(`ModelService generateText: ${err.message}`);
            throw new Error(`Error al generar respuesta: ${err.message}`);
        }
    }

    _safeParse(raw, fallbackQuery) {
        const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        try { return JSON.parse(cleaned); } catch { }
        const match = cleaned.match(/\{[\s\S]*?\}/);
        if (match) { try { return JSON.parse(match[0]); } catch { } }
        return { intent: "chat_response", parameters: { query: fallbackQuery || raw.trim() }, priority: "normal" };
    }

    _validateIntent(obj) {
        if (!obj || typeof obj !== "object") return { intent: "chat_response", parameters: {}, priority: "normal" };
        const intent = typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : "chat_response";
        return { intent, parameters: (obj.parameters && typeof obj.parameters === "object") ? obj.parameters : {}, priority: ["low", "normal", "high"].includes(obj.priority) ? obj.priority : "normal" };
    }
}

module.exports = new ModelService();