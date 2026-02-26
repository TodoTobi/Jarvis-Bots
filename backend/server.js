/**
 * server.js — JarvisCore Backend Entry Point v2
 * Added: md routes, settings, bats, computer control
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "config/.env") });

const express = require("express");
const cors = require("cors");

const chatRoutes = require("./routes/chatRoutes");
const botRoutes = require("./routes/botRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const mdRoutes = require("./routes/mdRoutes");         // ← NEW
const logger = require("./logs/logger");

const app = express();

app.use(cors({
   origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
   methods: ["GET", "POST", "PUT", "DELETE"],
   credentials: true
}));

app.use(express.json({ limit: "50mb" }));  // Increased for base64 images/PDFs

// Request logging
app.use((req, res, next) => {
   logger.info(`${req.method} ${req.path}`);
   next();
});

/* =========================
   ROUTES
========================= */
app.use("/api", chatRoutes);
app.use("/api", botRoutes);
app.use("/api", deviceRoutes);
app.use("/api", mdRoutes);   // ← NEW: /api/md, /api/settings, /api/bats, /api/whitelist

/* =========================
   UPLOAD ENDPOINT (for vision/pdf files)
========================= */
const multer = require("multer");
const fs = require("fs");

const uploadDir = path.resolve(__dirname, "../tmp/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
   dest: uploadDir,
   limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

app.post("/api/upload", upload.single("file"), async (req, res, next) => {
   try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const botManager = require("./bots/BotManager");
      const query = req.body.query || "Analizá este archivo";
      const mimeType = req.file.mimetype;
      const filePath = req.file.path;

      let action = "analyze_image";
      if (mimeType === "application/pdf") action = "analyze_pdf";
      else if (mimeType.startsWith("audio/")) action = "transcribe_audio";
      else if (mimeType.startsWith("image/")) action = "analyze_image";

      // Ensure VisionBot is active
      if (!botManager.isBotActive("VisionBot")) botManager.activateBot("VisionBot");

      const result = await botManager.executeIntent({
         intent: "vision_analyze",
         parameters: { action, filePath, mimeType, query }
      });

      // Cleanup temp file
      try { fs.unlinkSync(filePath); } catch { }

      res.json(result);
   } catch (err) { next(err); }
});

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
   logger.error(`[${req.method} ${req.path}] ${err.message}`);
   res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal Server Error"
   });
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
   logger.info(`JarvisCore backend running on http://localhost:${PORT}`);
   logger.info("Routes: /api/chat | /api/bots | /api/devices | /api/md | /api/settings | /api/bats | /api/upload");
});