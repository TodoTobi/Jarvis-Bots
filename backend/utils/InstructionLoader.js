/**
 * InstructionLoader.js — Loads and manages .md instruction files
 *
 * Reads all markdown files from the /md folder at startup.
 * Provides a buildFullContext() method that assembles the full
 * system prompt sent to the model for intent detection.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../logs/logger");

// Files loaded in this order for context building
const CONTEXT_ORDER = [
    "identity",
    "soul",
    "user",
    "tools",
    "bots",
    "heartbeat",
    "bootstrap",
    "memory"
];

class InstructionLoader {
    constructor() {
        this.mdPath = path.resolve(__dirname, "../../../md");
        this.cache = {};
        this._loadAll();
    }

    /* =========================
       LOAD ALL .md FILES
    ========================= */

    _loadAll() {
        if (!fs.existsSync(this.mdPath)) {
            throw new Error(`md/ folder not found at: ${this.mdPath}`);
        }

        const files = fs.readdirSync(this.mdPath).filter(f => f.endsWith(".md"));

        files.forEach(file => {
            const key = file.replace(".md", "");
            try {
                this.cache[key] = fs.readFileSync(path.join(this.mdPath, file), "utf-8");
            } catch (err) {
                logger.warn(`InstructionLoader: could not read ${file} — ${err.message}`);
            }
        });

        logger.info(`InstructionLoader: loaded ${files.length} files (${files.join(", ")})`);
    }

    /* =========================
       GET SINGLE FILE
    ========================= */

    get(key) {
        return this.cache[key] || "";
    }

    /* =========================
       BUILD CONTEXT FOR MODEL
    ========================= */

    buildFullContext(userMessage) {
        const sections = [];

        CONTEXT_ORDER.forEach(key => {
            const content = this.get(key);
            if (content.trim()) {
                sections.push(`# ${key.toUpperCase()}\n${content.trim()}`);
            }
        });

        // Keep memory short (last 500 chars to avoid token overflow)
        const memoryKey = sections.findIndex(s => s.startsWith("# MEMORY"));
        if (memoryKey !== -1) {
            const memContent = this.get("memory");
            const shortMem = memContent.slice(-500);
            sections[memoryKey] = `# MEMORY (recent)\n${shortMem}`;
        }

        sections.push(`# USER_INPUT\n${userMessage}`);

        sections.push(`
# INSTRUCTION
Analiza el USER_INPUT y responde SOLO con JSON válido:
{
  "intent": "intent_name",
  "parameters": { "key": "value" },
  "priority": "normal",
  "notes": "opcional"
}

Ejemplos de intents:
- "poneme música de youtube" → {"intent":"media_play_youtube","parameters":{"query":"música"},"priority":"normal"}
- "subí el volumen" → {"intent":"bat_volume_up","parameters":{"script":"volume_up"},"priority":"normal"}
- "abrí youtube en la tele" → {"intent":"net_tv_youtube","parameters":{"action":"adb_youtube","device":"tv_living","query":""},"priority":"normal"}
- "bloqueá la pantalla" → {"intent":"bat_system_lock","parameters":{"script":"system_lock"},"priority":"normal"}
- "hola cómo estás" → {"intent":"chat_response","parameters":{"query":"hola cómo estás"},"priority":"normal"}
`);

        return sections.join("\n\n---\n\n");
    }

    /* =========================
       MEMORY APPEND
    ========================= */

    appendToMemory(entry) {
        const memoryPath = path.join(this.mdPath, "memory.md");
        const timestamp = new Date().toISOString();
        const block = `\n\n## ${timestamp}\n${entry}\n`;

        try {
            fs.appendFileSync(memoryPath, block, "utf-8");
            this.cache["memory"] = (this.cache["memory"] || "") + block;
        } catch (err) {
            logger.warn(`InstructionLoader: memory write failed — ${err.message}`);
        }
    }

    /* =========================
       HOT RELOAD
    ========================= */

    reload() {
        this.cache = {};
        this._loadAll();
        logger.info("InstructionLoader: files reloaded");
    }
}

module.exports = new InstructionLoader();