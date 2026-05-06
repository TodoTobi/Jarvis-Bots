/**
 * SkillLoader.js — Sistema de skills tipo tool calling
 * Cada skill define: nombre, descripción, inputs, output, bot asociado
 */
"use strict";

const fs = require("fs");
const path = require("path");

let logger;
try { logger = require("../logs/logger"); }
catch { logger = { info: console.log, warn: console.warn }; }

class SkillLoader {
    constructor() {
        this.skills = {};
        this.skillsDir = path.resolve(__dirname, "../../skills");
        this._loadBuiltIn();
        this._loadFromDir();
    }

    _loadBuiltIn() {
        // Skills base hardcodeadas — siempre disponibles
        const builtIn = [
            {
                name: "open_app",
                description: "Abre una aplicación instalada en la PC",
                examples: ["abrir brave", "abrí chrome", "lanzar discord"],
                inputs: ["app_name"],
                output: { intent: "bat_exec", script: "app_{target}" },
                bot: "BatBot",
                patterns: [/abr[ií][r]?\s+(\w+)/i, /lanzar?\s+(\w+)/i, /open\s+(\w+)/i],
            },
            {
                name: "search_web",
                description: "Busca información en internet",
                examples: ["buscá noticias de hoy", "googleá el clima"],
                inputs: ["query"],
                output: { intent: "search_web" },
                bot: "SearchBot",
                patterns: [/buscá?\s+(.+)/i, /googl[eé][aá]?\s+(.+)/i],
            },
            {
                name: "play_media",
                description: "Reproduce música, videos o abre reproductores",
                examples: ["pon spotify", "youtube lo-fi music"],
                inputs: ["media_type", "query?"],
                output: { intent: "bat_exec" },
                bot: "MediaBot",
                patterns: [/(?:pon[eé]|reproducí)\s+(.+)/i],
            },
            {
                name: "system_control",
                description: "Controla el sistema: volumen, pantalla, capturas",
                examples: ["subí el volumen", "tomá una captura", "bloqueá la pantalla"],
                inputs: ["action"],
                output: { intent: "bat_exec" },
                bot: "BatBot",
                patterns: [],
            },
            {
                name: "file_operation",
                description: "Opera sobre archivos: buscar, mover, abrir",
                examples: ["buscá el pdf de la factura", "pasá el video al drive"],
                inputs: ["operation", "filename", "destination?"],
                output: { intent: "file_search" },
                bot: "DriveBot",
                patterns: [],
            },
            {
                name: "generate_artifact",
                description: "Genera diagramas, HTML, SVG o código visual",
                examples: ["haceme un diagrama de flujo", "creá una interfaz de login"],
                inputs: ["type", "description"],
                output: { intent: "canvas_generate" },
                bot: "WebBot",
                patterns: [/(?:hacé|cre[aá]|genera[r]?)\s+(?:un[ao]?\s+)?(?:diagrama|interfaz|ui|gráfico|svg|html)\s+(.+)/i],
            },
            {
                name: "run_command",
                description: "Ejecuta un comando en la terminal",
                examples: ["ejecutá 'git status'", "corré el script de backup"],
                inputs: ["command", "workdir?"],
                output: { intent: "terminal_exec" },
                bot: "TerminalBot",
                patterns: [/ejecut[aá][r]?\s+["'](.+?)["']/i, /corr[eé][r]?\s+(.+)/i],
            },
        ];

        builtIn.forEach(skill => {
            this.skills[skill.name] = skill;
        });
        logger.info(`SkillLoader: ${builtIn.length} skills built-in cargadas`);
    }

    _loadFromDir() {
        if (!fs.existsSync(this.skillsDir)) {
            fs.mkdirSync(this.skillsDir, { recursive: true });
            return;
        }
        const files = fs.readdirSync(this.skillsDir)
            .filter(f => f.endsWith(".json"));

        files.forEach(file => {
            try {
                const skill = JSON.parse(fs.readFileSync(path.join(this.skillsDir, file), "utf-8"));
                if (skill.name) {
                    skill.patterns = (skill.patterns || []).map(p => new RegExp(p, "i"));
                    this.skills[skill.name] = skill;
                }
            } catch (e) {
                logger.warn(`SkillLoader: error cargando ${file}: ${e.message}`);
            }
        });

        if (files.length > 0) {
            logger.info(`SkillLoader: ${files.length} skills custom cargadas`);
        }
    }

    /**
     * Detectar skill por mensaje del usuario
     */
    detectSkill(message) {
        const lower = message.toLowerCase();
        for (const [name, skill] of Object.entries(this.skills)) {
            for (const pattern of (skill.patterns || [])) {
                const match = lower.match(pattern);
                if (match) {
                    return { skill, match, extracted: match[1]?.trim() || null };
                }
            }
        }
        return null;
    }

    /**
     * Obtener lista de skills para self-awareness
     */
    getSkillsSummary() {
        return Object.values(this.skills).map(s => ({
            name: s.name,
            description: s.description,
            examples: s.examples?.slice(0, 2) || [],
            bot: s.bot,
        }));
    }

    /**
     * Generar texto de capacidades para el sistema prompt
     */
    getCapabilitiesPrompt() {
        const lines = ["SKILLS DISPONIBLES:"];
        Object.values(this.skills).forEach(s => {
            lines.push(`• ${s.name}: ${s.description}`);
            if (s.examples?.length) {
                lines.push(`  Ejemplos: "${s.examples[0]}"`);
            }
        });
        return lines.join("\n");
    }

    reload() {
        this.skills = {};
        this._loadBuiltIn();
        this._loadFromDir();
    }
}

module.exports = new SkillLoader();