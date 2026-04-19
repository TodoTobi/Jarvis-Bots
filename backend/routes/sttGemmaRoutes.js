/**
 * sttGemmaRoutes.js — STT y análisis multimodal via Gemma 4 (LM Studio)
 *
 * Gemma 4 puede:
 *  - Transcribir/entender audio (base64)
 *  - Analizar imágenes, videos, PDFs
 *  - Responder preguntas sobre archivos multimedia
 *
 * Endpoints:
 *  POST /api/stt/transcribe      → transcripción de audio
 *  POST /api/gemma/analyze       → análisis multimodal (imagen/pdf/audio)
 *  GET  /api/gemma/status        → estado del modelo
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const logger = require("../logs/logger");

const GEMMA_MODEL = process.env.LM_MODEL || "gemma-4"; // ajusta al nombre exacto en LM Studio
const LM_BASE = (process.env.LM_API_URL || "http://localhost:1234/v1").replace(/\/$/, "");
const MAX_SIZE_MB = 25;

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */

function getAuthHeaders() {
    const h = { "Content-Type": "application/json" };
    if (process.env.LM_API_TOKEN) h["Authorization"] = `Bearer ${process.env.LM_API_TOKEN}`;
    return h;
}

/**
 * Llama a Gemma 4 con contenido multimodal (texto + imagen/audio en base64)
 * usando el endpoint /v1/chat/completions de LM Studio
 */
async function callGemmaMultimodal(parts, systemPrompt, maxTokens) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

    // parts puede ser string o array de { type, data }
    const userContent = Array.isArray(parts) ? parts : [{ type: "text", text: parts }];

    messages.push({ role: "user", content: userContent });

    const body = {
        model: GEMMA_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens || 1024,
    };

    const response = await axios.post(
        `${LM_BASE}/chat/completions`,
        body,
        {
            headers: getAuthHeaders(),
            timeout: 120000, // 2 min para archivos grandes
        }
    );

    return response.data?.choices?.[0]?.message?.content || "";
}

/* ══════════════════════════════════════════════════
   GET /api/gemma/status
══════════════════════════════════════════════════ */
router.get("/gemma/status", async (req, res) => {
    try {
        const response = await axios.get(`${LM_BASE}/models`, {
            headers: getAuthHeaders(),
            timeout: 5000,
        });
        const models = response.data?.data || [];
        const gemmaModel = models.find(m =>
            m.id.toLowerCase().includes("gemma") ||
            m.id === GEMMA_MODEL
        );
        res.json({
            ok: true,
            model: gemmaModel?.id || GEMMA_MODEL,
            available: !!gemmaModel,
            allModels: models.map(m => m.id),
            supportsMultimodal: true,
        });
    } catch (err) {
        res.json({ ok: false, error: err.message, model: GEMMA_MODEL });
    }
});

