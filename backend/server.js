/**
 * server.js — JarvisCore Backend Entry Point
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "config/.env") });

const express = require("express");
const cors = require("cors");

const chatRoutes = require("./routes/chatRoutes");
const botRoutes = require("./routes/botRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const logger = require("./logs/logger");

const app = express();

/* =========================
   MIDDLEWARE
========================= */

app.use(cors({
   origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
   methods: ["GET", "POST", "PUT", "DELETE"],
   credentials: true
}));

app.use(express.json({ limit: "10mb" }));

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

/* =========================
   GLOBAL ERROR HANDLER
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
   logger.info("Routes: /api/chat | /api/bots | /api/devices | /api/scripts");
});