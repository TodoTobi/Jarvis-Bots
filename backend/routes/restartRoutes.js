/**
 * restartRoutes.js — System restart endpoints
 *
 * Endpoints:
 *  POST /api/system/restart-backend   — Kills and restarts the Node.js process
 *  POST /api/system/restart-frontend  — Kills and restarts React dev server
 *  GET  /api/system/info              — Process info (pid, uptime, memory)
 *
 * Backend restart: sends SIGTERM to self, expects PM2/nodemon to restart it
 * Frontend restart: kills process on port 3000
 */

const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const logger = require("../logs/logger");

/* ── GET /api/system/info ────────────────────────────── */
router.get("/system/info", (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        memory: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
        nodeVersion: process.version,
        platform: process.platform,
    });
});

/* ── POST /api/system/restart-backend ───────────────── */
router.post("/system/restart-backend", (req, res) => {
    logger.info("System: backend restart requested");
    res.json({
        success: true,
        message: "Reiniciando backend en 1 segundo...",
        pid: process.pid,
    });

    // Give time for response to be sent, then exit
    // nodemon or PM2 will restart the process
    setTimeout(() => {
        logger.info("System: exiting for restart");
        process.exit(0);
    }, 1000);
});

/* ── POST /api/system/restart-frontend ──────────────── */
router.post("/system/restart-frontend", async (req, res) => {
    logger.info("System: frontend restart requested");

    const killCmd = process.platform === "win32"
        ? `FOR /F "tokens=5" %P IN ('netstat -a -n -o ^| findstr :3000') DO taskkill /F /PID %P`
        : `lsof -ti:3000 | xargs kill -9 2>/dev/null || true`;

    exec(killCmd, (err) => {
        if (err) {
            logger.warn(`Frontend kill: ${err.message}`);
        }
    });

    res.json({
        success: true,
        message: "Proceso en puerto 3000 terminado. El servidor de desarrollo debería reiniciarse automáticamente si está corriendo con npm start.",
    });
});

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

module.exports = router;