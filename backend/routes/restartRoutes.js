/**
 * restartRoutes.js — Endpoints para reiniciar backend y frontend
 *
 * Estrategia:
 *   - El backend NO puede reiniciarse a sí mismo directamente.
 *   - Se usan scripts .bat que usa `start cmd /c` para lanzar el proceso
 *     en una nueva ventana y matar el actual (en Windows).
 *   - Si el proyecto usa PM2, los endpoints llaman `pm2 restart`.
 *   - El frontend (React/Vite) se reinicia desde el backend igual.
 *
 * Instalar en server.js:
 *   const restartRoutes = require("./routes/restartRoutes");
 *   app.use("/api", restartRoutes);
 *
 * Endpoints:
 *   POST /api/system/restart-backend
 *   POST /api/system/restart-frontend
 *   GET  /api/system/restart-status
 */

const express = require("express");
const router = express.Router();
const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let logger;
try {
    logger = require("../logs/logger");
} catch {
    logger = {
        info: (...a) => console.log("[restartRoutes]", ...a),
        warn: (...a) => console.warn("[restartRoutes]", ...a),
        error: (...a) => console.error("[restartRoutes]", ...a),
    };
}

// Estado de restart
const restartState = {
    backend: { lastRestart: null, status: "idle" },
    frontend: { lastRestart: null, status: "idle" },
};

/* ══════════════════════════════════════════
   DETECCIÓN DE ENTORNO
══════════════════════════════════════════ */

/** Verificar si PM2 está disponible y gestionando este proceso */
function detectPM2() {
    return new Promise((resolve) => {
        exec("pm2 list --no-color 2>&1", (err, stdout) => {
            if (err || !stdout) return resolve({ available: false });
            // Buscar el nombre de este proceso en pm2
            const pm2Name = process.env.PM2_PROCESS_NAME || "jarvis-backend";
            const hasBE = stdout.includes(pm2Name) || stdout.includes("jarvis");
            resolve({ available: true, processName: pm2Name, hasBE });
        });
    });
}

/** Ruta raíz del proyecto */
function getProjectRoot() {
    return process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
}

/* ══════════════════════════════════════════
   RESTART BACKEND
══════════════════════════════════════════ */

router.post("/system/restart-backend", async (req, res) => {
    logger.info("restartRoutes: solicitud de reinicio de backend");
    restartState.backend.status = "restarting";
    restartState.backend.lastRestart = new Date().toISOString();

    // Responder ANTES de reiniciar (la conexión se corta igual)
    res.json({ ok: true, message: "Reiniciando backend... reconectá en 3-5 segundos." });

    // Pequeño delay para que la respuesta llegue al cliente
    await new Promise(r => setTimeout(r, 400));

    try {
        // ── Estrategia 1: PM2 (preferida) ──
        const pm2 = await detectPM2();
        if (pm2.available && pm2.hasBE) {
            logger.info(`restartRoutes: reiniciando via PM2 (${pm2.processName})`);
            exec(`pm2 restart ${pm2.processName}`, (err) => {
                if (err) logger.error("restartRoutes: PM2 restart error:", err.message);
            });
            return;
        }

        // ── Estrategia 2: Script .bat (Windows) ──
        const projectRoot = getProjectRoot();
        const batPath = path.join(projectRoot, "pc", "system", "restart_backend.bat");

        if (fs.existsSync(batPath)) {
            logger.info(`restartRoutes: reiniciando via BAT: ${batPath}`);
            spawn("cmd.exe", ["/c", "start", "", batPath], {
                detached: true,
                stdio: "ignore",
                cwd: projectRoot,
            }).unref();

            // Dar tiempo al bat para iniciar antes de morir
            setTimeout(() => process.exit(0), 500);
            return;
        }

        // ── Estrategia 3: node + npm start directo (fallback) ──
        const startScript = process.env.npm_lifecycle_script || "node server.js";
        const cwd = getProjectRoot();

        logger.info(`restartRoutes: reiniciando con: ${startScript} en ${cwd}`);

        // En Windows: abrir nueva cmd que corre el servidor, luego matar el actual
        const isWin = process.platform === "win32";
        if (isWin) {
            const cmd = `start "" cmd /k "cd /d ${cwd} && npm run start"`;
            exec(cmd, { shell: true }, () => {});
            setTimeout(() => process.exit(0), 600);
        } else {
            // Linux/Mac: usar nohup
            spawn("bash", ["-c", `cd ${cwd} && nohup npm start &`], {
                detached: true, stdio: "ignore",
            }).unref();
            setTimeout(() => process.exit(0), 600);
        }

    } catch (e) {
        logger.error("restartRoutes: error reiniciando backend:", e.message);
        restartState.backend.status = "error";
    }
});

/* ══════════════════════════════════════════
   RESTART FRONTEND (React/Vite dev server)
══════════════════════════════════════════ */

router.post("/system/restart-frontend", async (req, res) => {
    logger.info("restartRoutes: solicitud de reinicio de frontend");
    restartState.frontend.status = "restarting";
    restartState.frontend.lastRestart = new Date().toISOString();

    const projectRoot = getProjectRoot();

    // Encontrar la carpeta del frontend
    const frontendDirs = [
        path.join(projectRoot, "client"),
        path.join(projectRoot, "frontend"),
        path.join(projectRoot, "web"),
        projectRoot, // si el frontend está en la raíz
    ].filter(d => {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf-8"));
            return pkg.scripts?.dev || pkg.scripts?.start;
        } catch { return false; }
    });

    const frontendDir = frontendDirs[0] || projectRoot;

    // Leer package.json para saber si es Vite, CRA, etc.
    let startCmd = "npm run dev";
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(frontendDir, "package.json"), "utf-8"));
        if (pkg.scripts?.dev) startCmd = "npm run dev";
        else if (pkg.scripts?.start) startCmd = "npm start";
    } catch { }

    const isWin = process.platform === "win32";
    const port = process.env.FRONTEND_PORT || 5173;

    try {
        if (isWin) {
            // 1. Matar proceso en el puerto del frontend
            exec(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}"') do taskkill /f /pid %a`, { shell: true });

            // 2. Lanzar nuevo frontend en una ventana separada
            setTimeout(() => {
                const cmd = `start "" cmd /k "cd /d ${frontendDir} && ${startCmd}"`;
                exec(cmd, { shell: "cmd.exe" }, (err) => {
                    if (err) logger.error("restartRoutes: error iniciando frontend:", err.message);
                    else {
                        restartState.frontend.status = "ok";
                        logger.info("restartRoutes: frontend reiniciado");
                    }
                });
            }, 1000);
        } else {
            // Linux/Mac
            exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null; cd ${frontendDir} && nohup ${startCmd} &`);
            restartState.frontend.status = "ok";
        }

        res.json({
            ok: true,
            message: `Frontend reiniciando en puerto ${port}... actualizá la página en unos segundos.`,
            dir: frontendDir,
            command: startCmd,
        });

    } catch (e) {
        logger.error("restartRoutes: error reiniciando frontend:", e.message);
        restartState.frontend.status = "error";
        res.json({ ok: false, error: e.message });
    }
});

/* ══════════════════════════════════════════
   STATUS
══════════════════════════════════════════ */

router.get("/system/restart-status", (req, res) => {
    res.json({
        backend: restartState.backend,
        frontend: restartState.frontend,
        uptime: process.uptime(),
        pid: process.pid,
    });
});

module.exports = router;