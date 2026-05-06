/**
 * sttGemmaRoutes.js — v3 UNIFIED
 *
 * CAMBIOS vs v2:
 *  - STT: Gemma 4 NO soporta audio via llama.cpp GGUF todavía (error 500).
 *    Estrategia: Groq Whisper (si hay key real) → Web Speech API (browser-side)
 *  - Imágenes: Gemma 4 local via image_url (funciona ✅)
 *  - PDFs: extraer texto con pdf-parse → texto plano a Gemma (funciona ✅)
 *  - Audio: usar Groq o devolver instrucción para Web Speech
 *  - Canvas/diagramas: mejorado con sanitización automática
 *  - DoctorBot integration: Gemma puede analizarse a sí mismo
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { exec } = require("child_process");
const logger = require("../logs/logger");

const GEMMA_MODEL = process.env.LM_MODEL || "google/gemma-4-e4b";
const LM_BASE = (process.env.LM_API_URL || "http://localhost:1234/v1").replace(/\/$/, "");
const MAX_SIZE_MB = 25;

const WAKE_WORDS = [
    "sistema", "cistema", "sistima",
    "jarvis", "jarviz", "jarvi", "yarvis", "llarvis",
    "hey jarvis", "oye jarvis", "hey sistema",
];

const SEND_WORDS = ["enviar", "envía", "manda", "listo", "send"];

function processTranscription(raw) {
    if (!raw) return { text: "", hadWakeWord: false, hadSendWord: false };
    let text = raw.trim();
    let hadSendWord = false;
    for (const sw of SEND_WORDS) {
        const re = new RegExp(`[,\\.\\s]*${sw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,\\.\\s!]*$`, "i");
        if (re.test(text)) { text = text.replace(re, "").trim(); hadSendWord = true; break; }
    }
    let hadWakeWord = false;
    const sorted = [...WAKE_WORDS].sort((a, b) => b.length - a.length);
    for (const ww of sorted) {
        const escaped = ww.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`^${escaped}[,\\.\\s!¡\\?]*`, "i");
        if (re.test(text)) { text = text.replace(re, "").trim(); hadWakeWord = true; break; }
    }
    return { text, hadWakeWord, hadSendWord };
}

function getAuthHeaders() {
    const h = { "Content-Type": "application/json" };
    if (process.env.LM_API_TOKEN) h["Authorization"] = `Bearer ${process.env.LM_API_TOKEN}`;
    return h;
}

/**
 * Llama a Gemma 4 con contenido multimodal (texto + imágenes)
 * NO enviar audio — llama.cpp GGUF no lo soporta aún
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
            headers: getAuthHeaders(), timeout: 5000,
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
            supportsImages: true,
            supportsAudio: false, // llama.cpp GGUF no lo soporta aún
            supportsPDF: true,    // via pdf-parse → texto
        });
    } catch (err) {
        res.json({ ok: false, error: err.message, model: GEMMA_MODEL });
    }
});

/* ══════════════════════════════════════════════════
   GET /api/stt/status
══════════════════════════════════════════════════ */
router.get("/stt/status", (req, res) => {
    const groqKey = process.env.GROQ_API_KEY;
    const hasRealGroq = groqKey && !groqKey.startsWith("sk-lm-") && !groqKey.includes(":");

    res.json({
        configured: true,
        model: hasRealGroq ? "whisper-large-v3 (Groq)" : "Web Speech API (browser)",
        provider: hasRealGroq ? "groq" : "browser",
        maxSizeMB: MAX_SIZE_MB,
        formats: ["webm", "mp3", "wav", "ogg", "m4a"],
        wakeWords: ["sistema", "jarvis"],
        sendWord: "enviar",
        note: "Gemma 4 E4B soporta audio pero llama.cpp GGUF aún no lo implementa. Usando Groq/browser.",
    });
});

