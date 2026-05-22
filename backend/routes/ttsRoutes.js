/**
 * ttsRoutes.js — Text to Speech via ElevenLabs
 * POST /api/tts/speak — recibe { text } → devuelve audio/mpeg como stream
 * Limpia markdown, código y URLs antes de sintetizar.
 */

const express = require("express");
const router  = express.Router();
const https   = require("https");
const logger  = require("../logs/logger");

/* ── Limpiar texto antes de sintetizar ─────────────────── */
function cleanForTTS(text, maxLen = 500) {
    if (!text) return "";
    return text
        .replace(/```[\s\S]*?```/g, "")              // bloques de código
        .replace(/`[^`]*`/g, "")                     // código inline
        .replace(/\*\*([^*]+)\*\*/g, "$1")            // bold
        .replace(/\*([^*]+)\*/g, "$1")                // italic
        .replace(/#{1,6}\s/g, "")                     // headers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")      // links markdown
        .replace(/https?:\/\/\S+/g, "")               // URLs crudas
        .replace(/[🔍📌🌐🔗❌⚠️✓✗▸◎●○⟳↗↳⊞]/gu, "") // emojis/iconos
        .replace(/\/\/.*/g, "")                       // comentarios estilo //
        .replace(/\n+/g, ". ")                        // saltos de línea → pausa
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, maxLen);
}

/* ══════════════════════════════════════════════════════
   POST /api/tts/speak
══════════════════════════════════════════════════════ */
router.post("/tts/speak", async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text requerido" });

    const apiKey  = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
        return res.status(503).json({
            error: "ElevenLabs no configurado. Agregá ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID en .env",
        });
    }

    const clean = cleanForTTS(text);
    if (!clean || clean.length < 2) {
        return res.status(400).json({ error: "texto vacío tras limpiar" });
    }

    logger.info(`TTS ElevenLabs: "${clean.substring(0, 60)}..." (${clean.length} chars)`);

    const body = JSON.stringify({
        text: clean,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
            stability:        0.35,
            similarity_boost: 0.85,
            style:            0.0,
            use_speaker_boost: true,
        },
    });

    const options = {
        hostname: "api.elevenlabs.io",
        path:     `/v1/text-to-speech/${voiceId}/stream`,
        method:   "POST",
        headers: {
            "xi-api-key":     apiKey,
            "Content-Type":   "application/json",
            "Accept":         "audio/mpeg",
            "Content-Length": Buffer.byteLength(body),
        },
    };

    const request = https.request(options, (upstream) => {
        if (upstream.statusCode >= 400) {
            let errData = "";
            upstream.on("data", c => errData += c);
            upstream.on("end", () => {
                logger.error(`ElevenLabs error ${upstream.statusCode}: ${errData.substring(0, 200)}`);
                if (!res.headersSent) res.status(upstream.statusCode).json({ error: errData });
            });
            return;
        }
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Cache-Control", "no-cache");
        upstream.pipe(res);
    });

    request.on("error", (err) => {
        logger.error(`TTS request error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    request.write(body);
    request.end();
});

/* ══════════════════════════════════════════════════════
   GET /api/tts/status
══════════════════════════════════════════════════════ */
router.get("/tts/status", (req, res) => {
    const configured = !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
    res.json({
        configured,
        provider: configured ? "elevenlabs" : "none",
        voiceId:  configured ? process.env.ELEVENLABS_VOICE_ID : null,
        model:    "eleven_multilingual_v2",
    });
});

module.exports = router;