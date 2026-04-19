/**
 * uploadRoutes.js — Dedicated upload handler (replaces inline /api/upload in server.js)
 *
 * FIX: server.js has the /api/upload inline but it has a critical bug:
 *   - It treats ALL files as images first, then falls back to Gemini
 *   - PDFs sent with fileType="pdf" were being sent to Gemma's image analyzer
 *   - Error message was "No se proporcionó una imagen válida" for PDFs
 *
 * This version:
 *   1. Reads req.body.fileType ("image" | "pdf") set by the frontend Chat.jsx
 *   2. Routes PDFs directly to PDF analysis (Claude document block or Gemini Docs)
 *   3. Routes images to image analysis (Gemma vision or Gemini Vision)
 *   4. Returns consistent { success, reply, intent, bot } shape
 *   5. Provides clear error messages per file type
 *
 * Mount in server.js BEFORE the existing inline /api/upload:
 *   const uploadRoutes = require("./routes/uploadRoutes");
 *   app.use("/api", uploadRoutes);
 */

const express  = require("express");
const router   = express.Router();
const path     = require("path");
const fs       = require("fs");
const axios    = require("axios");
const https    = require("https");
const logger   = require("../logs/logger");

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_HOST  = "generativelanguage.googleapis.com";

/* ── helpers ──────────────────────────────────────────── */

function callGemini(body, apiKey) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const apiPath = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
        const req = https.request(
            {
                hostname: GEMINI_HOST,
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
                            reject(new Error(parsed.error?.message || `Gemini API ${response.statusCode}`));
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
        req.setTimeout(90000, () => { req.destroy(); reject(new Error("Gemini timeout")); });
        req.write(bodyStr);
        req.end();
    });
}

async function analyzeWithGemma(filePath, mimeType, query, port) {
    const FormData = require("form-data");
    const form     = new FormData();
    form.append("file", fs.createReadStream(filePath), {
        filename:    path.basename(filePath),
        contentType: mimeType,
    });
    form.append("query", query);
    const res = await axios.post(
        `http://localhost:${port}/api/gemma/analyze`,
        form,
        { headers: form.getHeaders(), timeout: 120000 }
    );
    return res.data;
}

