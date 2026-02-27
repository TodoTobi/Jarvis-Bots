/**
 * geminiRoutes.js — Google Gemini Vision & Document Analysis
 *
 * Endpoints:
 *  POST /api/gemini/analyze  — Analyze image or PDF via Gemini
 *
 * Two API keys:
 *  GEMINI_VISION_KEY  = AIzaSyAyc56z1KTGKW7NGSSDll_9YL0RSL-1HT4  (photos/images)
 *  GEMINI_DOCS_KEY    = AIzaSyALBE_52NxJ50qsUpMCiTq3sC4mS3MvUo8   (documents/PDFs)
 *
 * Model: gemini-2.0-flash (supports images + PDFs natively)
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const https = require("https");
const logger = require("../logs/logger");

const GEMINI_BASE = "generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-2.0-flash";

/* ── POST /api/gemini/analyze ────────────────────────── */
router.post("/gemini/analyze", async (req, res) => {
    let multer;
    try { multer = require("multer"); }
    catch { return res.status(503).json({ success: false, error: "npm install multer" }); }

    const uploadDir = path.resolve(__dirname, "../../tmp/gemini");
    fs.mkdirSync(uploadDir, { recursive: true });

    const upload = multer({
        storage: multer.diskStorage({
            destination: uploadDir,
            filename: (req, file, cb) => cb(null, `gemini_${Date.now()}${path.extname(file.originalname)}`),
        }),
        limits: { fileSize: 20 * 1024 * 1024 },
    }).single("file");

    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        if (!req.file) return res.status(400).json({ success: false, error: "No se recibió archivo" });

        const filePath = req.file.path;
        const mimeType = req.file.mimetype || "application/octet-stream";
        const query = req.body?.query || "Describí el contenido de este archivo detalladamente";
        const isPdf = mimeType === "application/pdf";

        // Select API key based on file type
        const apiKey = isPdf
            ? (process.env.GEMINI_DOCS_KEY || process.env.GEMINI_VISION_KEY)
            : (process.env.GEMINI_VISION_KEY || process.env.GEMINI_DOCS_KEY);

        if (!apiKey) {
            try { fs.unlinkSync(filePath); } catch { }
            return res.status(503).json({
                success: false,
                error: "Gemini API keys no configuradas. Agregá GEMINI_VISION_KEY y GEMINI_DOCS_KEY en .env",
            });
        }

        try {
            const fileData = fs.readFileSync(filePath);
            const base64Data = fileData.toString("base64");

            logger.info(`Gemini: analyzing ${mimeType} (${(fileData.length / 1024).toFixed(0)} KB)`);

            const requestBody = {
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data,
                            },
                        },
                        { text: query },
                    ],
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 4096,
                },
            };

            const responseText = await callGemini(requestBody, apiKey);

            try { fs.unlinkSync(filePath); } catch { }

            logger.info(`Gemini: response ${responseText.length} chars`);

            res.json({
                success: true,
                reply: responseText,
                model: GEMINI_MODEL,
                fileType: mimeType,
                intent: isPdf ? "document_analysis" : "image_analysis",
                bot: "GeminiBot",
            });
        } catch (err) {
            try { fs.unlinkSync(filePath); } catch { }
            logger.error(`Gemini error: ${err.message}`);
            res.status(500).json({ success: false, error: err.message });
        }
    });
});

/* ── GET /api/gemini/status ──────────────────────────── */
router.get("/gemini/status", (req, res) => {
    res.json({
        visionConfigured: !!process.env.GEMINI_VISION_KEY,
        docsConfigured: !!process.env.GEMINI_DOCS_KEY,
        model: GEMINI_MODEL,
    });
});

function callGemini(body, apiKey) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const apiPath = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

        const req = https.request(
            {
                hostname: GEMINI_BASE,
                path: apiPath,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(bodyStr),
                },
            },
            (response) => {
                let data = "";
                response.on("data", (c) => { data += c; });
                response.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (response.statusCode >= 400) {
                            const msg = parsed.error?.message || `Gemini API ${response.statusCode}`;
                            reject(new Error(msg));
                            return;
                        }
                        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text) reject(new Error("Gemini no retornó texto"));
                        else resolve(text);
                    } catch {
                        reject(new Error(`Parse error: ${data.substring(0, 200)}`));
                    }
                });
            }
        );
        req.on("error", reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error("Gemini timeout")); });
        req.write(bodyStr);
        req.end();
    });
}

module.exports = router;