/**
 * healthRoutes.js — Endpoints de diagnóstico rápido para el Dashboard
 *
 * GET /api/health         → { ok: true, uptime, version }
 * GET /api/health/model   → { ok: bool, connected: bool, model: string, error? }
 * GET /api/whatsapp/status → { connected: bool, canSend: bool, ready: bool, phone? }
 *
 * Montar en server.js:
 *   const healthRoutes = require("./routes/healthRoutes");
 *   app.use("/api", healthRoutes);
 */

const express = require("express");
const router = express.Router();

let logger;
try { logger = require("../logs/logger"); }
catch { logger = { info: () => { }, warn: () => { }, error: () => { } }; }

/* ── GET /api/health ──────────────────────────────────── */
router.get("/health", (req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
        timestamp: new Date().toISOString(),
    });
});

/* ── GET /api/health/model ────────────────────────────── */
router.get("/health/model", async (req, res) => {
    const LM_URL = process.env.LM_API_URL || "http://localhost:1234/v1";

    try {
        // fetch compatible con CommonJS
        const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(`${LM_URL}/models`, {
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
        });
        clearTimeout(timeout);

        if (!response.ok) {
            return res.json({ ok: false, connected: false, error: `HTTP ${response.status}` });
        }

        const data = await response.json();
        const models = data.data || [];
        const activeModel = models[0]?.id || null;

        res.json({
            ok: true,
            connected: true,
            model: activeModel || "Modelo activo",
            modelCount: models.length,
        });

    } catch (err) {
        const isTimeout = err.name === "AbortError";
        res.json({
            ok: false,
            connected: false,
            error: isTimeout ? "Timeout — LM Studio no responde" : err.message,
        });
    }
});

/* ── GET /api/whatsapp/status ─────────────────────────── */
router.get("/whatsapp/status", (req, res) => {
    try {
        // Intentar obtener el estado del WhatsAppBot desde BotManager
        const botManager = require("../bots/BotManager");
        const waBot = botManager.getBot("WhatsAppBot");

        if (!waBot) {
            return res.json({ connected: false, canSend: false, ready: false, phone: null });
        }

        const status = waBot.getStatus?.() || {};

        res.json({
            connected: status.connected || waBot.connected || false,
            canSend: status.connected || waBot.connected || false,
            ready: status.status === "active" || status.connected || false,
            phone: status.phone || waBot.connectedPhone || null,
        });

    } catch (err) {
        logger.error("healthRoutes /whatsapp/status:", err.message);
        res.json({ connected: false, canSend: false, ready: false, phone: null, error: err.message });
    }
});

module.exports = router;