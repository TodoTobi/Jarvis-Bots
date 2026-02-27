/**
 * sttRoutes.js — Speech-to-Text via Groq Whisper API
 *
 * Endpoints:
 *  POST /api/stt/transcribe   — Upload audio file, get transcribed text
 *  GET  /api/stt/status       — Check if Groq API key is configured
 *
 * Supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm (up to 25MB)
 * Model: whisper-large-v3-turbo (fastest, high quality)
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const logger = require("../logs/logger");

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_SIZE_MB = 25;

/* ── GET /api/stt/status ───────────────────────────────── */
router.get("/stt/status", (req, res) => {
    const key = process.env.GROQ_API_KEY;
    res.json({
        configured: !!key,
        model: "whisper-large-v3-turbo",
        maxSizeMB: MAX_SIZE_MB,
        formats: ["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"],
    });
});

/* ── POST /api/stt/transcribe ──────────────────────────── */
router.post("/stt/transcribe", async (req, res) => {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
        return res.status(503).json({
            success: false,
            error: "GROQ_API_KEY no configurada. Agregá GROQ_API_KEY=gsk_... en backend/config/.env",
        });
    }

    // Lazy-load multer
    let multer;
    try {
        multer = require("multer");
    } catch {
        return res.status(503).json({
            success: false,
            error: "multer no instalado. Ejecutá: npm install multer",
        });
    }

    // Lazy-load form-data and node-fetch for Groq API call
    let FormData, nodeFetch;
    try {
        FormData = require("form-data");
    } catch {
        return res.status(503).json({
            success: false,
            error: "form-data no instalado. Ejecutá: npm install form-data",
        });
    }

    const uploadDir = path.resolve(__dirname, "../../tmp/stt");
    fs.mkdirSync(uploadDir, { recursive: true });

    const storage = multer.diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => cb(null, `audio_${Date.now()}${path.extname(file.originalname)}`),
    });

    const upload = multer({
        storage,
        limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const allowed = ["audio/", "video/mp4", "video/mpeg"];
            const ok = allowed.some((type) => file.mimetype.startsWith(type));
            cb(ok ? null : new Error("Tipo de archivo no soportado"), ok);
        },
    }).single("audio");

    upload(req, res, async (uploadErr) => {
        if (uploadErr) {
            return res.status(400).json({ success: false, error: uploadErr.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No se recibió archivo de audio" });
        }

        const filePath = req.file.path;
        logger.info(`STT: transcribing ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`);

        try {
            // Build multipart form for Groq
            const form = new FormData();
            form.append("file", fs.createReadStream(filePath), {
                filename: req.file.originalname || "audio.m4a",
                contentType: req.file.mimetype,
            });
            form.append("model", "whisper-large-v3-turbo");
            form.append("response_format", "verbose_json");
            form.append("temperature", "0");

            // Language hint from request body
            const lang = req.body?.language;
            if (lang) form.append("language", lang);

            // Call Groq API using native https
            const transcription = await callGroqSTT(form, groqKey);

            logger.info(`STT: transcribed ${transcription.text?.length || 0} chars`);

            res.json({
                success: true,
                text: transcription.text || "",
                language: transcription.language,
                duration: transcription.duration,
                segments: transcription.segments,
            });
        } catch (err) {
            logger.error(`STT error: ${err.message}`);
            res.status(500).json({ success: false, error: err.message });
        } finally {
            // Clean up temp file
            try { fs.unlinkSync(filePath); } catch { }
        }
    });
});

/* ── Groq API call using native https ─────────────────── */
function callGroqSTT(form, apiKey) {
    return new Promise((resolve, reject) => {
        const https = require("https");
        const url = new URL(GROQ_API_URL);

        const headers = {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
        };

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: "POST",
            headers,
        };

        const req = https.request(options, (response) => {
            let data = "";
            response.on("data", (chunk) => { data += chunk; });
            response.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (response.statusCode >= 400) {
                        reject(new Error(parsed.error?.message || `Groq API error ${response.statusCode}`));
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    reject(new Error(`Groq API response parse error: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on("error", reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error("Groq STT timeout (60s)"));
        });

        form.pipe(req);
    });
}

module.exports = router;