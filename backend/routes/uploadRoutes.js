/**
 * uploadRoutes.js — v2 FIXED
 *
 * PROBLEMA ANTERIOR:
 *   - PDFs se enviaban como image_url con MIME application/pdf → Gemma los rechazaba
 *   - Error: "[google/gemma-4-e4b] 'url' field must be a base64 encoded image"
 *   - No había separación entre imágenes y documentos
 *
 * FIXES:
 *   1. PDFs → extracción de texto primero (pdfExtractor) → texto plano a Gemma
 *   2. Imágenes → siguen como image_url (JPEG/PNG/WEBP solamente)
 *   3. Si la extracción de texto falla → fallback a Claude o Gemini Docs
 *   4. Respuestas consistentes { success, reply, intent, bot }
 *
 * PIPELINE PDF CORRECTO:
 *   PDF → extraer texto → texto plano → /api/gemma/chat (NO /api/gemma/analyze)
 *
 * PIPELINE IMAGEN CORRECTO:
 *   imagen → base64 JPEG/PNG → image_url → /api/gemma/analyze ✅
 */

const express  = require("express");
const router   = express.Router();
const path     = require("path");
const fs       = require("fs");
const axios    = require("axios");
const https    = require("https");
const logger   = require("../logs/logger");

// Importar extractor de PDF
let pdfExtractor;
try {
    pdfExtractor = require("../utils/pdfExtractor");
} catch {
    // Si el archivo no existe todavía, crearemos un fallback inline
    pdfExtractor = {
        extractPDFText: async () => null,
        buildPDFPrompt: (text, q) => `${q || "Analizá este documento"}\n\nContenido:\n${text}`,
    };
}

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_HOST  = "generativelanguage.googleapis.com";

/* ── helpers Gemini ──────────────────────────────────────────────────────── */

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

/* ── PDF con extracción de texto → Gemma local ──────────────────────────── */

// REEMPLAZÁ esta función completa:
async function analyzePDFWithGemmaText(filePath, query, port) {
    const { extractPDFText, buildPDFPrompt } = require("../utils/pdfExtractor");
    
    const extractedText = await extractPDFText(filePath);

    if (!extractedText || extractedText.length < 20) {
        throw new Error(
            "No se pudo extraer texto del PDF.\n" +
            "Opciones:\n" +
            "  1. npm install pdf-parse (recomendado)\n" +
            "  2. Instalar poppler: choco install poppler (Windows)\n" +
            "  3. pip install pdfminer.six"
        );
    }

    const prompt = buildPDFPrompt(extractedText, query);
    logger.info(`analyzePDFWithGemmaText: ${extractedText.length} chars → Gemma chat`);

    // CRÍTICO: usar /api/gemma/chat (texto plano), NUNCA /api/gemma/analyze (image_url)
    const axios = require("axios");
    const response = await axios.post(
        `http://localhost:${port}/api/gemma/chat`,
        {
            message: prompt,
            context: "Sos Jarvis analizando un documento. Respondés en español rioplatense con análisis detallado y estructurado.",
        },
        { timeout: 120000 }
    );

    const reply = response.data?.reply;
    if (!reply) throw new Error("Gemma no devolvió respuesta");

    return {
        success: true,
        reply,
        intent: "document_analysis",
        bot: "GemmaBot",
        pages: Math.ceil(extractedText.length / 2000),
    };
}

/* ── PDF con Gemini (fallback si Gemma falla) ───────────────────────────── */

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

/* ── PDF con Claude (mejor opción si está configurado) ──────────────────── */

