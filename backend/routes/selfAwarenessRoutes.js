/**
 * selfAwarenessRoutes.js — Jarvis conoce su propio código
 *
 * Permite a Jarvis navegar su árbol de archivos y leer código específico
 * cuando el usuario pregunta sobre su arquitectura.
 *
 * Estrategia de tokens-eficiente:
 *  1. Primero expone solo el árbol de directorios (nombres de archivos)
 *  2. Cuando necesita detalles, lee solo el archivo específico
 *  3. Nunca carga todo el código de golpe
 *
 * Endpoints:
 *  GET  /api/self/tree         → árbol de archivos del proyecto
 *  POST /api/self/read         → leer archivo específico
 *  POST /api/self/explain      → Gemma explica un archivo/módulo
 *  GET  /api/self/architecture → resumen de arquitectura
 */

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("../logs/logger");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BACKEND_ROOT = path.resolve(__dirname, "..");
const LM_BASE = (process.env.LM_API_URL || "http://localhost:1234/v1").replace(/\/$/, "");

// Archivos/carpetas que NO exponer nunca
const EXCLUDE_DIRS = new Set([
    "node_modules", ".git", ".next", "dist", "build",
    "__pycache__", ".cache", "tmp", "screenshots",
]);
const EXCLUDE_EXTS = new Set([
    ".env", ".lock", ".log", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".mp4", ".mp3", ".wav", ".pdf",
    ".exe", ".dll", ".sys",
]);

// Descripción de los módulos principales (conocimiento hardcoded para ahorrar tokens)
const MODULE_DESCRIPTIONS = {
    "backend/server.js": "Punto de entrada del backend Express. Registra todas las rutas, configura CORS, multer y maneja errores globales.",
    "backend/bots/BotManager.js": "Orquestador central. Recibe intents del ModelService y los enruta al bot correcto. Maneja activación/desactivación y auto-deactivate por inactividad.",
    "backend/bots/Bot.js": "Clase base abstracta para todos los bots. Define lifecycle (activate/deactivate), manejo de estado y validación de parámetros.",
    "backend/bots/WebBot.js": "Conversación general con el LLM local. Recibe queries y los pasa a ModelService para respuesta en lenguaje natural.",
    "backend/bots/BatBot.js": "Ejecutor de scripts .bat en Windows. Usa whitelist de seguridad (bat_whitelist.json) para evitar ejecución arbitraria.",
    "backend/bots/DriveBot.js": "Gestión de archivos locales y sync con Google Drive. Usa NLPService para fuzzy matching de nombres de archivos.",
    "backend/bots/ComputerBot.js": "Control del PC mediante visión IA. Toma screenshots, los analiza con Gemma/Claude, ejecuta acciones via pyautogui.",
    "backend/bots/SearchBot.js": "Búsqueda web real via DuckDuckGo HTML scraping. No usa API de pago, parsea HTML directamente.",
    "backend/bots/VisionBot.js": "Análisis de imágenes, PDFs y audio. Puede usar Claude, OpenAI GPT-4V o Gemma local.",
    "backend/bots/NetBot.js": "Control de dispositivos Android via ADB (Android Debug Bridge). Soporta TV y teléfonos.",
    "backend/bots/WhatsAppBot.js": "Bot de WhatsApp usando whatsapp-web.js (Puppeteer). Permite control remoto del sistema via mensajes.",
    "backend/bots/MediaBot.js": "Control multimedia: YouTube, Spotify, VLC, volumen. Internamente usa BatBot para ejecutar scripts.",
    "backend/bots/DoctorBot.js": "Diagnóstico automático de errores. Analiza patrones de error y sugiere soluciones. Se activa cuando otro bot falla.",
    "backend/bots/GoogleDocsBot.js": "Integración con Google Docs API via Service Account. Lee, escribe y duplica documentos.",
    "backend/services/ModelService.js": "Cerebro NLP. Tiene QUICK_RULES (clasificador por regex sin LLM) y fallback al LLM local. Genera intents desde mensajes del usuario.",
    "backend/services/NLPService.js": "Motor de NLP: Levenshtein, similitud de strings, scoring de archivos, búsqueda fuzzy en filesystem, ContextManager conversacional.",
    "backend/services/LanguageAliases.js": "Diccionario de aliases lingüísticos rioplatenses: apps, typos, verbos informales, tipos de archivo, carpetas del sistema.",
    "backend/services/SupabaseService.js": "Persistencia del historial de chat via Supabase (PostgreSQL). Maneja conversaciones, proyectos y mensajes.",
    "backend/controllers/chatController.js": "Controlador HTTP del chat. Recibe mensaje → genera intent → ejecuta bot → persiste en Supabase → responde.",
    "backend/utils/InstructionLoader.js": "Carga y cachea los archivos .md de instrucciones (identity, soul, user, memory). Construye el contexto completo para el LLM.",
    "backend/config/bat_whitelist.json": "Lista blanca de scripts .bat autorizados. Define path, label, categoría, descripción y timeout de cada script.",
    "backend/config/devices.json": "Registro de dispositivos Android (TV, teléfonos). Define IP, puerto ADB, MAC para Wake-on-LAN.",
};

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */

