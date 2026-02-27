/**
 * InstructionLoader.js — v4 FIXED
 *
 * FIXES:
 *  - MAX_SECTION_CHARS increased from 300 → 800 (AI was only reading first 300 chars of each .md)
 *  - MAX_MEMORY_CHARS increased from 400 → 600
 *  - identity and soul sections are now fully included in context (up to 800 chars each)
 *  - memory auto-trim preserved
 */

const fs = require("fs");
const path = require("path");
const logger = require("../logs/logger");

const CONTEXT_ORDER = ["identity", "soul", "user", "tools", "bots", "memory"];
const MAX_MEMORY_SIZE = 5000;     // bytes — auto-trim if bigger
const MAX_SECTION_CHARS = 800;    // ← was 300, now 800 so AI reads the full .md instructions
const MAX_MEMORY_CHARS = 600;     // ← was 400

class InstructionLoader {
    constructor() {
        this.mdPath = path.resolve(__dirname, "../../md");
        this.cache = {};
        this._loadAll();
        this._autoTrimMemory();
    }

    _loadAll() {
        if (!fs.existsSync(this.mdPath)) {
            logger.warn(`md/ not found at ${this.mdPath} — creating with defaults`);
            this._createDefaults();
        }

        const files = fs.readdirSync(this.mdPath).filter(f => f.endsWith(".md"));
        files.forEach(file => {
            const key = file.replace(".md", "");
            try {
                this.cache[key] = fs.readFileSync(path.join(this.mdPath, file), "utf-8");
            } catch (err) {
                logger.warn(`Could not read ${file}: ${err.message}`);
            }
        });

        logger.info(`InstructionLoader: loaded ${files.length} md files from ${this.mdPath}`);
    }

    _autoTrimMemory() {
        const memPath = path.join(this.mdPath, "memory.md");
        try {
            if (!fs.existsSync(memPath)) return;
            const stat = fs.statSync(memPath);
            if (stat.size > MAX_MEMORY_SIZE) {
                const content = fs.readFileSync(memPath, "utf-8");
                const trimmed = "# Memory\n\n" + content.slice(-MAX_MEMORY_SIZE);
                fs.writeFileSync(memPath, trimmed, "utf-8");
                this.cache["memory"] = trimmed;
                logger.info(`InstructionLoader: memory.md trimmed from ${stat.size}B to ~${MAX_MEMORY_SIZE}B`);
            }
        } catch (err) {
            logger.warn(`Memory auto-trim failed: ${err.message}`);
        }
    }

    _createDefaults() {
        fs.mkdirSync(this.mdPath, { recursive: true });
        const defaults = {
            "identity.md": "# Identity\nEres Jarvis, un asistente IA modular local de Tobías.\n",
            "soul.md": "# Soul\n## Personalidad\n- Idioma: Español (Argentina)\n- Tono: Profesional y amigable\n- Responde SIEMPRE en español\n",
            "user.md": "# Usuario\n- Nombre: Tobías\n- Idioma: Español (Argentina)\n",
            "tools.md": "# Tools\n## Disponibles\n- Web Search, File System, LM Studio API, .bat scripts, ADB\n",
            "bots.md": "# Bots\nWebBot, DoctorBot, BatBot, MediaBot, NetBot, WhatsAppBot\n",
            "memory.md": "# Memory\n\n"
        };
        Object.entries(defaults).forEach(([file, content]) => {
            const fp = path.join(this.mdPath, file);
            if (!fs.existsSync(fp)) fs.writeFileSync(fp, content, "utf-8");
        });
        logger.info(`md/ folder created at ${this.mdPath}`);
    }

    get(key) {
        return this.cache[key] || "";
    }

    buildFullContext(userMessage) {
        const parts = [];

        // Add each section — now with larger limit so AI reads full instructions
        CONTEXT_ORDER.forEach(key => {
            if (key === "memory") return; // memory handled separately below
            const content = this.get(key).trim();
            if (content) {
                const trimmed = content.length > MAX_SECTION_CHARS
                    ? content.substring(0, MAX_SECTION_CHARS) + "..."
                    : content;
                parts.push(`[${key.toUpperCase()}]\n${trimmed}`);
            }
        });

        // Memory — only last N chars to avoid overflow
        const mem = this.get("memory");
        if (mem.trim()) {
            parts.push(`[MEMORIA RECIENTE]\n${mem.slice(-MAX_MEMORY_CHARS)}`);
        }

        // User message
        parts.push(`[MENSAJE DEL USUARIO]\n${userMessage}`);

        // Compact instruction
        parts.push(`[INSTRUCCIÓN]\nAnaliza el MENSAJE DEL USUARIO y responde SOLO con JSON válido:\n{"intent":"nombre","parameters":{},"priority":"normal"}\n\nEjemplos:\n- "poneme youtube" → {"intent":"bat_exec","parameters":{"script":"media_youtube","query":""},"priority":"normal"}\n- "subi el volumen" → {"intent":"bat_exec","parameters":{"script":"volume_up"},"priority":"normal"}\n- "hola" → {"intent":"chat_response","parameters":{"query":"hola"},"priority":"normal"}`);

        return parts.join("\n\n");
    }

    appendToMemory(entry) {
        const memoryPath = path.join(this.mdPath, "memory.md");
        const block = `\n\n## ${new Date().toISOString()}\n${entry}\n`;
        try {
            fs.appendFileSync(memoryPath, block, "utf-8");
            this.cache["memory"] = (this.cache["memory"] || "") + block;
            this._autoTrimMemory();
        } catch (err) {
            logger.warn(`Memory write failed: ${err.message}`);
        }
    }

    reload() {
        this.cache = {};
        this._loadAll();
        this._autoTrimMemory();
    }
}

module.exports = new InstructionLoader();