/* ══════════════════════════════════════════════════
   POST /api/stt/transcribe  (reemplaza el de Groq)
   Recibe audio en multipart y lo transcribe con Gemma 4
══════════════════════════════════════════════════ */
router.post("/stt/transcribe", async (req, res) => {
    let multer;
    try { multer = require("multer"); }
    catch { return res.status(503).json({ success: false, error: "npm install multer" }); }

    const uploadDir = path.resolve(__dirname, "../../tmp/stt");
    fs.mkdirSync(uploadDir, { recursive: true });

    const upload = multer({
        storage: multer.diskStorage({
            destination: uploadDir,
            filename: (req, file, cb) => cb(null, `audio_${Date.now()}${path.extname(file.originalname) || ".webm"}`),
        }),
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

        if (req.file.size < 500) {
            try { fs.unlinkSync(filePath); } catch { }
            return res.status(400).json({
                success: false,
                errorCode: "TOO_SHORT",
                error: "Audio demasiado corto o vacío",
            });
        }

        try {
            const audioData = fs.readFileSync(filePath);
            const base64Audio = audioData.toString("base64");
            const mimeType = req.file.mimetype || "audio/webm";

            logger.info(`STT Gemma: procesando audio ${req.file.size} bytes, tipo ${mimeType}`);

            const parts = [
                {
                    type: "image_url", // LM Studio usa image_url para media en general
                    image_url: {
                        url: `data:${mimeType};base64,${base64Audio}`,
                    },
                },
                {
                    type: "text",
                    text: "Por favor transcribe exactamente lo que se dice en este audio. Responde SOLO con el texto transcrito, sin explicaciones ni comentarios adicionales.",
                },
            ];

            const transcription = await callGemmaMultimodal(
                parts,
                "Eres un sistema de transcripción preciso. Transcribe el audio con exactitud.",
                512
            );

            try { fs.unlinkSync(filePath); } catch { }

            const text = transcription.trim();
            logger.info(`STT Gemma: transcripción "${text.substring(0, 80)}"`);

            return res.json({
                success: true,
                text,
                model: GEMMA_MODEL,
                provider: "gemma_local",
            });

        } catch (err) {
            try { fs.unlinkSync(filePath); } catch { }
            logger.error(`STT Gemma error: ${err.message}`);

            // Fallback: si Gemma no soporta audio, devolver error descriptivo
            return res.status(500).json({
                success: false,
                errorCode: "TRANSCRIPTION_FAILED",
                error: `Gemma no pudo transcribir el audio: ${err.message}. Verificá que el modelo soporte audio.`,
                fallbackSuggestion: "Intenta hablar más despacio o verifica el modelo cargado en LM Studio.",
            });
        }
    });
});

/* ══════════════════════════════════════════════════
   GET /api/stt/status
══════════════════════════════════════════════════ */
router.get("/stt/status", (req, res) => {
    res.json({
        configured: true,
        model: GEMMA_MODEL,
        provider: "gemma_local",
        maxSizeMB: MAX_SIZE_MB,
        formats: ["webm", "mp3", "wav", "ogg", "m4a", "flac", "mp4"],
    });
});

