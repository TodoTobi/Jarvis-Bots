const path = require("path");
// Cargar .env desde la carpeta config
require("dotenv").config({ path: path.resolve(__dirname, "config/.env") });

const express = require("express");
const cors = require("cors");

const chatRoutes = require("./routes/chatRoutes");
const botRoutes = require("./routes/botRoutes");

const app = express();

/* =========================
   GLOBAL MIDDLEWARE
========================= */

app.use(cors());
app.use(express.json());

/* =========================
   ROUTES
========================= */

app.use("/api", chatRoutes);
app.use("/api", botRoutes);

/* =========================
   GLOBAL ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
   console.error("GLOBAL ERROR:", err.message);

   res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal Server Error"
   });
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
   console.log(`Backend running on http://localhost:${PORT}`);
});