async function analyzePDFWithClaude(filePath, query) {
    const visionKey = process.env.VISION_API_KEY;
    if (!visionKey) throw new Error("VISION_API_KEY no configurada");
    const base64 = fs.readFileSync(filePath).toString("base64");
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-sonnet-4-6",
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

/* ── Imagen con Gemma (análisis visual correcto) ────────────────────────── */

async function analyzeImageWithGemma(filePath, mimeType, query, port) {
    // Verificar que sea un MIME de imagen válido para Gemma
    const validImageMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    const safeMime = validImageMimes.includes(mimeType) ? mimeType : "image/jpeg";

    const FormData = require("form-data");
    const form     = new FormData();
    form.append("file", fs.createReadStream(filePath), {
        filename:    path.basename(filePath),
        contentType: safeMime,  // ← SIEMPRE imagen válida, nunca application/pdf
    });
    form.append("query", query);

    const res = await axios.post(
        `http://localhost:${port}/api/gemma/analyze`,
        form,
        { headers: form.getHeaders(), timeout: 120000 }
    );
    return res.data;
}

/* ── Imagen con Gemini Vision (fallback) ────────────────────────────────── */

async function analyzeImageWithGemini(filePath, mimeType, query) {
    const visionKey = process.env.GEMINI_VISION_KEY || process.env.GEMINI_DOCS_KEY;
    if (!visionKey) throw new Error("GEMINI_VISION_KEY no configurada");
    const base64 = fs.readFileSync(filePath).toString("base64");
    const safeMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
    const text = await callGemini(
        {
            contents: [{
                parts: [
                    { inline_data: { mime_type: safeMime, data: base64 } },
                    { text: query },
                ],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        },
        visionKey
    );
    return { success: true, reply: text, intent: "image_analysis", bot: "GeminiBot" };
}

/* ══════════════════════════════════════════════════════════════════════════
   ROUTE PRINCIPAL: POST /api/upload
══════════════════════════════════════════════════════════════════════════ */

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
        const fileType  = (req.body?.fileType || "").toLowerCase();
        const query     = req.body?.query || "";
        const port      = process.env.PORT || 3001;

        // Determinar tipo real
        const isPDF   = fileType === "pdf" || mimeType === "application/pdf" || filePath.endsWith(".pdf");
        const isImage = !isPDF && (fileType === "image" || mimeType.startsWith("image/"));

        const defaultPDFQuery  = query || "Resumí y analizá este PDF detalladamente. Extraé los puntos clave, estructura y datos importantes.";
        const defaultImgQuery  = query || "Describí detalladamente el contenido de esta imagen. ¿Qué se ve? ¿Qué texto hay? ¿Qué contexto inferís?";

        const cleanup = () => { try { fs.unlinkSync(filePath); } catch {} };

        logger.info(`Upload v2: ${isPDF ? "PDF" : isImage ? "imagen" : mimeType} | ${req.file.originalname}`);

        try {
            if (isPDF) {
                // ════════════════════════════════════════════════════════
                // PIPELINE PDF — CORRECTO
                // Orden: texto+Gemma → Claude → Gemini → error
                // NUNCA enviar como image_url
                // ════════════════════════════════════════════════════════

                // Paso 1: Extraer texto → Gemma (sin tocar image_url)
                if (process.env.LM_API_URL) {
                    try {
                        const result = await analyzePDFWithGemmaText(filePath, defaultPDFQuery, port);
                        cleanup();
                        return res.json(result);
                    } catch (gemmaErr) {
                        logger.warn(`PDF Gemma texto falló (${gemmaErr.message}), probando Claude...`);
                    }
                }

                // Paso 2: Claude (soporta PDF nativo)
                if (process.env.VISION_API_KEY) {
                    try {
                        const result = await analyzePDFWithClaude(filePath, defaultPDFQuery);
                        cleanup();
                        return res.json(result);
                    } catch (claudeErr) {
                        logger.warn(`PDF Claude falló (${claudeErr.message}), probando Gemini...`);
                    }
                }

                // Paso 3: Gemini Docs
                if (process.env.GEMINI_DOCS_KEY || process.env.GEMINI_VISION_KEY) {
                    try {
                        const result = await analyzePDFWithGemini(filePath, defaultPDFQuery);
                        cleanup();
                        return res.json(result);
                    } catch (geminiErr) {
                        logger.warn(`PDF Gemini falló: ${geminiErr.message}`);
                    }
                }

                cleanup();
                return res.status(500).json({
                    success: false,
                    error: "No se pudo analizar el PDF. Instala pdf-parse para habilitarlo con Gemma local:\n  npm install pdf-parse",
                    hint: "Opciones:\n1) npm install pdf-parse (recomendado)\n2) GEMINI_DOCS_KEY=tu_clave\n3) VISION_API_KEY=tu_clave_anthropic",
                });

            } else if (isImage) {
                // ════════════════════════════════════════════════════════
                // PIPELINE IMAGEN — image_url con MIME válido
                // Orden: Gemma → Gemini → Claude → error
                // ════════════════════════════════════════════════════════

                if (process.env.LM_API_URL) {
                    try {
                        const result = await analyzeImageWithGemma(filePath, mimeType, defaultImgQuery, port);
                        if (result?.success) { cleanup(); return res.json(result); }
                    } catch (err) {
                        logger.warn(`Imagen Gemma falló (${err.message}), probando Gemini...`);
                    }
                }

                if (process.env.GEMINI_VISION_KEY) {
                    try {
                        const result = await analyzeImageWithGemini(filePath, mimeType, defaultImgQuery);
                        cleanup();
                        return res.json(result);
                    } catch (err) {
                        logger.warn(`Imagen Gemini falló: ${err.message}`);
                    }
                }

                if (process.env.VISION_API_KEY) {
                    try {
                        const base64 = fs.readFileSync(filePath).toString("base64");
                        const safeMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
                        const response = await axios.post(
                            "https://api.anthropic.com/v1/messages",
                            {
                                model: "claude-sonnet-4-6",
                                max_tokens: 1500,
                                messages: [{
                                    role: "user",
                                    content: [
                                        { type: "image", source: { type: "base64", media_type: safeMime, data: base64 } },
                                        { type: "text", text: defaultImgQuery },
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
                    } catch (err) {
                        logger.warn(`Imagen Claude falló: ${err.message}`);
                    }
                }

                cleanup();
                return res.status(500).json({
                    success: false,
                    error: "No se pudo analizar la imagen. Configurá GEMINI_VISION_KEY o VISION_API_KEY en .env.",
                });

            } else {
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