/* ══════════════════════════════════════════════════
   POST /api/gemma/analyze
   Análisis multimodal: imagen, PDF, audio, video
══════════════════════════════════════════════════ */
router.post("/gemma/analyze", async (req, res) => {
    let multer;
    try { multer = require("multer"); }
    catch { return res.status(503).json({ success: false, error: "npm install multer" }); }

    const uploadDir = path.resolve(__dirname, "../../tmp/gemma");
    fs.mkdirSync(uploadDir, { recursive: true });

    const upload = multer({
        storage: multer.diskStorage({
            destination: uploadDir,
            filename: (req, file, cb) => cb(null, `gemma_${Date.now()}${path.extname(file.originalname)}`),
        }),
        limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
    }).single("file");

    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        if (!req.file) return res.status(400).json({ success: false, error: "No se recibió archivo" });

        const filePath = req.file.path;
        const mimeType = req.file.mimetype || "application/octet-stream";
        const query = req.body?.query || "Describí el contenido de este archivo detalladamente en español.";

        try {
            const fileData = fs.readFileSync(filePath);
            const base64Data = fileData.toString("base64");

            logger.info(`Gemma analyze: ${mimeType} (${(fileData.length / 1024).toFixed(0)}KB)`);

            let mediaType = "image_url";
            let systemPrompt = "Eres Jarvis, un asistente que analiza archivos multimedia. Responde en español rioplatense.";

            if (mimeType.startsWith("audio/")) {
                systemPrompt = "Eres un analizador de audio. Transcribe y analiza el contenido sonoro. Responde en español.";
            } else if (mimeType === "application/pdf") {
                systemPrompt = "Eres un analizador de documentos PDF. Extrae y resume el contenido. Responde en español.";
            } else if (mimeType.startsWith("video/")) {
                systemPrompt = "Eres un analizador de video. Describe el contenido visual y cualquier audio. Responde en español.";
            }

            const parts = [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:${mimeType};base64,${base64Data}`,
                    },
                },
                {
                    type: "text",
                    text: query,
                },
            ];

            const responseText = await callGemmaMultimodal(parts, systemPrompt, 2048);

            try { fs.unlinkSync(filePath); } catch { }

            logger.info(`Gemma analyze: respuesta ${responseText.length} chars`);

            res.json({
                success: true,
                reply: responseText,
                model: GEMMA_MODEL,
                fileType: mimeType,
                intent: mimeType.startsWith("audio/") ? "audio_analysis"
                    : mimeType === "application/pdf" ? "document_analysis"
                    : mimeType.startsWith("video/") ? "video_analysis"
                    : "image_analysis",
                bot: "GemmaBot",
            });

        } catch (err) {
            try { fs.unlinkSync(filePath); } catch { }
            logger.error(`Gemma analyze error: ${err.message}`);
            res.status(500).json({ success: false, error: err.message });
        }
    });
});

/* ══════════════════════════════════════════════════
   POST /api/gemma/canvas
   Genera código para el Canvas (diagramas, HTML, gráficos)
══════════════════════════════════════════════════ */
router.post("/gemma/canvas", async (req, res) => {
    const { prompt, type } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: "prompt requerido" });

    const typeInstructions = {
        diagram: `Genera código Mermaid para un diagrama. Responde SOLO con el bloque de código Mermaid entre \`\`\`mermaid y \`\`\`. Sin explicaciones.`,
        html: `Genera código HTML/CSS/JS completo y funcional. Responde SOLO con el código HTML entre \`\`\`html y \`\`\`. Sin explicaciones.`,
        chart: `Genera código JavaScript con Chart.js para un gráfico. Incluye el HTML completo con el canvas. Responde SOLO con código entre \`\`\`html y \`\`\`.`,
        react: `Genera un componente React funcional. Responde SOLO con código entre \`\`\`jsx y \`\`\`. Sin imports externos excepto React.`,
        svg: `Genera código SVG inline. Responde SOLO con el código SVG entre \`\`\`svg y \`\`\`. Sin explicaciones.`,
        auto: `Analiza el pedido y genera el tipo de contenido más apropiado (Mermaid para diagramas, HTML para interfaces, SVG para ilustraciones). Especifica el tipo con el bloque de código apropiado.`,
    };

    const systemPrompt = `Eres un generador de contenido visual para el canvas de Jarvis.
${typeInstructions[type] || typeInstructions.auto}
Responde SIEMPRE en español cuando hay texto visible en el resultado.
IMPORTANTE: El código debe ser funcional y auto-contenido.`;

    try {
        const result = await callGemmaMultimodal(
            prompt,
            systemPrompt,
            4096
        );

        // Detectar qué tipo de contenido generó
        let detectedType = type || "unknown";
        let code = result;

        const mermaidMatch = result.match(/```mermaid\n([\s\S]+?)\n```/);
        const htmlMatch = result.match(/```html\n([\s\S]+?)\n```/);
        const svgMatch = result.match(/```svg\n([\s\S]+?)\n```/);
        const jsxMatch = result.match(/```jsx\n([\s\S]+?)\n```/);
        const jsMatch = result.match(/```(?:javascript|js)\n([\s\S]+?)\n```/);

        if (mermaidMatch) { detectedType = "mermaid"; code = mermaidMatch[1]; }
        else if (htmlMatch) { detectedType = "html"; code = htmlMatch[1]; }
        else if (svgMatch) { detectedType = "svg"; code = svgMatch[1]; }
        else if (jsxMatch) { detectedType = "react"; code = jsxMatch[1]; }
        else if (jsMatch) { detectedType = "javascript"; code = jsMatch[1]; }

        res.json({
            success: true,
            code,
            type: detectedType,
            rawResponse: result,
            model: GEMMA_MODEL,
        });

    } catch (err) {
        logger.error(`Gemma canvas error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;