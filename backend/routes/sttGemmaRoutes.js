/**
 * sttGemmaRoutes.js — STT y análisis multimodal via Gemma 4 (LM Studio)
 *
 * FIXES v2:
 *  - Wake words "jarvis" y "sistema" correctamente detectadas y eliminadas del texto
 *  - STT usa Gemma 4 local (multimodal) en vez de Groq
 *  - Imágenes y PDFs procesados por Gemma 4, NO por Gemini (eliminado)
 *  - Canvas/diagramas mejorados
 *  - Nuevo endpoint /api/terminal/exec para ejecutar comandos desde el chat
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { exec } = require("child_process");
const logger = require("../logs/logger");

const GEMMA_MODEL = process.env.LM_MODEL || "gemma-3-4b-it";
const LM_BASE = (process.env.LM_API_URL || "http://localhost:1234/v1").replace(/\/$/, "");
const MAX_SIZE_MB = 25;

// ── Wake words soportadas ────────────────────────────────────────────────────
const WAKE_WORDS = [
    // "sistema" (wake word principal)
    "sistema", "système", "cistema", "sistima", "sisthema",
    // "jarvis" y variantes STT
    "jarvis", "jarviz", "jarvi", "jarves", "jarvist",
    "llarvis", "llarvi", "yarvis", "yarvi",
    "harvis", "garvis", "marvis",
    // Con activadores
    "hey jarvis", "oye jarvis", "hei jarvis",
    "hey sistema", "oye sistema",
    "ey jarvis", "ey sistema",
    "a ver jarvis", "a ver sistema",
];

// ── Palabra de envío (termina la grabación) ──────────────────────────────────
const SEND_WORDS = ["enviar", "envía", "manda", "listo", "ok enviar", "send"];

/**
 * Elimina el wake word del inicio del texto transcripto.
 * Retorna { text, hadWakeWord, hadSendWord }
 */
function processTranscription(raw) {
    if (!raw) return { text: "", hadWakeWord: false, hadSendWord: false };

    let text = raw.trim();

    // Detectar y eliminar palabra de envío al final
    let hadSendWord = false;
    for (const sw of SEND_WORDS) {
        const re = new RegExp(`[,\\.\\s]*${sw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,\\.\\s!]*$`, "i");
        if (re.test(text)) {
            text = text.replace(re, "").trim();
            hadSendWord = true;
            break;
        }
    }

    // Detectar y eliminar wake word al inicio
    let hadWakeWord = false;
    const sorted = [...WAKE_WORDS].sort((a, b) => b.length - a.length);
    for (const ww of sorted) {
        const escaped = ww.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`^${escaped}[,\\.\\s!¡\\?]*`, "i");
        if (re.test(text)) {
            text = text.replace(re, "").trim();
            hadWakeWord = true;
            break;
        }
    }

    return { text, hadWakeWord, hadSendWord };
}

/* ── HELPERS ────────────────────────────────────────────────────────────────── */

function getAuthHeaders() {
    const h = { "Content-Type": "application/json" };
    if (process.env.LM_API_TOKEN) h["Authorization"] = `Bearer ${process.env.LM_API_TOKEN}`;
    return h;
}

/**
 * Llama a Gemma 4 con contenido multimodal via LM Studio
 */
async function callGemmaMultimodal(parts, systemPrompt, maxTokens) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

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
        { headers: getAuthHeaders(), timeout: 120000 }
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
            m.id.toLowerCase().includes("gemma") || m.id === GEMMA_MODEL
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
   GET /api/stt/status
══════════════════════════════════════════════════ */
router.get("/stt/status", (req, res) => {
    res.json({
        configured: true,
        model: GEMMA_MODEL,
        provider: "gemma_local",
        maxSizeMB: MAX_SIZE_MB,
        formats: ["webm", "mp3", "wav", "ogg", "m4a", "flac", "mp4"],
        wakeWords: ["sistema", "jarvis"],
        sendWord: "enviar",
    });
});

