/**
 * server.js — JarvisCore Backend v3
 * FIX: multer is now a lazy optional require — won't crash if not installed
 *      Run: npm install multer   to enable file upload
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
const logger = require("./logs/logger");

const app = express();

app.use(cors({
   origin: [
      "http://localhost:3000", "http://127.0.0.1:3000",
      "http://localhost:5173", "http://127.0.0.1:5173"
   ],
   methods: ["GET", "POST", "PUT", "DELETE"],
   credentials: true
}));

app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
   logger.info(`${req.method} ${req.path}`);
   next();
});

/* ── Routes ──────────────────────────────────────────── */
app.use("/api", chatRoutes);
app.use("/api", botRoutes);
app.use("/api", deviceRoutes);
app.use("/api", mdRoutes);
app.use("/api", doctorRoutes);

/* ── Upload endpoint (optional — needs: npm install multer) ── */
const uploadDir = path.resolve(__dirname, "../tmp/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

let multerMiddleware = null;
try {
   const multer = require("multer");
   const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });
   multerMiddleware = upload.single("file");
   logger.info("Upload endpoint enabled (multer found)");
} catch {
   logger.warn("multer not installed — file upload disabled. Run: npm install multer");
}

app.post("/api/upload", (req, res, next) => {
   if (!multerMiddleware) {
      return res.status(503).json({
         success: false,
         error: "File upload not available. Run: npm install multer   in the backend folder, then restart."
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
         else if (mimeType.startsWith("audio/")) action = "transcribe_audio";

         if (!botManager.isBotActive("VisionBot")) botManager.activateBot("VisionBot");

         const result = await botManager.executeIntent({
            intent: "vision_analyze",
            parameters: { action, filePath, mimeType, query }
         });

         try { fs.unlinkSync(filePath); } catch { }
         res.json(result);
      } catch (e) { next(e); }
   });
});

/* ── Error handler ───────────────────────────────────── */
app.use((err, req, res, next) => {
   logger.error(`[${req.method} ${req.path}] ${err.message}`);
   res.status(err.status || 500).json({ success: false, error: err.message || "Internal Server Error" });
});

/* ── Start ───────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
   logger.info(`JarvisCore backend running on http://localhost:${PORT}`);
   logger.info("Routes: /api/chat | /api/bots | /api/devices | /api/md | /api/settings | /api/doctor | /api/upload");
});