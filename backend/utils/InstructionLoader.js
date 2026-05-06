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

// Load SkillLoader with fallback paths
let skillLoader;
try {
    skillLoader = require("./SkillLoader");
} catch {
    try {
        skillLoader = require("../skills/SkillLoader");
    } catch {
        skillLoader = null;
    }
}

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

   // En InstructionLoader.js — reemplazá SOLO este método:

// Reemplazá buildFullContext completo:
buildFullContext(userMessage) {
    const parts = [];

    CONTEXT_ORDER.forEach(key => {
        if (key === "memory") return;
        const content = this.get(key).trim();
        if (content) {
            const trimmed = content.length > MAX_SECTION_CHARS
                ? content.substring(0, MAX_SECTION_CHARS) + "..."
                : content;
            parts.push(`[${key.toUpperCase()}]\n${trimmed}`);
        }
    });

    const mem = this.get("memory");
    if (mem.trim()) {
        parts.push(`[MEMORIA RECIENTE]\n${mem.slice(-MAX_MEMORY_CHARS)}`);
    }

    // ── Skills reales ────────────────────────────────────────────────────────
    if (skillLoader) {
        parts.push(`[CAPACIDADES REALES]\n${skillLoader.getCapabilitiesPrompt()}`);
    }

    parts.push(`[MENSAJE DEL USUARIO]\n${userMessage}`);

    parts.push(`[INSTRUCCIÓN OBLIGATORIA]
Respondé SOLO con JSON válido. Sin texto antes ni después. Sin markdown.

SCHEMA:
{
  "type": "action" | "response" | "artifact",
  "intent": string,
  "target": string | null,
  "content": string,
  "format": "text" | "html" | "mermaid" | "svg" | "code",
  "artifact_type": string | null
}

REGLAS ABSOLUTAS:
1. NUNCA respondas con texto libre. SIEMPRE JSON.
2. Si el usuario pide abrir/ejecutar/controlar → type="action"
3. Si pide diagrama/UI/código visual → type="artifact"
4. Conversación/explicación/búsqueda → type="response"
5. NUNCA digas "no puedo". Estimá la mejor acción.
6. "content": texto para el usuario (en español), NO el código del artifact.
7. Para artifacts: "artifact_type" contiene el código/contenido generado.

EJEMPLOS:
"abrí brave" → {"type":"action","intent":"open_app","target":"brave","content":"Abriendo Brave...","format":"text","artifact_type":null}
"haceme un diagrama del login" → {"type":"artifact","intent":"generate_diagram","target":null,"content":"Diagrama del flujo de login:","format":"mermaid","artifact_type":"flowchart TD\n  A[Usuario] --> B[Login]\n  B --> C{¿Válido?}\n  C -->|Sí| D[Dashboard]\n  C -->|No| E[Error]"}
"subí el volumen" → {"type":"action","intent":"volume_up","target":"system","content":"Subiendo el volumen.","format":"text","artifact_type":null}
"explicá qué es JWT" → {"type":"response","intent":"explain","target":null,"content":"JWT (JSON Web Token) es un estándar para transmitir información...","format":"text","artifact_type":null}`);

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