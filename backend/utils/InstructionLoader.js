/**
 * InstructionLoader.js — Loads and manages .md instruction files
 *
 * Structure: backend/utils/ is 2 levels from project root
 * → path.resolve(__dirname, "../../md") = project_root/md/
 */

const fs = require("fs");
const path = require("path");
const logger = require("../logs/logger");

const CONTEXT_ORDER = ["identity", "soul", "user", "tools", "bots", "heartbeat", "bootstrap", "memory"];

class InstructionLoader {
    constructor() {
        // backend/utils/__dirname → ../../ = project root → md/
        this.mdPath = path.resolve(__dirname, "../../md");
        this.cache = {};
        this._loadAll();
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

    _createDefaults() {
        fs.mkdirSync(this.mdPath, { recursive: true });
        const defaults = {
            "identity.md": "# Identity\nYou are **Jarvis**, a modular AI agent.\n",
            "soul.md": "# Soul\n## Personality\n- Tone: Professional, friendly\n- Language: Spanish (Argentina) by default\n",
            "user.md": "# User Profile\n## Basic Info\n- Name: Tobías\n- Language: Spanish (Argentina)\n",
            "tools.md": "# Tools\n## Available\n- Web Search, File System, LM Studio API, .bat scripts, ADB\n",
            "bots.md": "# Bots\nSee full bots.md for intent mapping.\n",
            "heartbeat.md": "# Heartbeat\n## Monitor\n- Check interval: 30s\n",
            "bootstrap.md": "# Bootstrap\n## Startup\n1. Load env\n2. Load md files\n3. Init bots\n",
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
        const sections = [];

        CONTEXT_ORDER.forEach(key => {
            const content = this.get(key);
            if (content.trim()) {
                sections.push(`# ${key.toUpperCase()}\n${content.trim()}`);
            }
        });

        // Trim memory to avoid token overflow
        const memIdx = sections.findIndex(s => s.startsWith("# MEMORY"));
        if (memIdx !== -1) {
            sections[memIdx] = `# MEMORY (recent)\n${this.get("memory").slice(-500)}`;
        }

        sections.push(`# USER_INPUT\n${userMessage}`);
        sections.push(`
# INSTRUCTION
Analyze USER_INPUT. Respond ONLY with valid JSON:
{
  "intent": "intent_name",
  "parameters": { "key": "value" },
  "priority": "normal",
  "notes": "optional"
}

Examples:
- "poneme musica de youtube" → {"intent":"media_play_youtube","parameters":{"query":"musica"},"priority":"normal"}
- "subi el volumen" → {"intent":"bat_volume_up","parameters":{"script":"volume_up"},"priority":"normal"}
- "abri youtube en la tele" → {"intent":"net_tv_youtube","parameters":{"action":"adb_youtube","device":"tv_living","query":""},"priority":"normal"}
- "bloquea la pantalla" → {"intent":"bat_system_lock","parameters":{"script":"system_lock"},"priority":"normal"}
- "hola como estas" → {"intent":"chat_response","parameters":{"query":"hola como estas"},"priority":"normal"}
`);

        return sections.join("\n\n---\n\n");
    }

    appendToMemory(entry) {
        const memoryPath = path.join(this.mdPath, "memory.md");
        const block = `\n\n## ${new Date().toISOString()}\n${entry}\n`;
        try {
            fs.appendFileSync(memoryPath, block, "utf-8");
            this.cache["memory"] = (this.cache["memory"] || "") + block;
        } catch (err) {
            logger.warn(`Memory write failed: ${err.message}`);
        }
    }

    reload() {
        this.cache = {};
        this._loadAll();
    }
}

module.exports = new InstructionLoader();