function buildFileTree(dir, relativeTo, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) return null;
    const base = path.basename(dir);
    if (EXCLUDE_DIRS.has(base.toLowerCase())) return null;

    const relPath = path.relative(relativeTo, dir).replace(/\\/g, "/");
    const node = { name: base, path: relPath, type: "dir", children: [] };

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return node; }

    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const ext = path.extname(entry.name).toLowerCase();

        if (entry.isDirectory()) {
            const child = buildFileTree(entryPath, relativeTo, maxDepth, currentDepth + 1);
            if (child) node.children.push(child);
        } else if (!EXCLUDE_EXTS.has(ext) && !entry.name.startsWith(".")) {
            const relFilePath = path.relative(relativeTo, entryPath).replace(/\\/g, "/");
            const desc = MODULE_DESCRIPTIONS[relFilePath] || null;
            node.children.push({
                name: entry.name,
                path: relFilePath,
                type: "file",
                ext,
                description: desc,
            });
        }
    }

    return node;
}

function findFileByPartialPath(partialPath) {
    // Busca un archivo por nombre parcial en el proyecto
    const results = [];

    const walk = (dir, depth) => {
        if (depth > 6) return;
        const base = path.basename(dir).toLowerCase();
        if (EXCLUDE_DIRS.has(base)) return;

        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            const ep = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(ep, depth + 1);
            } else {
                const rel = path.relative(PROJECT_ROOT, ep).replace(/\\/g, "/");
                if (rel.toLowerCase().includes(partialPath.toLowerCase())) {
                    results.push(rel);
                }
            }
        }
    };

    walk(PROJECT_ROOT, 0);
    return results;
}

