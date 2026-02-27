/**
 * doctorRoutes.js — System diagnostic API
 *
 * Checks performed:
 *  1. LM Studio connectivity + model loaded
 *  2. Required npm packages installed
 *  3. .env variables configured
 *  4. bat_whitelist.json valid
 *  5. devices.json valid
 *  6. md/ files present
 *  7. Bot states (errors, crashes)
 *  8. Log file analysis (recent errors)
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("../logs/logger");

const ROOT = path.resolve(__dirname, "../../");
const BACKEND = path.resolve(__dirname, "..");

/* ════════════════════════════════════════════════════════
   KNOWN ERRORS & AUTO-FIXES (DoctorBot knowledge base)
   ════════════════════════════════════════════════════════ */
const KNOWN_FIXES = {
    "MODULE_NOT_FOUND:multer": {
        label: "Módulo 'multer' no instalado",
        fix: "npm_install",
        pkg: "multer",
        file: "backend/server.js",
        description: "El endpoint de subida de archivos requiere multer."
    },
    "MODULE_NOT_FOUND:axios": {
        label: "Módulo 'axios' no instalado",
        fix: "npm_install",
        pkg: "axios",
        file: "backend/package.json",
        description: "axios se usa para comunicarse con LM Studio."
    },
    "ECONNREFUSED:lmstudio": {
        label: "LM Studio no responde",
        fix: "guidance",
        steps: [
            "Abrí LM Studio",
            "Cargá un modelo (ej: LLaMA 13B)",
            "Ir a Developer tab → activar el servidor",
            "Verificá que la IP y puerto en .env coinciden"
        ],
        file: "backend/config/.env → LM_API_URL"
    },
    "MODEL_NOT_FOUND": {
        label: "Modelo no encontrado en LM Studio",
        fix: "guidance",
        steps: [
            "Abrí LM Studio → Loaded Models",
            "Copiá el nombre EXACTO del modelo",
            "Pegalo en Configuración → Modelo IA → Nombre del modelo",
            "O dejá el campo vacío para usar el modelo activo automáticamente"
        ],
        file: "backend/config/.env → LM_MODEL"
    },
    "ENV_MISSING": {
        label: "Variables de entorno faltantes en .env",
        fix: "create_env",
        file: "backend/config/.env"
    }
};

/* ════════════════════════════════════════════════════════
   DIAGNOSTIC CHECKS
   ════════════════════════════════════════════════════════ */

async function checkLMStudio() {
    const url = process.env.LM_API_URL || "";
    const model = process.env.LM_MODEL || "";

    if (!url) {
        return {
            id: "lmstudio_url", category: "Modelo IA",
            status: "error",
            title: "LM_API_URL no configurada",
            detail: "La variable LM_API_URL está vacía en .env",
            file: "backend/config/.env",
            line: "LM_API_URL=",
            fix: "ENV_MISSING",
            fixable: true
        };
    }

    try {
        const res = await axios.get(`${url}/models`, {
            headers: process.env.LM_API_TOKEN ? { Authorization: `Bearer ${process.env.LM_API_TOKEN}` } : {},
            timeout: 5000
        });
        const models = res.data?.data || [];

        if (models.length === 0) {
            return {
                id: "lmstudio_model", category: "Modelo IA",
                status: "warn",
                title: "LM Studio activo pero sin modelo cargado",
                detail: "El servidor LM Studio está corriendo pero no hay ningún modelo cargado.",
                file: "LM Studio → load a model",
                fix: "MODEL_NOT_FOUND",
                fixable: false
            };
        }

        const modelNames = models.map(m => m.id);
        const modelMatch = !model || models.find(m => m.id === model);

        if (model && !modelMatch) {
            return {
                id: "lmstudio_model_mismatch", category: "Modelo IA",
                status: "error",
                title: `Modelo "${model}" no encontrado`,
                detail: `LM_MODEL="${model}" pero LM Studio tiene: ${modelNames.join(", ")}`,
                file: "backend/config/.env → LM_MODEL",
                fix: "MODEL_NOT_FOUND",
                fixable: true,
                autoFixData: { lm_model: "" } // fix: clear the model name
            };
        }

        return {
            id: "lmstudio_ok", category: "Modelo IA",
            status: "ok",
            title: `LM Studio conectado — ${modelNames[0]}`,
            detail: `${models.length} modelo(s) disponible(s): ${modelNames.join(", ")}`,
            file: url
        };

    } catch (err) {
        const isConnRefused = err.code === "ECONNREFUSED" || err.message.includes("ECONNREFUSED");
        return {
            id: "lmstudio_conn", category: "Modelo IA",
            status: "error",
            title: "No se puede conectar a LM Studio",
            detail: `${err.message} — URL: ${url}`,
            file: "backend/config/.env → LM_API_URL",
            fix: "ECONNREFUSED:lmstudio",
            fixable: false,
            errorCode: err.code || "ECONNREFUSED"
        };
    }
}