/* ══════════════════════════════════════════════════
   POST /api/stt/transcribe
   STT: Groq Whisper (si hay key real) → error claro con fallback info
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
            return res.status(400).json({ success: false, errorCode: "NO_FILE", error: "No se recibió archivo de audio" });
        }

        const filePath = req.file.path;

        if (req.file.size < 500) {
            try { fs.unlinkSync(filePath); } catch {}
            return res.status(400).json({ success: false, errorCode: "TOO_SHORT", error: "Audio demasiado corto" });
        }

        const groqKey = process.env.GROQ_API_KEY;
        const hasRealGroq = groqKey && !groqKey.startsWith("sk-lm-") && !groqKey.includes(":");

        if (!hasRealGroq) {
            try { fs.unlinkSync(filePath); } catch {}
            // Informar al frontend que use Web Speech API
            return res.json({
                success: false,
                errorCode: "USE_BROWSER_STT",
                error: "STT backend no disponible. El micrófono del chat usa Web Speech API del browser directamente.",
                useBrowserFallback: true,
            });
        }

        // Usar Groq Whisper
        try {
            const FormData = require("form-data");
            const https = require("https");
            const audioData = fs.readFileSync(filePath);
            const mimeType = req.file.mimetype || "audio/webm";

            const transcription = await new Promise((resolve, reject) => {
                const form = new FormData();
                form.append("file", audioData, {
                    filename: path.basename(filePath),
                    contentType: mimeType,
                });
                form.append("model", "whisper-large-v3");
                form.append("response_format", "verbose_json");
                form.append("temperature", "0");

                const lang = req.body?.language;
                if (lang) form.append("language", lang);

                const url = new URL("https://api.groq.com/openai/v1/audio/transcriptions");
                const reqHttp = https.request({
                    hostname: url.hostname,
                    path: url.pathname,
                    method: "POST",
                    headers: {
                        ...form.getHeaders(),
                        "Authorization": `Bearer ${groqKey}`,
                    },
                }, (httpRes) => {
                    let data = "";
                    httpRes.on("data", (c) => data += c);
                    httpRes.on("end", () => {
                        try {
                            const parsed = JSON.parse(data);
                            if (httpRes.statusCode >= 400) {
                                reject(new Error(parsed.error?.message || `Groq ${httpRes.statusCode}`));
                            } else {
                                resolve(parsed);
                            }
                        } catch { reject(new Error(`Parse error: ${data.substring(0, 200)}`)); }
                    });
                });
                reqHttp.on("error", reject);
                reqHttp.setTimeout(60000, () => { reqHttp.destroy(); reject(new Error("Groq timeout")); });
                form.pipe(reqHttp);
            });

            try { fs.unlinkSync(filePath); } catch {}

            const rawText = (transcription.text || "").trim();
            const { text, hadWakeWord, hadSendWord } = processTranscription(rawText);

            logger.info(`STT Groq: "${text.substring(0, 80)}" | wake=${hadWakeWord} | send=${hadSendWord}`);

            return res.json({
                success: true,
                text,
                rawText,
                hadWakeWord,
                hadSendWord,
                language: transcription.language,
                model: "whisper-large-v3",
                provider: "groq",
            });

        } catch (err) {
            try { fs.unlinkSync(filePath); } catch {}
            logger.error(`STT Groq error: ${err.message}`);
            return res.status(500).json({
                success: false,
                errorCode: "TRANSCRIPTION_FAILED",
                error: `STT falló: ${err.message}`,
            });
        }
    });
});

/* ══════════════════════════════════════════════════
   POST /api/gemma/analyze
   Análisis multimodal via Gemma 4 local
   - Imágenes: ✅ image_url con base64
   - PDFs: ✅ extraer texto → texto plano (NO como imagen)
   - Audio: ❌ no soportado en llama.cpp GGUF aún
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
        const cleanup = () => { try { fs.unlinkSync(filePath); } catch {} };

        logger.info(`Gemma analyze: ${mimeType} (${(req.file.size / 1024).toFixed(0)}KB)`);

        try {
            // ── IMÁGENES → image_url base64 (funciona con Gemma 4 en LM Studio) ──
            if (mimeType.startsWith("image/")) {
                const fileData = fs.readFileSync(filePath);
                const base64Data = fileData.toString("base64");
                // Normalizar MIME a formatos seguros
                const safeMime = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(mimeType)
                    ? mimeType : "image/jpeg";

                const parts = [
                    {
                        type: "image_url",
                        image_url: { url: `data:${safeMime};base64,${base64Data}` },
                    },
                    { type: "text", text: query },
                ];

                const responseText = await callGemmaMultimodal(
                    parts,
                    "Eres Jarvis, un analizador de imágenes. Describís todo lo que ves con detalle. Respondés en español rioplatense.",
                    2048
                );

                cleanup();
                logger.info(`Gemma analyze imagen: ${responseText.length} chars`);
                return res.json({ success: true, reply: responseText, model: GEMMA_MODEL, fileType: mimeType, intent: "image_analysis", bot: "GemmaBot" });
            }

            // ── PDFs → extraer texto → enviar como texto plano a Gemma ──
            if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) {
                let extractedText = null;

                // Método 1: pdf-parse
                try {
                    const pdfParse = require("pdf-parse");
                    const buffer = fs.readFileSync(filePath);
                    const data = await pdfParse(buffer);
                    extractedText = (data.text || "").trim().substring(0, 8000);
                    logger.info(`PDF text extracted: ${extractedText.length} chars via pdf-parse`);
                } catch (pdfErr) {
                    if (!pdfErr.message.includes("Cannot find module")) {
                        logger.warn(`pdf-parse error: ${pdfErr.message}`);
                    }
                }

                // Método 2: pdftotext CLI
                if (!extractedText || extractedText.length < 20) {
                    const tmpTxt = filePath + "_text.txt";
                    try {
                        await new Promise((resolve, reject) => {
                            exec(`pdftotext "${filePath}" "${tmpTxt}"`, { timeout: 15000 }, (err) => {
                                if (err) reject(err); else resolve();
                            });
                        });
                        if (fs.existsSync(tmpTxt)) {
                            extractedText = fs.readFileSync(tmpTxt, "utf-8").trim().substring(0, 8000);
                            try { fs.unlinkSync(tmpTxt); } catch {}
                        }
                    } catch {}
                }

                if (!extractedText || extractedText.length < 20) {
                    cleanup();
                    return res.status(422).json({
                        success: false,
                        error: "No se pudo extraer texto del PDF. Instalá pdf-parse:\n  npm install pdf-parse\nO poppler:\n  apt install poppler-utils",
                    });
                }

                const prompt = `${query}\n\n---\nCONTENIDO DEL PDF:\n${extractedText}\n---\n\nRespondé en español. Sé detallado y estructurado.`;
                const responseText = await callGemmaMultimodal(
                    prompt,
                    "Eres Jarvis, analizador de documentos. Respondés en español rioplatense con análisis detallado.",
                    2048
                );

                cleanup();
                logger.info(`Gemma analyze PDF: ${responseText.length} chars`);
                return res.json({ success: true, reply: responseText, model: GEMMA_MODEL, fileType: "application/pdf", intent: "document_analysis", bot: "GemmaBot" });
            }

            // ── AUDIO → no soportado en llama.cpp GGUF aún ──
            if (mimeType.startsWith("audio/")) {
                cleanup();
                return res.status(422).json({
                    success: false,
                    errorCode: "AUDIO_NOT_SUPPORTED",
                    error: "Gemma 4 soporta audio pero llama.cpp GGUF aún no lo implementa. Usá el micrófono del chat que usa Web Speech API del browser.",
                    suggestion: "Para STT: activá el micrófono 🎤 en el chat y el browser transcribe directamente.",
                });
            }

            cleanup();
            return res.status(400).json({
                success: false,
                error: `Tipo de archivo no soportado: ${mimeType}. Usá imágenes (PNG, JPG, WEBP) o PDF.`,
            });

        } catch (err) {
            cleanup();
            logger.error(`Gemma analyze error: ${err.message}`);
            res.status(500).json({ success: false, error: err.message });
        }
    });
});

/* ══════════════════════════════════════════════════
   POST /api/gemma/canvas
   Genera código para el Canvas con sanitización Mermaid
══════════════════════════════════════════════════ */
router.post("/gemma/canvas", async (req, res) => {
    const { prompt, type } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: "prompt requerido" });

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
        html: `Genera código HTML/CSS/JS completo y funcional para una landing page o interfaz.
REGLAS:
- HTML completo con DOCTYPE, head, body
- CSS inline o en <style>
- JavaScript funcional si es necesario
- Diseño responsivo y moderno
- Responde SOLO con código entre \`\`\`html y \`\`\`. Sin explicaciones.`,
        landing: `Genera una landing page HTML completa, moderna y atractiva.
REGLAS:
- HTML completo con DOCTYPE, head, body
- CSS moderno con gradientes, sombras, animaciones CSS
- Navbar, hero section, features, footer
- JavaScript para interactividad básica (scroll suave, animaciones)
- Colores modernos y tipografía limpia
- COMPLETAMENTE funcional y visualmente impresionante
- Responde SOLO con código entre \`\`\`html y \`\`\`.`,
        chart: `Genera código HTML completo con Chart.js para un gráfico. Incluye el HTML completo con el canvas. Responde SOLO con código entre \`\`\`html y \`\`\`.`,
        react: `Genera un componente React funcional. Responde SOLO con código entre \`\`\`jsx y \`\`\`. Sin imports externos excepto React.`,
        svg: `Genera código SVG inline. Responde SOLO con el código SVG entre \`\`\`svg y \`\`\`. Sin explicaciones.`,
        script: `Genera un script ejecutable. Si es Python entre \`\`\`python y \`\`\`, si es bash entre \`\`\`bash y \`\`\`, si es PowerShell entre \`\`\`powershell y \`\`\`. Sin explicaciones extra.`,
        auto: `Analiza el pedido y genera el tipo más apropiado:
- Para diagramas/flows/esquemas: usa Mermaid con labels entre comillas dobles si tienen espacios
- Para landing pages/websites: usa HTML completo y moderno
- Para interfaces/formularios: usa HTML
- Para ilustraciones: usa SVG
- Para scripts/programas: usa Python o bash
Si es una landing page, generá HTML completo e impresionante.
Usa el bloque de código apropiado.`,
    };

    const systemPrompt = `Eres Jarvis, un generador de contenido visual y código.
${typeInstructions[type] || typeInstructions.auto}
El código debe ser funcional, auto-contenido y visualmente impresionante.
IMPORTANTE para Mermaid: labels con espacios SIEMPRE entre comillas dobles.
Para HTML: genera código COMPLETO con DOCTYPE, head y body.`;

    try {
        const result = await callGemmaMultimodal(prompt, systemPrompt, 6000);

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

        if (mermaidMatch)   { detectedType = "mermaid";     code = mermaidMatch[1]; }
        else if (htmlMatch) { detectedType = "html";        code = htmlMatch[1]; }
        else if (svgMatch)  { detectedType = "svg";         code = svgMatch[1]; }
        else if (jsxMatch)  { detectedType = "react";       code = jsxMatch[1]; }
        else if (pyMatch)   { detectedType = "python";      code = pyMatch[1]; }
        else if (bashMatch) { detectedType = "bash";        code = bashMatch[1]; }
        else if (psMatch)   { detectedType = "powershell";  code = psMatch[1]; }
        else if (jsMatch)   { detectedType = "javascript";  code = jsMatch[1]; }

        // Sanitizar Mermaid
        if (detectedType === "mermaid") {
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

        res.json({ success: true, code, type: detectedType, rawResponse: result, model: GEMMA_MODEL });

    } catch (err) {
        logger.error(`Gemma canvas error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ══════════════════════════════════════════════════
   POST /api/terminal/exec
══════════════════════════════════════════════════ */
router.post("/terminal/exec", async (req, res) => {
    if (process.env.COMPUTER_CONTROL_ENABLED !== "true") {
        return res.status(403).json({ success: false, error: "Ejecución de terminal desactivada. Activá COMPUTER_CONTROL_ENABLED=true en .env" });
    }
    const { command, workdir } = req.body;
    if (!command) return res.status(400).json({ success: false, error: "command requerido" });
    const BLOCKED = [/^rm\s+-rf\s+\//, /format\s+c:/i, /del\s+\/[sq].*system/i, /rd\s+\/s\s+\/q\s+[a-z]:\\/i, /shutdown\s+\/[srf]/i];
    for (const pattern of BLOCKED) {
        if (pattern.test(command)) return res.status(403).json({ success: false, error: "Comando bloqueado por seguridad" });
    }
    const cwd = workdir || process.cwd();
    logger.info(`Terminal exec: "${command}" en "${cwd}"`);
    exec(command, { cwd, shell: true, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            return res.json({ success: false, error: err.message, stderr: stderr?.trim() || "", stdout: stdout?.trim() || "" });
        }
        res.json({ success: true, stdout: stdout?.trim() || "", stderr: stderr?.trim() || "", command });
    });
});

/* ══════════════════════════════════════════════════
   POST /api/gemma/chat
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

/* ══════════════════════════════════════════════════
   POST /api/gemma/self-diagnose
   DoctorBot: Gemma analiza su propio código
══════════════════════════════════════════════════ */
router.post("/gemma/self-diagnose", async (req, res) => {
    const { targetFile, question } = req.body;
    const projectRoot = path.resolve(__dirname, "../..");

    let codeContext = "";
    if (targetFile) {
        const fullPath = path.resolve(projectRoot, targetFile);
        if (fs.existsSync(fullPath) && fullPath.startsWith(projectRoot)) {
            try {
                codeContext = fs.readFileSync(fullPath, "utf-8").substring(0, 5000);
            } catch {}
        }
    }

    // Leer los últimos errores del log
    let recentErrors = "";
    const errorLogPath = path.resolve(__dirname, "../logs/error.log");
    if (fs.existsSync(errorLogPath)) {
        const lines = fs.readFileSync(errorLogPath, "utf-8").split("\n").filter(Boolean).slice(-20);
        recentErrors = lines.join("\n");
    }

    const prompt = `Eres Jarvis, un asistente IA que puede analizarse a sí mismo.

${codeContext ? `CÓDIGO A ANALIZAR (${targetFile}):\n\`\`\`javascript\n${codeContext}\n\`\`\`\n` : ""}
${recentErrors ? `ERRORES RECIENTES:\n\`\`\`\n${recentErrors}\n\`\`\`\n` : ""}

PREGUNTA: ${question || "¿Cuáles son los errores actuales y cómo se pueden solucionar?"}

Respondé en español rioplatense. Sé específico sobre qué está fallando y cómo arreglarlo.
Si detectás errores en el log, explicá qué los causa y dá el fix exacto.`;

    try {
        const reply = await callGemmaMultimodal(
            prompt,
            "Eres Jarvis, un sistema de IA con capacidad de autodiagnóstico. Analizás tu propio código y logs para detectar y solucionar problemas.",
            2048
        );
        res.json({ success: true, reply, model: GEMMA_MODEL });
    } catch (err) {
        logger.error(`Gemma self-diagnose error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;