/* ══════════════════════════════════════════════════
   GET /api/self/tree
══════════════════════════════════════════════════ */
router.get("/self/tree", (req, res) => {
    const maxDepth = parseInt(req.query.depth) || 4;

    try {
        const tree = buildFileTree(PROJECT_ROOT, PROJECT_ROOT, maxDepth, 0);
        res.json({
            success: true,
            tree,
            moduleDescriptions: MODULE_DESCRIPTIONS,
            projectRoot: PROJECT_ROOT,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ══════════════════════════════════════════════════
   POST /api/self/read
   Lee el contenido de un archivo específico
══════════════════════════════════════════════════ */
router.post("/self/read", (req, res) => {
    const { filePath, lines } = req.body; // lines: [start, end] opcional

    if (!filePath) return res.status(400).json({ success: false, error: "filePath requerido" });

    // Seguridad: solo permitir leer dentro del proyecto
    const fullPath = path.resolve(PROJECT_ROOT, filePath);
    if (!fullPath.startsWith(PROJECT_ROOT)) {
        return res.status(403).json({ success: false, error: "Acceso denegado" });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (EXCLUDE_EXTS.has(ext)) {
        return res.status(403).json({ success: false, error: "Tipo de archivo no permitido" });
    }

    try {
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ success: false, error: `Archivo no encontrado: ${filePath}` });
        }

        let content = fs.readFileSync(fullPath, "utf-8");
        const totalLines = content.split("\n").length;

        if (lines && Array.isArray(lines) && lines.length === 2) {
            const [start, end] = lines;
            const lineArr = content.split("\n");
            content = lineArr.slice(start - 1, end).join("\n");
        }

        // Limitar a 8000 chars para no explotar el contexto
        const truncated = content.length > 8000;
        if (truncated) content = content.substring(0, 8000) + "\n\n// ... [TRUNCADO - usa 'lines' para ver más]";

        res.json({
            success: true,
            path: filePath,
            content,
            totalLines,
            truncated,
            description: MODULE_DESCRIPTIONS[filePath] || null,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ══════════════════════════════════════════════════
   GET /api/self/architecture
   Resumen de arquitectura (sin leer código)
══════════════════════════════════════════════════ */
router.get("/self/architecture", (req, res) => {
    const architecture = {
        overview: "JarvisCore es un asistente IA modular con backend Node.js/Express y frontend React.",
        layers: {
            "API Layer": {
                description: "Express.js maneja todas las peticiones HTTP",
                files: ["backend/server.js", "backend/routes/*.js"],
            },
            "Controller Layer": {
                description: "Lógica de negocio HTTP, valida requests y coordina servicios",
                files: ["backend/controllers/chatController.js", "backend/controllers/deviceController.js"],
            },
            "Bot Layer": {
                description: "Agentes especializados para cada tipo de tarea",
                files: ["backend/bots/BotManager.js", "backend/bots/*.js"],
                bots: Object.keys(MODULE_DESCRIPTIONS)
                    .filter(k => k.includes("/bots/") && !k.includes("BotManager") && !k.includes("Bot.js"))
                    .map(k => path.basename(k, ".js")),
            },
            "NLP Layer": {
                description: "Clasificación de intents, similitud de strings, contexto conversacional",
                files: ["backend/services/ModelService.js", "backend/services/NLPService.js"],
            },
            "Data Layer": {
                description: "Persistencia en Supabase (PostgreSQL) para historial de chat",
                files: ["backend/services/SupabaseService.js"],
            },
            "Config Layer": {
                description: "Archivos de configuración y listas blancas",
                files: ["backend/config/.env", "backend/config/bat_whitelist.json", "backend/config/devices.json"],
            },
        },
        dataFlow: [
            "Usuario escribe mensaje → frontend React",
            "POST /api/chat → chatController.handleChat()",
            "InstructionLoader.buildFullContext() → agrega identity/soul/memory",
            "ModelService.generateIntent() → QuickRules regex O LLM local",
            "BotManager.executeIntent() → enruta al bot correcto",
            "Bot.run(parameters) → ejecuta la acción",
            "Resultado → Supabase (persistencia) + respuesta JSON al frontend",
        ],
        moduleDescriptions: MODULE_DESCRIPTIONS,
    };

    res.json({ success: true, architecture });
});

/* ══════════════════════════════════════════════════
   POST /api/self/explain
   Gemma explica un archivo o concepto del código
══════════════════════════════════════════════════ */
router.post("/self/explain", async (req, res) => {
    const { filePath, question, context } = req.body;

    if (!filePath && !question) {
        return res.status(400).json({ success: false, error: "filePath o question requerido" });
    }

    try {
        let codeContext = "";

        if (filePath) {
            const fullPath = path.resolve(PROJECT_ROOT, filePath);
            if (fs.existsSync(fullPath) && fullPath.startsWith(PROJECT_ROOT)) {
                const content = fs.readFileSync(fullPath, "utf-8");
                // Limitar para no gastar tokens
                codeContext = content.substring(0, 4000);
            }
        }

        // Contexto de arquitectura compacto
        const archContext = Object.entries(MODULE_DESCRIPTIONS)
            .map(([k, v]) => `• ${k}: ${v}`)
            .join("\n");

        const prompt = `Eres Jarvis analizando tu propio código.

ARQUITECTURA DEL PROYECTO:
${archContext}

${codeContext ? `CÓDIGO DE ${filePath}:\n\`\`\`javascript\n${codeContext}\n\`\`\`` : ""}

${context ? `CONTEXTO ADICIONAL: ${context}` : ""}

PREGUNTA: ${question || `Explicá qué hace el archivo ${filePath} y cómo se integra con el resto del sistema`}

Responde en español rioplatense, siendo técnico pero claro. Si es sobre tu propio código, habla en primera persona ("yo proceso los intents", "mi función es...").`;

        const response = await axios.post(
            `${LM_BASE}/chat/completions`,
            {
                model: process.env.LM_MODEL || "gemma-3-4b-it",
                messages: [
                    {
                        role: "system",
                        content: "Sos Jarvis, un asistente IA que conoce su propio código fuente. Respondés en español rioplatense."
                    },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 1024,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.LM_API_TOKEN ? { "Authorization": `Bearer ${process.env.LM_API_TOKEN}` } : {}),
                },
                timeout: 60000,
            }
        );

        const explanation = response.data?.choices?.[0]?.message?.content || "";

        res.json({
            success: true,
            explanation,
            filePath,
            question,
        });

    } catch (err) {
        logger.error(`Self explain error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ══════════════════════════════════════════════════
   POST /api/self/search-code
   Busca un término en el código fuente
══════════════════════════════════════════════════ */
router.post("/self/search-code", (req, res) => {
    const { term, fileType } = req.body;
    if (!term) return res.status(400).json({ success: false, error: "term requerido" });

    const results = [];
    const ext = fileType || ".js";

    const walk = (dir, depth) => {
        if (depth > 6 || results.length >= 20) return;
        const base = path.basename(dir).toLowerCase();
        if (EXCLUDE_DIRS.has(base)) return;

        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            if (results.length >= 20) break;
            const ep = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(ep, depth + 1);
            } else if (entry.name.endsWith(ext)) {
                try {
                    const content = fs.readFileSync(ep, "utf-8");
                    const lines = content.split("\n");
                    const matches = [];
                    lines.forEach((line, i) => {
                        if (line.toLowerCase().includes(term.toLowerCase())) {
                            matches.push({ line: i + 1, content: line.trim() });
                        }
                    });
                    if (matches.length > 0) {
                        results.push({
                            path: path.relative(PROJECT_ROOT, ep).replace(/\\/g, "/"),
                            matches: matches.slice(0, 5), // max 5 matches por archivo
                        });
                    }
                } catch { }
            }
        }
    };

    walk(BACKEND_ROOT, 0);

    res.json({ success: true, term, results });
});

module.exports = router;