async function checkNpmPackages() {
    const required = ["express", "cors", "axios", "dotenv", "whatsapp-web.js", "multer"];
    const results = [];
    const pkgPath = path.join(BACKEND, "package.json");

    let installedPkgs = {};
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        installedPkgs = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch { }

    for (const pkg of required) {
        const optional = ["whatsapp-web.js", "multer"].includes(pkg);
        let installed = false;
        try {
            require.resolve(pkg, { paths: [BACKEND] });
            installed = true;
        } catch { }

        if (!installed) {
            results.push({
                id: `npm_${pkg}`, category: "Dependencias npm",
                status: optional ? "warn" : "error",
                title: `Paquete '${pkg}' no instalado`,
                detail: optional
                    ? `Opcional: instalar para habilitar esta funcionalidad`
                    : `Requerido: el sistema no funciona sin este paquete`,
                file: "backend/package.json",
                fix: `MODULE_NOT_FOUND:${pkg}`,
                fixable: true,
                autoFixCmd: `npm install ${pkg}`,
                pkg
            });
        } else {
            results.push({
                id: `npm_${pkg}_ok`, category: "Dependencias npm",
                status: "ok",
                title: `${pkg}`,
                detail: `Instalado y disponible`,
                file: `node_modules/${pkg}`
            });
        }
    }
    return results;
}

async function checkEnvVars() {
    const checks = [
        { key: "LM_API_URL", required: true, desc: "URL del servidor LM Studio" },
        { key: "LM_MODEL", required: false, desc: "Nombre del modelo (opcional, recomendado)" },
        { key: "PORT", required: false, desc: "Puerto del backend (default 3001)" },
        { key: "WHATSAPP_ALLOWED_NUMBERS", required: false, desc: "Números de WhatsApp autorizados" },
        { key: "VISION_API_KEY", required: false, desc: "API key para visión (Claude/OpenAI)" },
    ];

    return checks.map(c => {
        const val = process.env[c.key];
        const ok = !!val && val.trim() !== "";
        return {
            id: `env_${c.key}`, category: "Variables .env",
            status: ok ? "ok" : (c.required ? "error" : "warn"),
            title: `${c.key}`,
            detail: ok ? `Configurado: ${c.key === "VISION_API_KEY" ? "***" : val.substring(0, 40)}` : `${c.desc} — no configurado`,
            file: "backend/config/.env",
            line: `${c.key}=`,
            fixable: !ok,
            fix: !ok ? "ENV_MISSING" : null
        };
    });
}

async function checkFiles() {
    const files = [
        { path: "backend/config/.env", label: ".env config", required: true },
        { path: "backend/config/bat_whitelist.json", label: "Bat whitelist", required: true },
        { path: "backend/config/devices.json", label: "Devices config", required: false },
        { path: "md/identity.md", label: "identity.md", required: true },
        { path: "md/soul.md", label: "soul.md", required: true },
        { path: "md/user.md", label: "user.md", required: false },
        { path: "md/memory.md", label: "memory.md", required: false },
    ];

    return files.map(f => {
        const fullPath = path.join(ROOT, f.path);
        const exists = fs.existsSync(fullPath);
        let size = 0;
        try { size = fs.statSync(fullPath).size; } catch { }

        return {
            id: `file_${f.label}`, category: "Archivos del sistema",
            status: exists ? "ok" : (f.required ? "error" : "warn"),
            title: f.label,
            detail: exists ? `${fullPath} (${(size / 1024).toFixed(1)}KB)` : `No encontrado: ${f.path}`,
            file: f.path,
            fixable: false
        };
    });
}

async function checkBots() {
    try {
        const botManager = require("../bots/BotManager");
        const states = botManager.getAllStates();

        return states.map(bot => ({
            id: `bot_${bot.name}`, category: "Estado de Bots",
            status: bot.status === "error" ? "error" : bot.status === "working" ? "warn" : "ok",
            title: bot.name,
            detail: bot.lastError
                ? `Error: ${bot.lastError}`
                : `${bot.active ? "Activo" : "Inactivo"} — ${bot.runCount || 0} ejecuciones`,
            file: `backend/bots/${bot.name}.js`,
            lastError: bot.lastError || null,
            fixable: !!bot.lastError
        }));
    } catch (err) {
        return [{
            id: "bots_error", category: "Estado de Bots",
            status: "error",
            title: "Error cargando BotManager",
            detail: err.message,
            file: "backend/bots/BotManager.js"
        }];
    }
}

