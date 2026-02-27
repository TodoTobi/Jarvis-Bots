/**
 * sttRoutes.js — Speech-to-Text via Groq Whisper API
 *
 * FIXES:
 *  - Changed model from whisper-large-v3-turbo → whisper-large-v3
 *    (turbo gets blocked at org level on many Groq accounts)
 *  - Falls back to distil-whisper-large-v3-en if large-v3 also fails
 *  - Minimum file size validation done server-side (1KB)
 *  - Returns specific error codes so frontend can show contextual messages
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const logger = require("../logs/logger");

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_SIZE_MB = 25;

// Model priority order (fallback if one is org-blocked)
const WHISPER_MODELS = [
    "whisper-large-v3",
    "distil-whisper-large-v3-en",
];

/* ── GET /api/stt/status ─────────────────────────────── */
router.get("/stt/status", (req, res) => {
    const key = process.env.GROQ_API_KEY;
    res.json({
        configured: !!key,
        model: WHISPER_MODELS[0],
        maxSizeMB: MAX_SIZE_MB,
        formats: ["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"],
    });
});

/* ── POST /api/stt/transcribe ────────────────────────── */
router.post("/stt/transcribe", async (req, res) => {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
        return res.status(503).json({
            success: false,
            errorCode: "NO_API_KEY",
            error: "GROQ_API_KEY no configurada. Agregá GROQ_API_KEY=gsk_... en backend/config/.env",
        });
    }

    let multer;
    try { multer = require("multer"); }
    catch {
        return res.status(503).json({ success: false, error: "npm install multer" });
    }

    let FormData;
    try { FormData = require("form-data"); }
    catch {
        return res.status(503).json({ success: false, error: "npm install form-data" });
    }

    const uploadDir = path.resolve(__dirname, "../../tmp/stt");
    fs.mkdirSync(uploadDir, { recursive: true });

    const storage = multer.diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => cb(null, `audio_${Date.now()}${path.extname(file.originalname) || ".webm"}`),
    });

    const upload = multer({
        storage,
        limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
    }).single("audio");

    upload(req, res, async (uploadErr) => {
        if (uploadErr) {
            return res.status(400).json({ success: false, error: uploadErr.message });
        }
        if (!req.file) {
            return res.status(400).json({
                success: false,
                errorCode: "NO_FILE",
                error: "No se recibió archivo de audio",
            });
        }

        const filePath = req.file.path;
        const fileSizeKB = req.file.size / 1024;

        // Reject very small files (almost certainly empty/silence)
        if (req.file.size < 1000) {
            try { fs.unlinkSync(filePath); } catch { }
            return res.status(400).json({
                success: false,
                errorCode: "TOO_SHORT",
                error: "Audio demasiado corto — no se detectó voz",
            });
        }

        logger.info(`STT: transcribing ${req.file.originalname} (${fileSizeKB.toFixed(0)} KB)`);

        // Try models in order until one works
        let lastError = null;
        for (const model of WHISPER_MODELS) {
            try {
                const form = new FormData();
                form.append("file", fs.createReadStream(filePath), {
                    filename: req.file.originalname || "audio.webm",
                    contentType: req.file.mimetype || "audio/webm",
                });
                form.append("model", model);
                form.append("response_format", "verbose_json");
                form.append("temperature", "0");

                const lang = req.body?.language;
                if (lang) form.append("language", lang);

                const transcription = await callGroqSTT(form, groqKey);

                const text = (transcription.text || "").trim();
                logger.info(`STT: transcribed ${text.length} chars with ${model}`);

                try { fs.unlinkSync(filePath); } catch { }
                return res.json({
                    success: true,
                    text,
                    language: transcription.language,
                    duration: transcription.duration,
                    model,
                });
            } catch (err) {
                lastError = err;
                logger.warn(`STT: model ${model} failed — ${err.message}`);
                // If blocked, try next model; if other error, stop
                if (!err.message.includes("blocked") && !err.message.includes("not found") && !err.message.includes("does not exist")) {
                    break;
                }
            }
        }

        try { fs.unlinkSync(filePath); } catch { }
        logger.error(`STT error: ${lastError?.message}`);
        return res.status(500).json({
            success: false,
            errorCode: "TRANSCRIPTION_FAILED",
            error: lastError?.message || "Error al transcribir",
        });
    });
});

function callGroqSTT(form, apiKey) {
    return new Promise((resolve, reject) => {
        const https = require("https");
        const url = new URL(GROQ_API_URL);

        const headers = {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
        };

        const req = https.request(
            { hostname: url.hostname, path: url.pathname, method: "POST", headers },
            (response) => {
                let data = "";
                response.on("data", (c) => { data += c; });
                response.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (response.statusCode >= 400) {
                            reject(new Error(parsed.error?.message || `Groq API ${response.statusCode}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch {
                        reject(new Error(`Parse error: ${data.substring(0, 200)}`));
                    }
                });
            }
        );
        req.on("error", reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error("Groq STT timeout")); });
        form.pipe(req);
    });
}

module.exports = router;