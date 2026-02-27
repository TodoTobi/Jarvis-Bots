/**
 * doctorRoutes.js — System diagnostic API
 *
 * CHANGES:
 *  - Added checkAdb() — detects ADB installation, shows path and version
 *  - Added checkSupabase() — verifies package installed + credentials set
 *  - Added ADB_NOT_IN_PATH known fix with step-by-step instructions
 *  - Fixed autoFixData for MODEL_NOT_FOUND
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("../logs/logger");

const ROOT = path.resolve(__dirname, "../../");
const BACKEND = path.resolve(__dirname, "..");

/* ════════════════════════════════════════════════════════
   KNOWN ERRORS & AUTO-FIXES
   ════════════════════════════════════════════════════════ */
const KNOWN_FIXES = {
    "MODULE_NOT_FOUND:multer": {
        label: "Módulo 'multer' no instalado",
        fix: "npm_install",
        pkg: "multer",
        description: "El endpoint de subida de archivos requiere multer."
    },
    "MODULE_NOT_FOUND:@supabase/supabase-js": {
        label: "Módulo '@supabase/supabase-js' no instalado",
        fix: "npm_install",
        pkg: "@supabase/supabase-js",
        description: "Necesario para el historial de chat persistente."
    },
    "MODULE_NOT_FOUND:axios": {
        label: "Módulo 'axios' no instalado",
        fix: "npm_install",
        pkg: "axios",
        description: "axios se usa para comunicarse con LM Studio."
    },
    "ECONNREFUSED:lmstudio": {
        label: "LM Studio no responde",
        fix: "guidance",
        steps: [
            "Abrí LM Studio",
            "Cargá un modelo (ej: LLaMA 13B)",
            "Ir a Developer tab → activar el servidor",
            "Verificá que la IP y puerto en .env coincidan"
        ],
        file: "backend/config/.env → LM_API_URL"
    },
    "MODEL_NOT_FOUND": {
        label: "Modelo no encontrado en LM Studio",
        fix: "guidance",
        steps: [
            "Abrí LM Studio → Loaded Models",
            "Copiá el nombre EXACTO del modelo",
            "Pegalo en Configuración → Nombre del modelo",
            "O dejá el campo vacío para usar el modelo activo automáticamente"
        ],
        file: "backend/config/.env → LM_MODEL"
    },
    "ADB_NOT_IN_PATH": {
        label: "ADB no encontrado",
        fix: "guidance",
        steps: [
            "Descargá Android Platform Tools desde https://developer.android.com/studio/releases/platform-tools",
            "Descomprimí el zip en C:\\platform-tools\\",
            "Abrí backend/config/.env y agregá: ADB_PATH=C:\\platform-tools\\adb.exe",
            "Reiniciá el servidor JarvisCore",
            "En tu dispositivo Android: activá Depuración USB / Depuración inalámbrica",
            "Ejecutá 'adb connect [IP]:[PORT]' y aceptá el diálogo en el dispositivo"
        ],
        file: "backend/config/.env → ADB_PATH"
    },
    "ENV_MISSING": {
        label: "Variables de entorno faltantes",
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
                autoFixData: { lm_model: "" }
            };
        }

        return {
            id: "lmstudio_ok", category: "Modelo IA",
            status: "ok",
            title: `LM Studio conectado — ${modelNames[0]}`,
            detail: `${models.length} modelo(s): ${modelNames.join(", ")}`,
            file: url
        };

    } catch (err) {
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

async function checkAdb() {
    // Resolve path the same way NetBot does
    const envPath = process.env.ADB_PATH;
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const localApp = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

    const candidates = [
        envPath,
        path.join(localApp, "Android", "Sdk", "platform-tools", "adb.exe"),
        "C:\\platform-tools\\adb.exe",
        "C:\\Android\\platform-tools\\adb.exe",
        "C:\\adb\\adb.exe",
    ].filter(Boolean);

    let resolvedPath = "adb";
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) { resolvedPath = `"${candidate}"`; break; }
    }

    return new Promise((resolve) => {
        exec(`${resolvedPath} version`, { timeout: 5000 }, (err, stdout) => {
            if (err) {
                resolve({
                    id: "adb_not_found", category: "Android (ADB)",
                    status: "error",
                    title: "ADB no encontrado",
                    detail:
                        "adb.exe no está en el PATH ni en ubicaciones comunes.\n" +
                        "Descargá: https://developer.android.com/studio/releases/platform-tools\n" +
                        "Luego agregá ADB_PATH en backend/config/.env",
                    file: "backend/config/.env → ADB_PATH",
                    fix: "ADB_NOT_IN_PATH",
                    fixable: false
                });
            } else {
                const version = (stdout || "").split("\n")[0].replace("Android Debug Bridge version ", "").trim();
                resolve({
                    id: "adb_ok", category: "Android (ADB)",
                    status: "ok",
                    title: `ADB disponible — v${version}`,
                    detail: `Ruta: ${resolvedPath === "adb" ? "PATH del sistema" : resolvedPath.replace(/"/g, "")}`,
                    file: resolvedPath.replace(/"/g, "")
                });
            }
        });
    });
}

