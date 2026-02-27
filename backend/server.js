/**
 * server.js — JarvisCore Backend v3.2
 *
 * NEW in this version:
 *  - /api/stt/* — Groq Whisper Speech-to-Text
 *  - /api/whatsapp/* — WhatsApp status, QR, send
 *  - historyRoutes was already added in v3.1
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
const sttRoutes = require("./routes/sttRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const logger = require("./logs/logger");

const app = express();

app.use(cors({
   origin: [
      "http://localhost:3000", "http://127.0.0.1:3000",
      "http://localhost:5173", "http://127.0.0.1:5173"
   ],
   methods: ["GET", "POST", "PUT", "DELETE"],
   credentials: true,
}));

app.use(express.json({ limit: "50mb" }));

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
app.use("/api", sttRoutes);
app.use("/api", whatsappRoutes.router);

/* ── Settings route ───────────────────────────────────── */
const settingsPath = path.resolve(__dirname, "config/settings.json");

app.get("/api/settings", (req, res) => {
   try {
      const raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf-8") : "{}";
      const settings = JSON.parse(raw);
      if (settings.vision_api_key) settings.vision_api_key = "***configured***";
      if (settings.lm_api_token) settings.lm_api_token = "***configured***";
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
      if (incoming.vision_api_key === "***configured***") delete incoming.vision_api_key;
      if (incoming.lm_api_token === "***configured***") delete incoming.lm_api_token;
      const merged = { ...current, ...incoming };
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
      res.json({ success: true });
   } catch (err) {
      res.status(500).json({ error: err.message });
   }
});

/* ── Upload endpoint (needs: npm install multer) ─────── */
const uploadDir = path.resolve(__dirname, "../tmp/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

let multerMiddleware = null;
try {
   const multer = require("multer");
   const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });
   multerMiddleware = upload.single("file");
   logger.info("Upload endpoint enabled (multer found)");
} catch {
   logger.warn("multer not found — upload endpoint disabled. Run: npm install multer");
}

app.post("/api/upload", (req, res, next) => {
   if (!multerMiddleware) {
      return res.status(503).json({
         success: false,
         error: "File upload not available. Run: npm install multer",
      });
   }
   multerMiddleware(req, res, async (err) => {
      if (err) return next(err);
      try {
         if (!req.file) return res.status(400).json({ error: "No file provided" });

         const botManager = require("./bots/BotManager");
         const query = req.body.query || "Analizá este archivo";
         const mimeType = req.file.mimetype;
         const filePath = req.file.path;

         let action = "analyze_image";
         if (mimeType === "application/pdf") action = "analyze_pdf";
         else if (mimeType.startsWith("audio/")) {
            // Route audio to STT instead of VisionBot
            try { fs.unlinkSync(filePath); } catch { }
            return res.status(400).json({
               success: false,
               error: "Para audios, usá el endpoint /api/stt/transcribe",
            });
         }

         if (!botManager.isBotActive("VisionBot")) botManager.activateBot("VisionBot");

         const result = await botManager.executeIntent({
            intent: "vision_analyze",
            parameters: { action, filePath, mimeType, query },
         });

         try { fs.unlinkSync(filePath); } catch { }
         res.json(result);
      } catch (e) { next(e); }
   });
});

/* ── 404 ──────────────────────────────────────────────── */
app.use((req, res) => {
   res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

/* ── Error handler ────────────────────────────────────── */
app.use((err, req, res, next) => {
   logger.error(`[${req.method} ${req.path}] ${err.message}`);
   res.status(err.status || 500).json({ success: false, error: err.message || "Internal Server Error" });
});

/* ── Start ────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
   logger.info(`JarvisCore backend running on http://localhost:${PORT}`);
   logger.info("Routes: /api/chat | /api/bots | /api/devices | /api/md | /api/settings | /api/doctor | /api/history | /api/stt | /api/whatsapp | /api/upload");
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT", () => { server.close(() => process.exit(0)); });