/**
 * ttsRoutes.js — Text to Speech via ElevenLabs
 * Endpoint: POST /api/tts/speak
 */

const express = require("express");
const router  = express.Router();
const https   = require("https");
const logger  = require("../logs/logger");

const ELEVENLABS_API_KEY  = process.env.ELEVENLABS_API_KEY  || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL    = "eleven_multilingual_v2";

router.get("/tts/status", (req, res) => {
  res.json({
    configured: !!ELEVENLABS_API_KEY && !!ELEVENLABS_VOICE_ID,
    provider: "elevenlabs",
    model: ELEVENLABS_MODEL,
    voiceId: ELEVENLABS_VOICE_ID,
  });
});

router.post("/tts/speak", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ success: false, error: "text requerido" });
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return res.status(503).json({ success: false, error: "ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID no configurados" });
  }

  const clean = text
    .replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "").replace(/[🔍📌🌐🔗❌⚠️🎤⟳●]/gu, "")
    .replace(/\n{2,}/g, ". ").replace(/\n/g, " ").replace(/\s{2,}/g, " ")
    .trim().substring(0, 500);

  if (!clean || clean.length < 2) return res.status(400).json({ success: false, error: "texto vacío" });

  logger.info(`TTS: "${clean.substring(0, 60)}"`);

  const body = JSON.stringify({
    text: clean,
    model_id: ELEVENLABS_MODEL,
    voice_settings: { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
  });

  const options = {
    hostname: "api.elevenlabs.io",
    path: `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
      "Accept": "audio/mpeg",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const reqEl = https.request(options, (elRes) => {
    if (elRes.statusCode >= 400) {
      let errData = "";
      elRes.on("data", c => errData += c);
      elRes.on("end", () => {
        logger.error(`TTS error ${elRes.statusCode}: ${errData.substring(0, 200)}`);
        if (!res.headersSent) res.status(elRes.statusCode).json({ success: false, error: errData.substring(0, 100) });
      });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Transfer-Encoding", "chunked");
    elRes.pipe(res);
  });

  reqEl.on("error", (err) => { if (!res.headersSent) res.status(500).json({ success: false, error: err.message }); });
  reqEl.setTimeout(30000, () => { reqEl.destroy(); if (!res.headersSent) res.status(504).json({ success: false, error: "timeout" }); });
  reqEl.write(body);
  reqEl.end();
});

module.exports = router;