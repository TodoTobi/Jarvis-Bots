const fs = require("fs");
const path = require("path");

class InstructionLoader {
    constructor() {
        this.mdPath = path.resolve(__dirname, "../../md");
        this.cache = {};
        this.requiredFiles = [
            "identity",
            "soul",
            "tools",
            "bots",
            "user",
            "memory",
            "heartbeat",
            "bootstrap"
        ];

        this.loadAll();
    }

    /* =========================
       LOAD ALL MD FILES
    ========================= */

    loadAll() {
        if (!fs.existsSync(this.mdPath)) {
            throw new Error("md folder not found at project root level");
        }

        const files = fs.readdirSync(this.mdPath);

        files.forEach(file => {
            if (file.endsWith(".md")) {
                const key = file.replace(".md", "");
                const content = fs.readFileSync(
                    path.join(this.mdPath, file),
                    "utf-8"
                );

                this.cache[key] = content;
            }
        });

        console.log("MD context loaded successfully");
    }

    /* =========================
       GET SINGLE FILE
    ========================= */

    get(key) {
        return this.cache[key] || "";
    }

    /* =========================
       UPDATE MEMORY
    ========================= */

    appendToMemory(entry) {
        const memoryPath = path.join(this.mdPath, "memory.md");

        const timestamp = new Date().toISOString();
        const formattedEntry = `\n\n## ${timestamp}\n${entry}\n`;

        fs.appendFileSync(memoryPath, formattedEntry, "utf-8");

        // actualizar cache
        this.cache["memory"] = this.cache["memory"] + formattedEntry;
    }

    /* =========================
       RELOAD CONTEXT (DEV MODE)
    ========================= */

    reload() {
        this.cache = {};
        this.loadAll();
    }

    /* =========================
       BUILD FULL CONTEXT
    ========================= */

    buildFullContext(userMessage) {
        const contextSections = [];

        this.requiredFiles.forEach(file => {
            const content = this.get(file);
            if (content) {
                contextSections.push(
                    `# ${file.toUpperCase()}\n${content}`
                );
            }
        });

        contextSections.push(`
# USER_INPUT
${userMessage}

You must respond ONLY in valid JSON using this structure:
{
  "intent": "string",
  "parameters": {},
  "priority": "low | normal | high",
  "notes": "optional string"
}
`);

        return contextSections.join("\n\n");
    }
}

module.exports = new InstructionLoader();