async function checkSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    // 1. Package installed?
    let pkgInstalled = false;
    try { require.resolve("@supabase/supabase-js"); pkgInstalled = true; } catch { }

    if (!pkgInstalled) {
        return {
            id: "supabase_pkg", category: "Supabase (Historial)",
            status: "warn",
            title: "@supabase/supabase-js no instalado",
            detail: "Ejecutá: npm install @supabase/supabase-js   y reiniciá el servidor",
            file: "backend/package.json",
            fix: "MODULE_NOT_FOUND:@supabase/supabase-js",
            fixable: true,
            pkg: "@supabase/supabase-js"
        };
    }

    // 2. Credentials configured?
    if (!url || !key) {
        return {
            id: "supabase_env", category: "Supabase (Historial)",
            status: "warn",
            title: "Credenciales Supabase no configuradas",
            detail: "SUPABASE_URL y/o SUPABASE_ANON_KEY no están en .env (historial desactivado)",
            file: "backend/config/.env",
            fix: "ENV_MISSING",
            fixable: true
        };
    }

    // 3. Connection state
    try {
        const supabase = require("../services/SupabaseService");
        await supabase.ready(); // wait for async init
        const state = supabase.getState();

        if (state === "ok") {
            return {
                id: "supabase_ok", category: "Supabase (Historial)",
                status: "ok",
                title: "Supabase conectado",
                detail: `URL: ${url}`,
                file: url
            };
        } else {
            return {
                id: "supabase_fail", category: "Supabase (Historial)",
                status: "error",
                title: "Supabase no se pudo conectar",
                detail: "Verificá que SUPABASE_URL y SUPABASE_ANON_KEY sean correctos y que el schema SQL haya sido aplicado",
                file: "backend/config/.env",
                fixable: false
            };
        }
    } catch (err) {
        return {
            id: "supabase_err", category: "Supabase (Historial)",
            status: "error",
            title: "Error al verificar Supabase",
            detail: err.message,
            fixable: false
        };
    }
}

async function checkNpmPackages() {
    const required = ["express", "cors", "axios", "dotenv", "@supabase/supabase-js", "multer"];
    const results = [];

    for (const pkg of required) {
        const optional = ["@supabase/supabase-js", "multer"].includes(pkg);
        let installed = false;
        try { require.resolve(pkg, { paths: [BACKEND] }); installed = true; } catch { }

        if (!installed) {
            results.push({
                id: `npm_${pkg.replace("/", "_")}`, category: "Dependencias npm",
                status: optional ? "warn" : "error",
                title: `'${pkg}' no instalado`,
                detail: optional
                    ? `Opcional: instalar para habilitar esta funcionalidad`
                    : `Requerido: el sistema no funciona sin este paquete`,
                file: "backend/package.json",
                fix: `MODULE_NOT_FOUND:${pkg}`,
                fixable: true,
                pkg
            });
        } else {
            results.push({
                id: `npm_${pkg.replace("/", "_")}_ok`, category: "Dependencias npm",
                status: "ok",
                title: pkg,
                detail: "Instalado y disponible",
                file: `node_modules/${pkg}`
            });
        }
    }
    return results;
}