/* ══════════════════════════════════════════════════
   POST /api/stt/transcribe
   Recibe audio y lo transcribe con Gemma 4
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
        if (uploadErr) return res.status(400).json({ success: false, error: uploadErr.message });
        if (!req.file) {
            return res.status(400).json({
                success: false,
                errorCode: "NO_FILE",
                error: "No se recibió archivo de audio",
            });
        }

        const filePath = req.file.path;

        if (req.file.size < 500) {
            try { fs.unlinkSync(filePath); } catch {}
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
                    type: "image_url",
                    image_url: {
                        url: `data:${mimeType};base64,${base64Audio}`,
                    },
                },
                {
                    type: "text",
                    text: "Transcribe exactamente lo que se dice en este audio en español. Responde SOLO con el texto transcrito, sin explicaciones, sin comillas, sin comentarios adicionales.",
                },
            ];

            const rawTranscription = await callGemmaMultimodal(
                parts,
                "Eres un sistema de transcripción de audio preciso. Transcribes exactamente lo que escuchas en español. Solo devuelves el texto transcrito.",
                512
            );

            try { fs.unlinkSync(filePath); } catch {}

            // Procesar wake words y palabra de envío
            const { text, hadWakeWord, hadSendWord } = processTranscription(rawTranscription.trim());

            logger.info(`STT Gemma: transcripción "${text.substring(0, 80)}" | wakeWord=${hadWakeWord} | sendWord=${hadSendWord}`);

            return res.json({
                success: true,
                text,
                rawText: rawTranscription.trim(),
                hadWakeWord,
                hadSendWord,
                model: GEMMA_MODEL,
                provider: "gemma_local",
            });

        } catch (err) {
            try { fs.unlinkSync(filePath); } catch {}
            logger.error(`STT Gemma error: ${err.message}`);

            return res.status(500).json({
                success: false,
                errorCode: "TRANSCRIPTION_FAILED",
                error: `Gemma no pudo transcribir: ${err.message}`,
                fallbackSuggestion: "Verificá que el modelo en LM Studio soporte audio/multimodal.",
            });
        }
    });
});

/* ══════════════════════════════════════════════════
   POST /api/gemma/analyze
   Análisis multimodal: imagen, PDF, audio, video
   SIN GEMINI — todo por Gemma 4 local
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

            let systemPrompt = "Eres Jarvis, un asistente que analiza archivos. Respondés en español rioplatense.";

            if (mimeType.startsWith("audio/")) {
                systemPrompt = "Eres un analizador de audio. Transcribe y describe el contenido. Respondés en español rioplatense.";
            } else if (mimeType === "application/pdf") {
                systemPrompt = "Eres un analizador de documentos PDF. Extraés y resumís el contenido. Respondés en español rioplatense.";
            } else if (mimeType.startsWith("video/")) {
                systemPrompt = "Eres un analizador de video. Describís el contenido visual. Respondés en español rioplatense.";
            } else if (mimeType.startsWith("image/")) {
                systemPrompt = "Eres un analizador de imágenes. Describís todo lo que ves con detalle. Respondés en español rioplatense.";
            }

            const parts = [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:${mimeType};base64,${base64Data}`,
                    },
                },
                { type: "text", text: query },
            ];

            const responseText = await callGemmaMultimodal(parts, systemPrompt, 2048);

            try { fs.unlinkSync(filePath); } catch {}

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
            try { fs.unlinkSync(filePath); } catch {}
            logger.error(`Gemma analyze error: ${err.message}`);
            res.status(500).json({ success: false, error: err.message });
        }
    });
});

/**
 * PATCH — sttGemmaRoutes.js → función /api/gemma/canvas
 *
 * CAMBIOS vs original:
 *   1. Importar mermaidSanitizer al inicio del archivo (agregá esta línea)
 *   2. Reemplazar router.post("/gemma/canvas"...) con esta versión
 *
 * ─────────────────────────────────────────────────────
 * PASO 1: Al inicio de sttGemmaRoutes.js, después de los requires, agregá:
 *
 *   const { sanitizeMermaid } = require("../utils/mermaidSanitizer");
 *
 * PASO 2: Reemplazá TODO el bloque router.post("/gemma/canvas"...) con esto:
 * ─────────────────────────────────────────────────────
 */

