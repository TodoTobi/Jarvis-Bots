/**
 * mdRoutes.js — API endpoints for reading and writing .md instruction files
 * Allows the UI to edit the model's instruction files without touching the filesystem manually.
 */

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const logger = require("../logs/logger");

const MD_PATH = path.resolve(__dirname, "../../md");

const ALLOWED_FILES = [
    "identity", "soul", "user", "tools",
    "bots", "heartbeat", "bootstrap", "memory"
];

// ── GET /api/md — list all .md files with their content ──────
router.get("/md", (req, res, next) => {
    try {
        if (!fs.existsSync(MD_PATH)) {
            return res.json({ files: [] });
        }

        const files = fs.readdirSync(MD_PATH)
            .filter(f => f.endsWith(".md"))
            .map(f => {
                const key = f.replace(".md", "");
                let content = "";
                try { content = fs.readFileSync(path.join(MD_PATH, f), "utf-8"); } catch { }
                return {
                    key,
                    filename: f,
                    content,
                    allowed: ALLOWED_FILES.includes(key),
                    size: content.length
                };
            });

        res.json({ files });
    } catch (err) { next(err); }
});

// ── GET /api/md/:key — read single file ───────────────────────
router.get("/md/:key", (req, res, next) => {
    try {
        const { key } = req.params;
        if (!ALLOWED_FILES.includes(key)) {
            return res.status(403).json({ error: "File not allowed" });
        }

        const filePath = path.join(MD_PATH, `${key}.md`);
        if (!fs.existsSync(filePath)) {
            return res.json({ key, content: "" });
        }

        const content = fs.readFileSync(filePath, "utf-8");
        res.json({ key, content });
    } catch (err) { next(err); }
});

// ── PUT /api/md/:key — write single file ─────────────────────
router.put("/md/:key", (req, res, next) => {
    try {
        const { key } = req.params;
        if (!ALLOWED_FILES.includes(key)) {
            return res.status(403).json({ error: "File not allowed" });
        }

        const { content } = req.body;
        if (typeof content !== "string") {
            return res.status(400).json({ error: "content must be a string" });
        }

        fs.mkdirSync(MD_PATH, { recursive: true });
        const filePath = path.join(MD_PATH, `${key}.md`);
        fs.writeFileSync(filePath, content, "utf-8");

        // Reload instruction loader cache
        try {
            const instructionLoader = require("../utils/InstructionLoader");
            instructionLoader.reload();
        } catch { }

        logger.info(`MD file updated: ${key}.md (${content.length} chars)`);
        res.json({ success: true, key, size: content.length });
    } catch (err) { next(err); }
});

// ── GET /api/settings — read settings from .env-like config ──
router.get("/settings", (req, res, next) => {
    try {
        const settings = {
            lm_api_url: process.env.LM_API_URL || "",
            lm_model: process.env.LM_MODEL || "",
            port: process.env.PORT || "3001",
            whatsapp_numbers: process.env.WHATSAPP_ALLOWED_NUMBERS || "",
            whatsapp_debug: process.env.WHATSAPP_DEBUG === "true",
            whisper_cpp_path: process.env.WHISPER_CPP_PATH || "",
            whisper_model_path: process.env.WHISPER_MODEL_PATH || "",
            computer_control_enabled: process.env.COMPUTER_CONTROL_ENABLED === "true",
            vision_api_key: process.env.VISION_API_KEY ? "***configured***" : "",
            vision_provider: process.env.VISION_PROVIDER || "claude"
        };
        res.json(settings);
    } catch (err) { next(err); }
});

// ── POST /api/settings — update .env file ────────────────────
router.post("/settings", (req, res, next) => {
    try {
        const envPath = path.resolve(__dirname, "../config/.env");
        const allowed = [
            "LM_API_URL", "LM_MODEL", "PORT",
            "WHATSAPP_ALLOWED_NUMBERS", "WHATSAPP_DEBUG",
            "WHISPER_CPP_PATH", "WHISPER_MODEL_PATH",
            "COMPUTER_CONTROL_ENABLED", "VISION_API_KEY", "VISION_PROVIDER"
        ];

        let envContent = "";
        try { envContent = fs.readFileSync(envPath, "utf-8"); } catch { }

        const updates = req.body;
        const lines = envContent.split("\n");

        for (const [key, value] of Object.entries(updates)) {
            const upperKey = key.toUpperCase();
            if (!allowed.includes(upperKey)) continue;

            const idx = lines.findIndex(l => l.startsWith(`${upperKey}=`));
            const newLine = `${upperKey}=${value}`;

            if (idx !== -1) lines[idx] = newLine;
            else lines.push(newLine);

            // Apply in-process too (won't survive restart but helps immediately)
            process.env[upperKey] = String(value);
        }

        fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
        logger.info(`Settings updated: ${Object.keys(updates).join(", ")}`);
        res.json({ success: true, message: "Settings saved. Restart the server to apply all changes." });
    } catch (err) { next(err); }
});

// ── GET /api/bats — list all .bat scripts ────────────────────
router.get("/bats", (req, res, next) => {
    try {
        const batsRoot = path.resolve(__dirname, "../../bats");
        const results = [];

        function walk(dir, rel = "") {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.join(rel, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath, relPath);
                } else if (entry.name.endsWith(".bat")) {
                    let content = "";
                    try { content = fs.readFileSync(fullPath, "utf-8"); } catch { }
                    results.push({ path: relPath.replace(/\\/g, "/"), content });
                }
            }
        }

        walk(batsRoot);
        res.json({ bats: results });
    } catch (err) { next(err); }
});

// ── PUT /api/bats — create or update a .bat file ─────────────
router.put("/bats", (req, res, next) => {
    try {
        const { filePath, content } = req.body;

        if (!filePath || !content) {
            return res.status(400).json({ error: "filePath and content required" });
        }

        // Security: only allow .bat files inside the bats/ folder
        const batsRoot = path.resolve(__dirname, "../../bats");
        const resolved = path.resolve(batsRoot, filePath);

        if (!resolved.startsWith(batsRoot) || !resolved.endsWith(".bat")) {
            return res.status(403).json({ error: "Invalid path" });
        }

        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, "utf-8");

        logger.info(`BAT file created/updated: ${filePath}`);
        res.json({ success: true, path: filePath });
    } catch (err) { next(err); }
});

// ── PUT /api/whitelist — update bat_whitelist.json entry ─────
router.put("/whitelist", (req, res, next) => {
    try {
        const whitelistPath = path.resolve(__dirname, "../config/bat_whitelist.json");
        const { key, entry } = req.body; // { key: "my_script", entry: { path, label, category, description, timeout } }

        if (!key || !entry || !entry.path || !entry.label) {
            return res.status(400).json({ error: "key, entry.path and entry.label required" });
        }

        let whitelist = { scripts: {} };
        try { whitelist = JSON.parse(fs.readFileSync(whitelistPath, "utf-8")); } catch { }

        whitelist.scripts[key] = {
            path: entry.path,
            label: entry.label,
            category: entry.category || "custom",
            description: entry.description || "",
            timeout: entry.timeout || 10000
        };

        fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 4), "utf-8");

        // Reload BatBot whitelist
        try {
            const botManager = require("../bots/BotManager");
            if (botManager.bots?.BatBot) botManager.bots.BatBot.reloadWhitelist();
        } catch { }

        logger.info(`Whitelist updated: ${key}`);
        res.json({ success: true, key });
    } catch (err) { next(err); }
});

module.exports = router;