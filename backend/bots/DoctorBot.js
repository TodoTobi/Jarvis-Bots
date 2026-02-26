/**
 * DoctorBot.js — Error diagnostics, logging and auto-recovery
 *
 * Responsibilities:
 *  - Diagnose errors from other bots
 *  - Log error patterns to memory
 *  - Suggest or apply known fixes automatically
 *  - Report to chat panel
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");
const path = require("path");
const fs = require("fs");

// Known error patterns and their auto-fix strategies
const ERROR_PATTERNS = [
    {
        pattern: /ENOENT|file not found/i,
        label: "Archivo no encontrado",
        suggestion: "Verificá que el archivo .bat exista en la ruta configurada",
        autoFix: null
    },
    {
        pattern: /ECONNREFUSED|ECONNRESET|connection refused/i,
        label: "Conexión rechazada",
        suggestion: "El servicio de destino no está corriendo o la IP es incorrecta",
        autoFix: null
    },
    {
        pattern: /not authorized|unauthorized/i,
        label: "Dispositivo ADB no autorizado",
        suggestion: "Corré 'adb devices' y aceptá la solicitud de depuración en el dispositivo",
        autoFix: null
    },
    {
        pattern: /whitelist|not in the whitelist/i,
        label: "Script no en la whitelist",
        suggestion: "El modelo intentó ejecutar un script no autorizado. Revisá bat_whitelist.json",
        autoFix: null
    },
    {
        pattern: /timeout/i,
        label: "Timeout de ejecución",
        suggestion: "El script tardó demasiado. Revisá la conexión o aumentá el timeout en la whitelist",
        autoFix: null
    },
    {
        pattern: /model communication failure|empty response/i,
        label: "Falla de comunicación con el modelo",
        suggestion: "LM Studio no responde. Verificá que esté corriendo en la IP/puerto configurados",
        autoFix: null
    }
];

class DoctorBot extends Bot {
    constructor() {
        super("DoctorBot", "Diagnóstico y recuperación de errores del sistema");

        this.memoryPath = path.resolve(__dirname, "../../../md/memory.md");
        this.errorHistory = [];
        this.maxHistory = 50;
    }

    /* =========================
       MAIN EXECUTION
    ========================= */

    async run(parameters) {
        if (!parameters || typeof parameters !== "object") {
            throw new Error("DoctorBot requires parameters object");
        }

        const { failedBot, error, action } = parameters;

        if (action === "status") {
            return this._systemStatusReport();
        }

        if (action === "history") {
            return this._errorHistoryReport();
        }

        return this._diagnose(failedBot, error);
    }

    /* =========================
       DIAGNOSIS
    ========================= */

    async _diagnose(botName, errorMessage) {
        logger.info(`DoctorBot diagnosing: ${botName || "unknown"} → ${errorMessage || "no error info"}`);

        // Match against known patterns
        const matched = ERROR_PATTERNS.find(p => p.pattern.test(errorMessage || ""));

        const diagnosis = {
            timestamp: new Date().toISOString(),
            bot: botName || "unknown",
            error: errorMessage || "unknown error",
            label: matched?.label || "Error desconocido",
            suggestion: matched?.suggestion || "Revisá los logs en backend/logs/error.log",
            autoFixed: false
        };

        // Attempt auto-fix if available
        if (matched?.autoFix) {
            try {
                await matched.autoFix(botName);
                diagnosis.autoFixed = true;
                logger.info(`DoctorBot: auto-fix applied for ${botName}`);
            } catch (e) {
                logger.warn(`DoctorBot: auto-fix failed — ${e.message}`);
            }
        }

        // Store in history
        this.errorHistory.unshift(diagnosis);
        if (this.errorHistory.length > this.maxHistory) {
            this.errorHistory.pop();
        }

        // Write to memory.md
        this._persistDiagnosis(diagnosis);

        const report = [
            `🩺 **DoctorBot — Diagnóstico**`,
            ``,
            `⚠ Bot: \`${diagnosis.bot}\``,
            `❌ Error: ${diagnosis.error}`,
            `📋 Tipo: ${diagnosis.label}`,
            `💡 Sugerencia: ${diagnosis.suggestion}`,
            diagnosis.autoFixed ? `✅ Auto-fix aplicado` : `🔧 Requiere intervención manual`
        ].join("\n");

        logger.info(`DoctorBot diagnosis complete for ${botName}`);

        return report;
    }

    /* =========================
       REPORTS
    ========================= */

    _systemStatusReport() {
        const recent = this.errorHistory.slice(0, 5);
        if (recent.length === 0) {
            return "✅ DoctorBot: No se registraron errores recientes. Sistema saludable.";
        }

        const lines = [
            `🩺 **Reporte de sistema — últimos ${recent.length} errores:**`,
            ""
        ];

        recent.forEach((entry, i) => {
            lines.push(`${i + 1}. [${entry.timestamp}] ${entry.bot}: ${entry.label}`);
        });

        return lines.join("\n");
    }

    _errorHistoryReport() {
        if (this.errorHistory.length === 0) {
            return "📋 Sin historial de errores registrado.";
        }
        return JSON.stringify(this.errorHistory, null, 2);
    }

    /* =========================
       MEMORY PERSISTENCE
    ========================= */

    _persistDiagnosis(diagnosis) {
        try {
            const entry = [
                `\n## ERROR [${diagnosis.timestamp}]`,
                `**Bot:** ${diagnosis.bot}`,
                `**Error:** ${diagnosis.error}`,
                `**Diagnóstico:** ${diagnosis.label}`,
                `**Sugerencia:** ${diagnosis.suggestion}`,
                `**Auto-fix:** ${diagnosis.autoFixed ? "Sí" : "No"}`,
                ""
            ].join("\n");

            fs.appendFileSync(this.memoryPath, entry, "utf-8");
        } catch (err) {
            logger.warn(`DoctorBot: could not write to memory.md — ${err.message}`);
        }
    }
}

module.exports = DoctorBot;