/* ══════════════════════════════════════════════════
   POST /api/gemma/canvas  — VERSIÓN CORREGIDA
   Genera código para el Canvas con sanitización Mermaid
══════════════════════════════════════════════════ */
router.post("/gemma/canvas", async (req, res) => {
    const { prompt, type } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: "prompt requerido" });

    // Prompts más estrictos para evitar errores de sintaxis
    const typeInstructions = {
        diagram: `Genera código Mermaid VÁLIDO para un diagrama de flujo.
REGLAS CRÍTICAS:
- Usa SOLO letras, números y guiones bajos en los IDs de nodos (ej: nodo1, paso_a)
- Si el label tiene espacios o caracteres especiales, SIEMPRE usa comillas dobles: A["Mi Label"]
- NO uses punto y coma al final de las líneas
- Usa flowchart TD como tipo por defecto
- Responde SOLO con el bloque entre \`\`\`mermaid y \`\`\`. Sin explicaciones.

Ejemplo correcto:
\`\`\`mermaid
flowchart TD
    A["Inicio del proceso"] --> B["Validar datos"]
    B --> C{"¿Es válido?"}
    C -->|"Sí"| D["Procesar"]
    C -->|"No"| E["Mostrar error"]
    D --> F["Fin"]
\`\`\``,

        html: `Genera código HTML/CSS/JS completo y funcional. Responde SOLO con el código entre \`\`\`html y \`\`\`. Sin explicaciones.`,
        chart: `Genera código HTML completo con Chart.js para un gráfico. Incluye el HTML completo con el canvas. Responde SOLO con código entre \`\`\`html y \`\`\`.`,
        react: `Genera un componente React funcional. Responde SOLO con código entre \`\`\`jsx y \`\`\`. Sin imports externos excepto React.`,
        svg: `Genera código SVG inline. Responde SOLO con el código SVG entre \`\`\`svg y \`\`\`. Sin explicaciones.`,
        script: `Genera un script ejecutable. Si es Python entre \`\`\`python y \`\`\`, si es bash entre \`\`\`bash y \`\`\`, si es PowerShell entre \`\`\`powershell y \`\`\`. Sin explicaciones extra.`,
        code: `Genera código funcional en el lenguaje más apropiado. Usa los bloques de código correspondientes.`,
        auto: `Analiza el pedido y genera el tipo más apropiado.
- Para diagramas/flows/esquemas: usa Mermaid CON LABELS ENTRE COMILLAS DOBLES si tienen espacios
- Para interfaces/formularios/páginas: usa HTML
- Para ilustraciones: usa SVG
- Para scripts/programas: usa Python o bash

Si usas Mermaid, SIEMPRE envuelve labels con espacios en comillas dobles: A["Mi nodo"]
Usa el bloque de código apropiado.`,
    };

    const systemPrompt = `Eres Jarvis, un generador de contenido visual y código para el canvas.
${typeInstructions[type] || typeInstructions.auto}
Responde SIEMPRE en español cuando hay texto visible en el resultado.
El código debe ser funcional y auto-contenido.
IMPORTANTE para Mermaid: labels con espacios SIEMPRE entre comillas dobles.`;

    try {
        const result = await callGemmaMultimodal(prompt, systemPrompt, 4096);

        // Detectar tipo de contenido generado
        let detectedType = type || "unknown";
        let code = result;

        const mermaidMatch = result.match(/```mermaid\n([\s\S]+?)\n?```/);
        const htmlMatch    = result.match(/```html\n([\s\S]+?)\n?```/);
        const svgMatch     = result.match(/```svg\n([\s\S]+?)\n?```/);
        const jsxMatch     = result.match(/```jsx\n([\s\S]+?)\n?```/);
        const jsMatch      = result.match(/```(?:javascript|js)\n([\s\S]+?)\n?```/);
        const pyMatch      = result.match(/```python\n([\s\S]+?)\n?```/);
        const bashMatch    = result.match(/```bash\n([\s\S]+?)\n?```/);
        const psMatch      = result.match(/```(?:powershell|ps1)\n([\s\S]+?)\n?```/);

        if (mermaidMatch)  { detectedType = "mermaid";     code = mermaidMatch[1]; }
        else if (htmlMatch){ detectedType = "html";         code = htmlMatch[1]; }
        else if (svgMatch) { detectedType = "svg";          code = svgMatch[1]; }
        else if (jsxMatch) { detectedType = "react";        code = jsxMatch[1]; }
        else if (pyMatch)  { detectedType = "python";       code = pyMatch[1]; }
        else if (bashMatch){ detectedType = "bash";         code = bashMatch[1]; }
        else if (psMatch)  { detectedType = "powershell";   code = psMatch[1]; }
        else if (jsMatch)  { detectedType = "javascript";   code = jsMatch[1]; }

        // ── SANITIZAR MERMAID antes de devolver ──────────────────────────────
        if (detectedType === "mermaid") {
            // Importar sanitizer (agregá el require al inicio del archivo)
            try {
                const { sanitizeMermaid } = require("../utils/mermaidSanitizer");
                const cleaned = sanitizeMermaid(code);
                if (cleaned !== code) {
                    logger.info(`Canvas: Mermaid sanitizado (${code.length} → ${cleaned.length} chars)`);
                    code = cleaned;
                }
            } catch (sanitizeErr) {
                logger.warn(`Canvas: no se pudo sanitizar Mermaid: ${sanitizeErr.message}`);
            }
        }

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

/* ══════════════════════════════════════════════════
   POST /api/terminal/exec
   Ejecuta comandos en la terminal del sistema
   SEGURIDAD: solo se ejecutan si COMPUTER_CONTROL_ENABLED=true
══════════════════════════════════════════════════ */
router.post("/terminal/exec", async (req, res) => {
    if (process.env.COMPUTER_CONTROL_ENABLED !== "true") {
        return res.status(403).json({
            success: false,
            error: "Ejecución de terminal desactivada. Activá COMPUTER_CONTROL_ENABLED=true en .env",
        });
    }

    const { command, workdir, shell: useShell } = req.body;
    if (!command) return res.status(400).json({ success: false, error: "command requerido" });

    // Comandos bloqueados por seguridad
    const BLOCKED = [
        /^rm\s+-rf\s+\//, /format\s+c:/i, /del\s+\/[sq].*system/i,
        /rd\s+\/s\s+\/q\s+[a-z]:\\/i, /shutdown\s+\/[srf]/i,
    ];
    for (const pattern of BLOCKED) {
        if (pattern.test(command)) {
            return res.status(403).json({ success: false, error: "Comando bloqueado por seguridad" });
        }
    }

    const cwd = workdir || process.cwd();
    logger.info(`Terminal exec: "${command}" en "${cwd}"`);

    exec(command, { cwd, shell: true, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            return res.json({
                success: false,
                error: err.message,
                stderr: stderr?.trim() || "",
                stdout: stdout?.trim() || "",
            });
        }
        res.json({
            success: true,
            stdout: stdout?.trim() || "",
            stderr: stderr?.trim() || "",
            command,
        });
    });
});

/* ══════════════════════════════════════════════════
   GET /api/gemma/chat  (chat de texto simple)
   Para cuando el usuario manda texto a Gemma directamente
══════════════════════════════════════════════════ */
router.post("/gemma/chat", async (req, res) => {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "message requerido" });

    try {
        const systemPrompt = context || "Eres Jarvis, asistente IA de Tobías. Respondés en español rioplatense, de forma directa y útil.";
        const reply = await callGemmaMultimodal(message, systemPrompt, 1024);
        res.json({ success: true, reply, model: GEMMA_MODEL });
    } catch (err) {
        logger.error(`Gemma chat error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;