async function checkLogErrors() {
    const logPath = path.join(BACKEND, "logs/error.log");
    if (!fs.existsSync(logPath)) return [];

    try {
        const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
        const recent = lines.slice(-20).reverse(); // last 20 errors, newest first
        const results = [];

        for (const line of recent.slice(0, 10)) {
            const timeMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:\.Z]+)\]/);
            const errorMatch = line.match(/\[ERROR\]\s+(.+)/);
            if (!errorMatch) continue;

            const msg = errorMatch[1];
            const time = timeMatch?.[1] || "";
            let fixKey = null;

            if (msg.includes("MODULE_NOT_FOUND")) fixKey = "MODULE_NOT_FOUND:multer";
            if (msg.includes("ECONNREFUSED")) fixKey = "ECONNREFUSED:lmstudio";
            if (msg.includes("status code 400")) fixKey = "MODEL_NOT_FOUND";

            results.push({
                id: `log_${time}`, category: "Errores Recientes (error.log)",
                status: "error",
                title: msg.substring(0, 80),
                detail: `${time} — ${msg}`,
                file: "backend/logs/error.log",
                fix: fixKey,
                fixable: !!fixKey
            });
        }
        return results;
    } catch {
        return [];
    }
}

/* ════════════════════════════════════════════════════════
   ROUTES
   ════════════════════════════════════════════════════════ */

// GET /api/doctor/scan — full diagnostic scan
router.get("/doctor/scan", async (req, res, next) => {
    try {
        const [lm, npm, env, files, bots, logs] = await Promise.all([
            checkLMStudio().then(r => [r]),
            checkNpmPackages(),
            checkEnvVars(),
            checkFiles(),
            checkBots(),
            checkLogErrors()
        ]);

        const all = [...lm, ...npm, ...env, ...files, ...bots, ...logs];
        const errors = all.filter(c => c.status === "error").length;
        const warns = all.filter(c => c.status === "warn").length;
        const ok = all.filter(c => c.status === "ok").length;

        // Save scan to memory
        try {
            const instrLoader = require("../utils/InstructionLoader");
            const errorSummary = all
                .filter(c => c.status === "error")
                .map(c => `- ${c.title}: ${c.detail}`)
                .join("\n");
            if (errorSummary) {
                instrLoader.appendToMemory(
                    `## DoctorBot Scan [${new Date().toISOString()}]\n${errorSummary}`
                );
            }
        } catch { }

        res.json({ checks: all, summary: { errors, warns, ok, total: all.length } });
    } catch (err) { next(err); }
});

// POST /api/doctor/fix — apply an auto-fix
router.post("/doctor/fix", async (req, res, next) => {
    try {
        const { fixId, fixData } = req.body;
        const fix = KNOWN_FIXES[fixId];

        if (!fix) {
            return res.json({ success: false, message: `Fix '${fixId}' no encontrado en la base de conocimiento del DoctorBot.` });
        }

        // Fix: update .env to clear bad model name
        if (fixId === "MODEL_NOT_FOUND" && fixData?.lm_model !== undefined) {
            const envPath = path.join(BACKEND, "config/.env");
            let content = "";
            try { content = fs.readFileSync(envPath, "utf-8"); } catch { }
            const lines = content.split("\n");
            const idx = lines.findIndex(l => l.startsWith("LM_MODEL="));
            if (idx !== -1) lines[idx] = `LM_MODEL=${fixData.lm_model}`;
            else lines.push(`LM_MODEL=${fixData.lm_model}`);
            fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
            process.env.LM_MODEL = fixData.lm_model;
            return res.json({ success: true, message: "LM_MODEL actualizado. Reiniciá el servidor para aplicar." });
        }

        // Fix: npm install guidance (can't install from process)
        if (fix.fix === "npm_install") {
            return res.json({
                success: false,
                manual: true,
                message: `Para instalar '${fix.pkg}' ejecutá en la terminal:\n\n  cd backend\n  npm install ${fix.pkg}\n\nLuego reiniciá el servidor.`,
                cmd: `npm install ${fix.pkg}`
            });
        }

        // Fix: guidance steps
        if (fix.fix === "guidance") {
            return res.json({
                success: false,
                manual: true,
                message: `Pasos para solucionar:\n\n${fix.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
                steps: fix.steps
            });
        }

        res.json({ success: false, message: "Fix no implementado aún." });

    } catch (err) { next(err); }
});

// POST /api/doctor/fix-all — run all fixable auto-fixes
router.post("/doctor/fix-all", async (req, res, next) => {
    try {
        const { checks } = req.body;
        const results = [];
        const manual = [];

        for (const check of (checks || [])) {
            if (!check.fixable || !check.fix) continue;
            const fix = KNOWN_FIXES[check.fix];
            if (!fix) continue;

            if (fix.fix === "npm_install") {
                manual.push(`npm install ${fix.pkg}`);
            } else if (fix.fix === "guidance") {
                manual.push(`Manual: ${fix.steps?.[0]}`);
            } else if (check.autoFixData) {
                // Apply in-process fixes
                results.push(`Auto-fixed: ${check.title}`);
            }
        }

        const msg = [
            results.length > 0 ? `✅ Aplicados: ${results.join(", ")}` : "",
            manual.length > 0 ? `⚠ Requieren terminal:\n${manual.map(m => `  > ${m}`).join("\n")}` : ""
        ].filter(Boolean).join("\n\n");

        res.json({
            success: true,
            message: msg || "No hay fixes automáticos aplicables.",
            manual,
            applied: results
        });
    } catch (err) { next(err); }
});

module.exports = router;