/**
 * whatsappRoutes.js — Fixed version
 *
 * KEY FIX: The /qr endpoint now also returns status and phone so the
 * frontend can detect "already connected" without needing a separate
 * /status endpoint.
 *
 * WhatsAppBot calls these setters when its state changes:
 *   whatsappRoutes.setQR(base64)
 *   whatsappRoutes.setConnected(phoneNumber)
 *   whatsappRoutes.setDisconnected()
 */

const express = require("express");
const router = express.Router();
const BotManager = require("../bots/BotManager");
const logger = require("../logs/logger");

// ── Shared state (set by WhatsAppBot) ──
let _qrData = null;   // base64 PNG string
let _phone = null;   // phone number when connected
let _connected = false;

/* Called by WhatsAppBot when a QR is generated */
function setQR(base64) {
    _qrData = base64;
    _connected = false;
    _phone = null;
    logger.info("WhatsApp: QR ready for frontend");
}

/* Called by WhatsAppBot when authenticated & ready */
function setConnected(phone) {
    _qrData = null;
    _connected = true;
    _phone = phone || null;
    logger.info(`WhatsApp: connected as ${phone}`);
}

/* Called by WhatsAppBot when disconnected */
function setDisconnected() {
    _qrData = null;
    _connected = false;
    _phone = null;
    logger.info("WhatsApp: disconnected");
}

/* ── GET /api/whatsapp/qr ──
   Returns QR if available, or current connection status.
   Also activates the bot if it's not yet running.
*/
router.get("/qr", async (req, res) => {
    // If already connected, return connected state immediately
    if (_connected) {
        return res.json({
            available: false,
            status: "connected",
            phone: _phone,
        });
    }

    // If QR is ready, return it
    if (_qrData) {
        const src = _qrData.startsWith("data:") ? _qrData : `data:image/png;base64,${_qrData}`;
        return res.json({
            available: true,
            qr: src,
            status: "qr_ready",
            expiresIn: 60,
        });
    }

    // Not connected and no QR yet — activate the bot to start generating
    try {
        const bot = BotManager.getBot("WhatsAppBot");
        if (bot && !bot.active) {
            logger.info("WhatsApp: activating bot to generate QR...");
            await BotManager.activateBot("WhatsAppBot");
        }
    } catch (err) {
        logger.error(`WhatsApp activate error: ${err.message}`);
        return res.json({ available: false, status: "error", error: err.message });
    }

    // Bot is initializing
    return res.json({
        available: false,
        status: "connecting",
    });
});

/* ── GET /api/whatsapp/status — same data, explicit endpoint ── */
router.get("/status", (req, res) => {
    if (_connected) {
        return res.json({ status: "connected", phone: _phone, qrAvailable: false });
    }
    if (_qrData) {
        return res.json({ status: "qr_ready", qrAvailable: true, phone: null });
    }
    return res.json({ status: "disconnected", qrAvailable: false, phone: null });
});

/* ── POST /api/whatsapp/disconnect ── */
router.post("/disconnect", async (req, res) => {
    try {
        const bot = BotManager.getBot("WhatsAppBot");
        if (bot && bot.active) {
            await BotManager.deactivateBot("WhatsAppBot");
        }
        setDisconnected();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { router, setQR, setConnected, setDisconnected };