async function analyzeImageWithGemini(filePath, mimeType, query) {
    const visionKey = process.env.GEMINI_VISION_KEY || process.env.GEMINI_DOCS_KEY;
    if (!visionKey) throw new Error("GEMINI_VISION_KEY no configurada");
    const base64 = fs.readFileSync(filePath).toString("base64");
    const text = await callGemini(
        {
            contents: [{
                parts: [
                    { inline_data: { mime_type: mimeType, data: base64 } },
                    { text: query },
                ],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        },
        visionKey
    );
    return { success: true, reply: text, intent: "image_analysis", bot: "GeminiBot" };
}

async function analyzePDFWithGemini(filePath, query) {
    const docsKey = process.env.GEMINI_DOCS_KEY || process.env.GEMINI_VISION_KEY;
    if (!docsKey) throw new Error("GEMINI_DOCS_KEY no configurada");
    const base64 = fs.readFileSync(filePath).toString("base64");
    const text = await callGemini(
        {
            contents: [{
                parts: [
                    { inline_data: { mime_type: "application/pdf", data: base64 } },
                    { text: query },
                ],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        },
        docsKey
    );
    return { success: true, reply: text, intent: "document_analysis", bot: "GeminiBot" };
}

async function analyzePDFWithClaude(filePath, query) {
    const visionKey = process.env.VISION_API_KEY;
    if (!visionKey) throw new Error("VISION_API_KEY no configurada");
    const base64 = fs.readFileSync(filePath).toString("base64");
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-opus-4-6",
            max_tokens: 2000,
            messages: [{
                role: "user",
                content: [
                    {
                        type: "document",
                        source: { type: "base64", media_type: "application/pdf", data: base64 }
                    },
                    { type: "text", text: query },
                ],
            }],
        },
        {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": visionKey,
                "anthropic-version": "2023-06-01",
            },
            timeout: 90000,
        }
    );
    const text = response.data?.content?.[0]?.text || "Sin respuesta";
    return { success: true, reply: text, intent: "document_analysis", bot: "ClaudeBot" };
}

/* ── route ────────────────────────────────────────────── */

router.post("/upload", (req, res, next) => {
    let multer;
    try { multer = require("multer"); }
    catch { return res.status(503).json({ success: false, error: "npm install multer" }); }

    const uploadDir = path.resolve(__dirname, "../../tmp/uploads");
    fs.mkdirSync(uploadDir, { recursive: true });

    const upload = multer({
        storage: multer.diskStorage({
            destination: uploadDir,
            filename: (_, file, cb) => cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`),
        }),
        limits: { fileSize: 25 * 1024 * 1024 },
    }).single("file");

    upload(req, res, async (uploadErr) => {
        if (uploadErr) {
            return res.status(400).json({ success: false, error: uploadErr.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No se recibió archivo" });
        }

        const filePath  = req.file.path;
        const mimeType  = req.file.mimetype || "application/octet-stream";
        const fileType  = (req.body?.fileType || "").toLowerCase(); // "image" | "pdf" set by frontend
        const query     = req.body?.query || "";
        const port      = process.env.PORT || 3001;
        const isPDF     = fileType === "pdf" || mimeType === "application/pdf";
        const isImage   = fileType === "image" || mimeType.startsWith("image/");
        const provider  = process.env.VISION_PROVIDER || "claude";

        logger.info(`Upload: ${isPDF ? "PDF" : isImage ? "image" : mimeType} | query: "${query.substring(0, 60)}"`);

        const cleanup = () => { try { fs.unlinkSync(filePath); } catch { } };

        const defaultQuery = isPDF
            ? (query || "Resumí y analizá este PDF detalladamente. Extraé los puntos clave, estructura y datos importantes.")
            : (query || "Describí detalladamente el contenido de esta imagen. ¿Qué se ve? ¿Qué texto hay? ¿Qué contexto inferís?");

        try {
            let result;

            if (isPDF) {
                // ── PDF pipeline ───────────────────────────────────────────
                // Priority: Claude (native PDF) > Gemini Docs > Gemma local
                if (provider === "claude" && process.env.VISION_API_KEY) {
                    try {
                        result = await analyzePDFWithClaude(filePath, defaultQuery);
                        cleanup();
                        return res.json(result);
                    } catch (claudeErr) {
                        logger.warn(`Claude PDF failed (${claudeErr.message}), trying Gemini Docs...`);
                    }
                }
                if (process.env.GEMINI_DOCS_KEY || process.env.GEMINI_VISION_KEY) {
                    try {
                        result = await analyzePDFWithGemini(filePath, defaultQuery);
                        cleanup();
                        return res.json(result);
                    } catch (geminiErr) {
                        logger.warn(`Gemini PDF failed (${geminiErr.message}), trying Gemma...`);
                    }
                }
                // Gemma local fallback
                try {
                    result = await analyzeWithGemma(filePath, "application/pdf", defaultQuery, port);
                    cleanup();
                    return res.json(result);
                } catch (gemmaErr) {
                    cleanup();
                    return res.status(500).json({
                        success: false,
                        error: `No se pudo analizar el PDF. Configurá GEMINI_DOCS_KEY o VISION_API_KEY (Claude) en .env. Error: ${gemmaErr.message}`,
                        hint: "Opciones: 1) GEMINI_DOCS_KEY=tu_clave  2) VISION_API_KEY=tu_clave_anthropic + VISION_PROVIDER=claude",
                    });
                }
            } else if (isImage) {
                // ── Image pipeline ─────────────────────────────────────────
                // Priority: Gemma local > Gemini Vision > Claude Vision
                if (process.env.LM_API_URL) {
                    try {
                        result = await analyzeWithGemma(filePath, mimeType, defaultQuery, port);
                        if (result?.success) { cleanup(); return res.json(result); }
                    } catch (gemmaErr) {
                        logger.warn(`Gemma image failed (${gemmaErr.message}), trying Gemini...`);
                    }
                }
                if (process.env.GEMINI_VISION_KEY) {
                    try {
                        result = await analyzeImageWithGemini(filePath, mimeType, defaultQuery);
                        cleanup();
                        return res.json(result);
                    } catch (geminiErr) {
                        logger.warn(`Gemini image failed (${geminiErr.message}), trying Claude...`);
                    }
                }
                if (provider === "claude" && process.env.VISION_API_KEY) {
                    try {
                        const base64 = fs.readFileSync(filePath).toString("base64");
                        const response = await axios.post(
                            "https://api.anthropic.com/v1/messages",
                            {
                                model: "claude-opus-4-6",
                                max_tokens: 1500,
                                messages: [{
                                    role: "user",
                                    content: [
                                        { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
                                        { type: "text", text: defaultQuery },
                                    ],
                                }],
                            },
                            {
                                headers: {
                                    "Content-Type": "application/json",
                                    "x-api-key": process.env.VISION_API_KEY,
                                    "anthropic-version": "2023-06-01",
                                },
                                timeout: 60000,
                            }
                        );
                        const text = response.data?.content?.[0]?.text || "Sin respuesta";
                        cleanup();
                        return res.json({ success: true, reply: text, intent: "image_analysis", bot: "ClaudeBot" });
                    } catch (claudeErr) {
                        logger.warn(`Claude image failed: ${claudeErr.message}`);
                    }
                }

                cleanup();
                return res.status(500).json({
                    success: false,
                    error: "No se pudo analizar la imagen. Configurá GEMINI_VISION_KEY o VISION_API_KEY en .env.",
                    hint: "Opciones: 1) GEMINI_VISION_KEY=tu_clave_google  2) VISION_API_KEY=tu_clave_anthropic + VISION_PROVIDER=claude",
                });
            } else {
                // Unknown type
                cleanup();
                return res.status(400).json({
                    success: false,
                    error: `Tipo de archivo no soportado: ${mimeType}. Usá imágenes (PNG, JPG, WEBP) o PDF.`,
                });
            }
        } catch (err) {
            cleanup();
            logger.error(`Upload handler error: ${err.message}`);
            return res.status(500).json({ success: false, error: err.message });
        }
    });
});

module.exports = router;