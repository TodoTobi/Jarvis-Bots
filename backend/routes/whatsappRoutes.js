/**
 * whatsappRoutes.js — v2 con getState()
 *
 * CAMBIOS:
 *  - Exporta getState() para que BotManager pueda leer el estado sin depender de .state
 *  - Al pedir /api/whatsapp/qr, si el bot no está activo lo activa automáticamente
 *  - BotManager.getBot() es público y funciona correctamente en esta versión
 */

const express = require("express");
const router = express.Router();
const logger = require("../logs/logger");

// ── Estado interno ────────────────────────────────────
let _qrData = null;   // base64 PNG
let _phone = null;
let _connected = false;
let _qrTimestamp = 0;

/* Llamados por WhatsAppBot cuando cambia el estado */
function setQR(base64) {
    _qrData = base64;
    _connected = false;
    _phone = null;
    _qrTimestamp = Date.now();
    logger.info("WhatsApp: QR listo para frontend");
}

function setConnected(phone) {
    _qrData = null;
    _connected = true;
    _phone = phone || null;
    logger.info(`WhatsApp: conectado como ${phone}`);
}

function setDisconnected() {
    _qrData = null;
    _connected = false;
    _phone = null;
    logger.info("WhatsApp: desconectado");
}

/** Lectura del estado — usado por BotManager._handleWhatsAppQR() */
function getState() {
    return {
        connected: _connected,
        qr: _qrData,
        phone: _phone,
        qrTimestamp: _qrTimestamp
    };
}

/* ── GET /api/whatsapp/qr ── */
router.get("/qr", async (req, res) => {
    // Ya conectado
    if (_connected) {
        return res.json({ available: false, status: "connected", phone: _phone });
    }

    // QR disponible
    if (_qrData) {
        // Verificar que no expiró (QR dura ~60s)
        const age = Date.now() - _qrTimestamp;
        if (age > 65000) {
            _qrData = null; // expirado
        } else {
            const src = _qrData.startsWith("data:") ? _qrData : `data:image/png;base64,${_qrData}`;
            return res.json({ available: true, qr: src, status: "qr_ready", expiresIn: Math.round((65000 - age) / 1000) });
        }
    }

    // Auto-activar el bot para generar QR
    try {
        const BotManager = require("../bots/BotManager");
        if (!BotManager.isBotActive("WhatsAppBot")) {
            logger.info("WhatsApp: activando bot para generar QR...");
            BotManager.activateBot("WhatsAppBot");
        }
    } catch (err) {
        logger.error(`WhatsApp activate error: ${err.message}`);
        return res.json({ available: false, status: "error", error: err.message });
    }

    return res.json({ available: false, status: "connecting" });
});

/* ── GET /api/whatsapp/status ── */
router.get("/status", (req, res) => {
    if (_connected) return res.json({ status: "connected", phone: _phone, qrAvailable: false });
    if (_qrData) return res.json({ status: "qr_ready", qrAvailable: true, phone: null });
    return res.json({ status: "disconnected", qrAvailable: false, phone: null });
});

/* ── POST /api/whatsapp/disconnect ── */
router.post("/disconnect", async (req, res) => {
    try {
        const BotManager = require("../bots/BotManager");
        if (BotManager.isBotActive("WhatsAppBot")) {
            BotManager.deactivateBot("WhatsAppBot");
        }
        setDisconnected();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { router, setQR, setConnected, setDisconnected, getState };