/**
 * ttsRoutes.js — proxy TTS hacia servidor Python Kokoro local
 * POST /api/tts/speak  — recibe { text } → devuelve audio/wav
 * GET  /api/tts/status — estado del servidor Kokoro
 */

const express = require("express");
const router  = express.Router();
const http    = require("http");
const logger  = require("../logs/logger");

const TTS_HOST = "127.0.0.1";
const TTS_PORT = 5002;

/* ── GET /api/tts/status ─────────────────────────────────── */
router.get("/tts/status", (req, res) => {
    const options = {
        hostname: TTS_HOST, port: TTS_PORT,
        path: "/status", method: "GET", timeout: 3000,
    };
    const request = http.request(options, (upstream) => {
        let data = "";
        upstream.on("data", c => data += c);
        upstream.on("end", () => {
            try { res.json(JSON.parse(data)); }
            catch { res.json({ ok: false, error: "parse error" }); }
        });
    });
    request.on("error", () => res.json({
        ok: false,
        error: "Servidor TTS no disponible — corré tts/start_tts.bat",
    }));
    request.end();
});

/* ── POST /api/tts/speak ─────────────────────────────────── */
router.post("/tts/speak", (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text requerido" });

    const body    = JSON.stringify({ text });
    const options = {
        hostname: TTS_HOST,
        port:     TTS_PORT,
        path:     "/synthesize",
        method:   "POST",
        headers: {
            "Content-Type":   "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
        timeout: 30000,
    };

    logger.info(`TTS: "${text.substring(0, 60)}..."`);

    const request = http.request(options, (upstream) => {
        if (upstream.statusCode >= 400) {
            let err = "";
            upstream.on("data", c => err += c);
            upstream.on("end", () => {
                logger.error(`TTS Kokoro error ${upstream.statusCode}: ${err.substring(0, 200)}`);
                if (!res.headersSent) res.status(upstream.statusCode).json({ error: err });
            });
            return;
        }
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Cache-Control", "no-cache");
        upstream.pipe(res);
    });

    request.on("error", (err) => {
        logger.error(`TTS request error: ${err.message}`);
        if (!res.headersSent) res.status(503).json({
            error: "Servidor TTS no disponible. Corré tts/start_tts.bat primero.",
        });
    });

    request.on("timeout", () => {
        request.destroy();
        if (!res.headersSent) res.status(504).json({ error: "TTS timeout (30s)" });
    });

    request.write(body);
    request.end();
});

module.exports = router;