async function checkEnvVars() {
    const checks = [
        { key: "LM_API_URL", required: true, desc: "URL del servidor LM Studio" },
        { key: "LM_MODEL", required: false, desc: "Nombre del modelo (recomendado)" },
        { key: "PORT", required: false, desc: "Puerto del backend (default 3001)" },
        { key: "WHATSAPP_ALLOWED_NUMBERS", required: false, desc: "Números de WhatsApp autorizados" },
        { key: "VISION_API_KEY", required: false, desc: "API key para visión (Claude/OpenAI)" },
        { key: "ADB_PATH", required: false, desc: "Ruta a adb.exe (ej: C:\\platform-tools\\adb.exe)" },
        { key: "SUPABASE_URL", required: false, desc: "URL del proyecto Supabase" },
        { key: "SUPABASE_ANON_KEY", required: false, desc: "Anon key de Supabase" },
    ];

    return checks.map(c => {
        const val = process.env[c.key];
        const ok = !!val && val.trim() !== "";
        const display = ["VISION_API_KEY", "SUPABASE_ANON_KEY"].includes(c.key)
            ? "***configurado***"
            : (val || "").substring(0, 50);
        return {
            id: `env_${c.key}`, category: "Variables .env",
            status: ok ? "ok" : (c.required ? "error" : "warn"),
            title: c.key,
            detail: ok ? `Configurado: ${display}` : `${c.desc} — no configurado`,
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
            fixable: false
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
        const recent = lines.slice(-30).reverse();
        const seen = new Set();
        const results = [];

        for (const line of recent.slice(0, 10)) {
            const timeMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:\.Z]+)\]/);
            const errorMatch = line.match(/\[ERROR\]\s+(.+)/);
            if (!errorMatch) continue;

            const msg = errorMatch[1];
            const time = timeMatch?.[1] || "";

            // De-duplicate by first 60 chars of message
            const key = msg.substring(0, 60);
            if (seen.has(key)) continue;
            seen.add(key);

            let fixKey = null;
            if (msg.includes("MODULE_NOT_FOUND")) fixKey = "MODULE_NOT_FOUND:multer";
            if (msg.includes("ECONNREFUSED")) fixKey = "ECONNREFUSED:lmstudio";
            if (msg.includes("status code 400")) fixKey = "MODEL_NOT_FOUND";
            if (msg.includes("no se reconoce") || msg.includes("not recognized")) fixKey = "ADB_NOT_IN_PATH";

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

// GET /api/doctor/scan
router.get("/doctor/scan", async (req, res, next) => {
    try {
        const [lm, adb, supabase, npm, env, files, bots, logs] = await Promise.all([
            checkLMStudio().then(r => [r]),
            checkAdb().then(r => [r]),
            checkSupabase().then(r => [r]),
            checkNpmPackages(),
            checkEnvVars(),
            checkFiles(),
            checkBots(),
            checkLogErrors()
        ]);

        const all = [...lm, ...adb, ...supabase, ...npm, ...env, ...files, ...bots, ...logs];
        const errors = all.filter(c => c.status === "error").length;
        const warns = all.filter(c => c.status === "warn").length;
        const ok = all.filter(c => c.status === "ok").length;

        // Persist errors to memory (deduplicated)
        try {
            const instrLoader = require("../utils/InstructionLoader");
            const errorSummary = all
                .filter(c => c.status === "error")
                .map(c => `- ${c.title}: ${c.detail.split("\n")[0]}`)
                .join("\n");
            if (errorSummary) {
                instrLoader.appendToMemory(`## DoctorBot Scan [${new Date().toISOString()}]\n${errorSummary}`);
            }
        } catch { }

        res.json({ checks: all, summary: { errors, warns, ok, total: all.length } });
    } catch (err) { next(err); }
});

// POST /api/doctor/fix
router.post("/doctor/fix", async (req, res, next) => {
    try {
        const { fixId, fixData } = req.body;
        const fix = KNOWN_FIXES[fixId];

        if (!fix) {
            return res.json({ success: false, message: `Fix '${fixId}' no encontrado.` });
        }

        // Clear bad LM model name in .env
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

        if (fix.fix === "npm_install") {
            return res.json({
                success: false,
                manual: true,
                message: `Para instalar '${fix.pkg}' ejecutá en la terminal:\n\n  cd backend\n  npm install ${fix.pkg}\n\nLuego reiniciá el servidor.`,
                cmd: `npm install ${fix.pkg}`
            });
        }

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

// POST /api/doctor/fix-all
router.post("/doctor/fix-all", async (req, res, next) => {
    try {
        const { checks } = req.body;
        const applied = [];
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
                applied.push(`Auto-fixed: ${check.title}`);
            }
        }

        const msg = [
            applied.length > 0 ? `✅ Aplicados: ${applied.join(", ")}` : "",
            manual.length > 0
                ? `⚠ Requieren acción manual:\n${manual.map(m => `  > ${m}`).join("\n")}`
                : ""
        ].filter(Boolean).join("\n\n");

        res.json({
            success: true,
            message: msg || "No hay fixes automáticos aplicables.",
            manual,
            applied
        });
    } catch (err) { next(err); }
});

module.exports = router;