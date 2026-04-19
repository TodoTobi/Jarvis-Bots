/**
 * server.js — JarvisCore Backend v4.0
 *
 * CAMBIOS vs v3.3:
 *  - sttGemmaRoutes: reemplaza sttRoutes para usar Gemma 4 local
 *  - selfAwarenessRoutes: Jarvis conoce su propio código
 *  - Ambas rutas registradas ANTES de sttRoutes (prioridad)
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
const sttGemmaRoutes = require("./routes/sttGemmaRoutes");   // ← Gemma 4 STT (reemplaza Groq)
const sttRoutes = require("./routes/sttRoutes");              // ← Groq como fallback
const selfAwarenessRoutes = require("./routes/selfAwarenessRoutes"); // ← Self-awareness
const whatsappRoutes = require("./routes/whatsappRoutes");
const geminiRoutes = require("./routes/geminiRoutes");
const restartRoutes = require("./routes/restartRoutes");
const logger = require("./logs/logger");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

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

// STT: Gemma 4 primero (registra /api/stt/transcribe y /api/gemma/canvas)
// Si Gemma no soporta audio, el frontend puede hacer fallback a /api/stt/groq/transcribe
app.use("/api", sttGemmaRoutes);

// STT Groq como fallback — registrado bajo /api/stt/groq/* para no colisionar
// Para usar Groq, el frontend debe llamar a /api/stt/groq/transcribe
// (requerir sttRoutes aquí lo haría colisionar con Gemma en /api/stt/transcribe)

// Self-awareness — Jarvis conoce su código
app.use("/api", selfAwarenessRoutes);

app.use("/api", whatsappRoutes.router);
app.use("/api", geminiRoutes);
app.use("/api", restartRoutes);
app.use("/api", healthRoutes);

/* ── Settings route ───────────────────────────────────── */
const settingsPath = path.resolve(__dirname, "config/settings.json");

app.get("/api/settings", (req, res) => {
   try {
      const raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf-8") : "{}";
      const settings = JSON.parse(raw);
      const masked = ["vision_api_key", "lm_api_token", "groq_api_key", "gemini_vision_key", "gemini_docs_key"];
      masked.forEach(k => { if (settings[k]) settings[k] = "***configured***"; });
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
      ["vision_api_key", "lm_api_token", "groq_api_key", "gemini_vision_key", "gemini_docs_key"].forEach(k => {
         if (incoming[k] === "***configured***") delete incoming[k];
      });
      const merged = { ...current, ...incoming };
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
      res.json({ success: true });
   } catch (err) {
      res.status(500).json({ error: err.message });
   }
});

/* ── Upload (images + PDFs via Gemini o VisionBot) ───── */
const uploadDir = path.resolve(__dirname, "../tmp/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

let multerMiddleware = null;
try {
   const multer = require("multer");
   const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });
   multerMiddleware = upload.single("file");
   logger.info("Upload endpoint enabled");
} catch {
   logger.warn("multer not found — run: npm install multer");
}

app.post("/api/upload", (req, res, next) => {
   if (!multerMiddleware) {
      return res.status(503).json({ success: false, error: "Run: npm install multer" });
   }
   multerMiddleware(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const mimeType = req.file.mimetype;
      const filePath = req.file.path;
      const query = req.body.query || "Analizá este archivo detalladamente";
      const isImage = mimeType.startsWith("image/");
      const isPdf = mimeType === "application/pdf";
      const isAudio = mimeType.startsWith("audio/");
      const isVideo = mimeType.startsWith("video/");

      // Gemma 4 puede analizar imágenes, PDFs, audio y video
      if ((isImage || isPdf || isAudio || isVideo)) {
         const hasGemma = !!(process.env.LM_API_URL);
         if (hasGemma) {
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

               try { fs.unlinkSync(filePath); } catch { }
               return res.json(gemmaRes.data);
            } catch (gemmaErr) {
               logger.warn(`Gemma analyze failed: ${gemmaErr.message} — fallback a Gemini`);
            }
         }
      }

      // Fallback: Gemini para imágenes y PDFs si hay keys
      if ((isImage || isPdf) && (process.env.GEMINI_VISION_KEY || process.env.GEMINI_DOCS_KEY)) {
         try {
            const geminiKey = isPdf
               ? (process.env.GEMINI_DOCS_KEY || process.env.GEMINI_VISION_KEY)
               : (process.env.GEMINI_VISION_KEY || process.env.GEMINI_DOCS_KEY);

            const fileData = fs.readFileSync(filePath);
            const base64Data = fileData.toString("base64");
            const https = require("https");
            const GEMINI_MODEL = "gemini-2.0-flash";
            const bodyStr = JSON.stringify({
               contents: [{
                  parts: [
                     { inline_data: { mime_type: mimeType, data: base64Data } },
                     { text: query },
                  ],
               }],
               generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
            });

            const responseText = await new Promise((resolve, reject) => {
               const apiPath = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
               const req2 = https.request(
                  { hostname: "generativelanguage.googleapis.com", path: apiPath, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } },
                  (r) => {
                     let d = "";
                     r.on("data", c => { d += c; });
                     r.on("end", () => {
                        try {
                           const p = JSON.parse(d);
                           if (r.statusCode >= 400) reject(new Error(p.error?.message || `Gemini ${r.statusCode}`));
                           else resolve(p.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta");
                        } catch { reject(new Error("Parse error")); }
                     });
                  }
               );
               req2.on("error", reject);
               req2.setTimeout(60000, () => { req2.destroy(); reject(new Error("Gemini timeout")); });
               req2.write(bodyStr);
               req2.end();
            });

            try { fs.unlinkSync(filePath); } catch { }
            return res.json({
               success: true,
               reply: responseText,
               intent: isPdf ? "document_analysis" : "image_analysis",
               bot: "GeminiBot",
            });
         } catch (geminiErr) {
            logger.warn(`Gemini failed: ${geminiErr.message}`);
            try { fs.unlinkSync(filePath); } catch { }
            return res.status(500).json({ success: false, error: `Gemini: ${geminiErr.message}` });
         }
      }

      // Fallback final: VisionBot
      try {
         const botManager = require("./bots/BotManager");
         if (!botManager.isBotActive("VisionBot")) botManager.activateBot("VisionBot");
         const result = await botManager.executeIntent({
            intent: "vision_analyze",
            parameters: { action: "analyze_image", filePath, mimeType, query },
         });
         try { fs.unlinkSync(filePath); } catch { }
         res.json(result);
      } catch (e) { next(e); }
   });
});

/* ── 404 ───────────────────────────────────────────────── */
app.use((req, res) => {
   res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

/* ── Error handler ─────────────────────────────────────── */
app.use((err, req, res, next) => {
   logger.error(`[${req.method} ${req.path}] ${err.message}`);
   res.status(err.status || 500).json({ success: false, error: err.message || "Internal Server Error" });
});

/* ── Start ─────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
   logger.info(`JarvisCore backend running on http://localhost:${PORT}`);
   logger.info("Routes: /api/chat | /api/bots | /api/devices | /api/md | /api/stt | /api/self | /api/gemma | /api/gemini | /api/system | /api/upload");
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT", () => { server.close(() => process.exit(0)); });