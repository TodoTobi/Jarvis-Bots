/**
 * whatsappRoutes.js — WhatsApp Bot API endpoints
 *
 * Endpoints:
 *  GET  /api/whatsapp/status     — Connection status + QR availability
 *  GET  /api/whatsapp/qr         — Get current QR code as base64 PNG
 *  POST /api/whatsapp/disconnect — Disconnect and reset session
 *
 * How QR works:
 *  WhatsAppBot (whatsapp-web.js) emits 'qr' events → stored in module-level cache
 *  Frontend polls /api/whatsapp/qr every 5s and renders the QR image
 *  Once scanned, status transitions to 'connected' and QR is cleared
 */

const express = require("express");
const router = express.Router();
const logger = require("../logs/logger");

/* ── QR state (module-level singleton) ────────────────── */
const state = {
    qr: null,           // base64 QR string (null if not available)
    qrTimestamp: null,  // when QR was last generated
    status: "disconnected", // disconnected | qr_ready | connecting | connected | error
    phone: null,        // connected phone number
    error: null,
};

// Expose state so WhatsAppBot can update it
module.exports.state = state;
module.exports.setQR = (qrBase64) => {
    state.qr = qrBase64;
    state.qrTimestamp = Date.now();
    state.status = "qr_ready";
    logger.info("WhatsApp: QR updated");
};
module.exports.setConnected = (phoneNumber) => {
    state.qr = null;
    state.status = "connected";
    state.phone = phoneNumber;
    state.error = null;
    logger.info(`WhatsApp: connected as ${phoneNumber}`);
};
module.exports.setDisconnected = () => {
    state.status = "disconnected";
    state.qr = null;
    state.phone = null;
    logger.info("WhatsApp: disconnected");
};
module.exports.setError = (msg) => {
    state.status = "error";
    state.error = msg;
    logger.error(`WhatsApp: ${msg}`);
};

/* ── GET /api/whatsapp/status ─────────────────────────── */
router.get("/whatsapp/status", (req, res) => {
    res.json({
        status: state.status,
        connected: state.status === "connected",
        qrAvailable: state.status === "qr_ready" && !!state.qr,
        phone: state.phone,
        error: state.error,
    });
});

/* ── GET /api/whatsapp/qr ─────────────────────────────── */
router.get("/whatsapp/qr", (req, res) => {
    if (!state.qr) {
        // Try to trigger QR generation by initializing the bot
        try {
            const botManager = require("../bots/BotManager");
            if (!botManager.isBotActive("WhatsAppBot")) {
                botManager.activateBot("WhatsAppBot");
                state.status = "connecting";
                logger.info("WhatsApp: activating bot to generate QR...");
            }
        } catch (err) {
            logger.warn(`WhatsApp: could not activate bot — ${err.message}`);
        }

        return res.json({
            available: false,
            status: state.status,
            message:
                state.status === "connected"
                    ? "Ya estás conectado"
                    : state.status === "connecting"
                        ? "Generando QR, esperá unos segundos..."
                        : "QR no disponible. Asegurate que WhatsAppBot esté activo.",
        });
    }

    // QR expires after 60 seconds (WhatsApp QR refresh interval)
    const age = Date.now() - (state.qrTimestamp || 0);
    if (age > 60000) {
        state.qr = null;
        return res.json({ available: false, status: "qr_expired", message: "QR expiró, generando nuevo..." });
    }

    res.json({
        available: true,
        status: state.status,
        qr: state.qr, // base64 PNG from qrcode library
        expiresIn: Math.max(0, 60 - Math.floor(age / 1000)),
    });
});

/* ── POST /api/whatsapp/disconnect ────────────────────── */
router.post("/whatsapp/disconnect", async (req, res) => {
    try {
        const botManager = require("../bots/BotManager");
        await botManager.deactivateBot("WhatsAppBot");
        state.status = "disconnected";
        state.qr = null;
        state.phone = null;
        res.json({ success: true, message: "WhatsApp desconectado" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ── POST /api/whatsapp/send ──────────────────────────── */
router.post("/whatsapp/send", async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ success: false, error: "Faltan campos: to, message" });
    }

    if (state.status !== "connected") {
        return res.status(503).json({
            success: false,
            error: "WhatsApp no está conectado. Escaneá el QR primero.",
        });
    }

    try {
        const botManager = require("../bots/BotManager");
        const result = await botManager.executeIntent({
            intent: "whatsapp_send",
            parameters: { to, message },
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports.router = router;