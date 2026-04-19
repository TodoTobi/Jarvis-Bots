/**
 * server.js — JarvisCore Backend v5.0 (FIXED + uploadRoutes integrado)
 *
 * CAMBIOS:
 *  - uploadRoutes agregado correctamente (ANTES del handler inline /api/upload)
 *  - estructura respetada
 *  - compatible con futuras mejoras (PDF, MIME types, etc.)
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "config/.env") });

const express = require("express");
const cors = require("cors");
const fs = require("fs");

const chatRoutes = require("./routes/chatRoutes");
const botRoutes = require("./routes/botRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const mdRoutes = require("./routes/mdRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const historyRoutes = require("./routes/historyRoutes");
const sttGemmaRoutes = require("./routes/sttGemmaRoutes");
const selfAwarenessRoutes = require("./routes/selfAwarenessRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const restartRoutes = require("./routes/restartRoutes");
const healthRoutes = require("./routes/healthRoutes");

// ✅ NUEVO (CHANGE 1)
const uploadRoutes = require("./routes/uploadRoutes");

const logger = require("./logs/logger");

const app = express();

/* ── CORS ─────────────────────────────────────────────── */
app.use(cors({
    origin: [
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));

app.use(express.json({ limit: "50mb" }));

/* ── Logger ───────────────────────────────────────────── */
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

/* ── Routes ───────────────────────────────────────────── */
app.use("/api", chatRoutes);
app.use("/api", botRoutes);
app.use("/api", deviceRoutes);
app.use("/api", mdRoutes);
app.use("/api", doctorRoutes);
app.use("/api", historyRoutes);

// Gemma 4 — STT, análisis multimedia, canvas, terminal
app.use("/api", sttGemmaRoutes);

// Self-awareness
app.use("/api", selfAwarenessRoutes);

app.use("/api", whatsappRoutes.router);
app.use("/api", restartRoutes);

// ✅ NUEVO: uploadRoutes DEBE ir antes de health y antes del handler inline
app.use("/api", uploadRoutes);

app.use("/api", healthRoutes);

/* ── Settings route ───────────────────────────────────── */
const settingsPath = path.resolve(__dirname, "config/settings.json");

app.get("/api/settings", (req, res) => {
    try {
        const raw = fs.existsSync(settingsPath)
            ? fs.readFileSync(settingsPath, "utf-8")
            : "{}";

        const settings = JSON.parse(raw);
        const masked = ["vision_api_key", "lm_api_token", "groq_api_key"];

        masked.forEach(k => {
            if (settings[k]) settings[k] = "***configured***";
        });

        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/settings", (req, res) => {
    try {
        const current = fs.existsSync(settingsPath)
            ? JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
            : {};

        const incoming = req.body;

        ["vision_api_key", "lm_api_token", "groq_api_key"].forEach(k => {
            if (incoming[k] === "***configured***") delete incoming[k];
        });

        const merged = { ...current, ...incoming };
        fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ── Upload fallback (INLINE) ─────────────────────────────
   Este queda como fallback.
   uploadRoutes va a interceptar primero.
   Podés eliminarlo después si todo funciona.
*/
const uploadDir = path.resolve(__dirname, "../tmp/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

let multerMiddleware = null;

try {
    const multer = require("multer");
    const upload = multer({
        dest: uploadDir,
        limits: { fileSize: 25 * 1024 * 1024 }
    });

    multerMiddleware = upload.single("file");
    logger.info("Upload fallback enabled (Gemma 4 only)");

} catch {
    logger.warn("multer not found — run: npm install multer");
}

app.post("/api/upload", (req, res, next) => {
    if (!multerMiddleware) {
        return res.status(503).json({
            success: false,
            error: "Run: npm install multer"
        });
    }

    multerMiddleware(req, res, async (err) => {
        if (err) return next(err);
        if (!req.file) return res.status(400).json({ error: "No file provided" });

        const mimeType = req.file.mimetype;
        const filePath = req.file.path;
        const query = req.body.query || "Analizá este archivo detalladamente";

        if (!process.env.LM_API_URL) {
            try { fs.unlinkSync(filePath); } catch {}
            return res.status(503).json({
                success: false,
                error: "LM_API_URL no configurado."
            });
        }

        try {
            const axios = require("axios");
            const FormData = require("form-data");

            const form = new FormData();
            form.append("file", fs.createReadStream(filePath), {
                filename: req.file.originalname || "file",
                contentType: mimeType,
            });
            form.append("query", query);

            const gemmaRes = await axios.post(
                `http://localhost:${process.env.PORT || 3001}/api/gemma/analyze`,
                form,
                { headers: form.getHeaders(), timeout: 120000 }
            );

            try { fs.unlinkSync(filePath); } catch {}

            return res.json(gemmaRes.data);

        } catch (gemmaErr) {
            logger.error(`Gemma upload analyze failed: ${gemmaErr.message}`);

            try { fs.unlinkSync(filePath); } catch {}

            return res.status(500).json({
                success: false,
                error: gemmaErr.message
            });
        }
    });
});

/* ── 404 ─────────────────────────────────────────────── */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`
    });
});

/* ── Error handler ───────────────────────────────────── */
app.use((err, req, res, next) => {
    logger.error(`[${req.method} ${req.path}] ${err.message}`);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || "Internal Server Error"
    });
});

/* ── Start ───────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    logger.info(`JarvisCore backend running on http://localhost:${PORT}`);
    logger.info("Routes: /api/chat | /api/upload | /api/gemma | /api/terminal | etc");
});

process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
    server.close(() => process.exit(0));
});