/**
 * DoctorBot.js — Error diagnostics, logging and auto-recovery
 *
 * CHANGES:
 *  - Added ADB_NOT_FOUND error pattern with detailed fix instructions
 *  - Added SUPABASE_NOT_INSTALLED pattern
 *  - Improved report formatting
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");
const path = require("path");
const fs = require("fs");

const ERROR_PATTERNS = [
    {
        pattern: /ENOENT|file not found/i,
        label: "Archivo no encontrado",
        suggestion: "Verificá que el archivo .bat exista en la ruta configurada (bats/)"
    },
    {
        pattern: /ECONNREFUSED|ECONNRESET|connection refused/i,
        label: "Conexión rechazada",
        suggestion: "El servicio de destino no está corriendo o la IP/puerto es incorrecta"
    },
    {
        pattern: /not authorized|unauthorized/i,
        label: "Dispositivo ADB no autorizado",
        suggestion: "Corré 'adb devices' y aceptá la solicitud de depuración en el dispositivo Android"
    },
    {
        pattern: /whitelist|not in the whitelist/i,
        label: "Script no en la whitelist",
        suggestion: "El modelo intentó ejecutar un script no autorizado. Revisá bat_whitelist.json o agregá el script faltante"
    },
    {
        pattern: /timeout/i,
        label: "Timeout de ejecución",
        suggestion: "El script tardó demasiado. Revisá la conexión o aumentá el timeout en bat_whitelist.json"
    },
    {
        pattern: /model communication failure|empty response/i,
        label: "Falla de comunicación con el modelo",
        suggestion: "LM Studio no responde. Verificá que esté corriendo en la IP/puerto configurados en .env (LM_API_URL)"
    },
    {
        // Windows: "adb" no se reconoce / Unix: adb: command not found
        pattern: /no se reconoce|not recognized|command not found|is not recognized/i,
        label: "ADB no encontrado en el sistema",
        suggestion:
            "ADB (Android Debug Bridge) no está instalado o no está en el PATH.\n" +
            "     Pasos para solucionar:\n" +
            "       1. Descargá Android Platform Tools:\n" +
            "          https://developer.android.com/studio/releases/platform-tools\n" +
            "       2. Descomprimí en C:\\platform-tools\\\n" +
            "       3. Agregá en backend/config/.env:\n" +
            "          ADB_PATH=C:\\platform-tools\\adb.exe\n" +
            "       4. Reiniciá el servidor"
    },
    {
        pattern: /@supabase\/supabase-js|supabase.*not installed/i,
        label: "Paquete Supabase no instalado",
        suggestion:
            "Ejecutá en la terminal del backend:\n" +
            "       npm install @supabase/supabase-js\n" +
            "     Luego reiniciá el servidor"
    },
    {
        pattern: /MODULE_NOT_FOUND/i,
        label: "Módulo Node.js faltante",
        suggestion: "Ejecutá 'npm install' en la carpeta backend/ para instalar todas las dependencias"
    }
];

class DoctorBot extends Bot {
    constructor() {
        super("DoctorBot", "Diagnóstico y recuperación de errores del sistema");

        this.memoryPath = path.resolve(__dirname, "../../md/memory.md");
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

        if (action === "status") return this._systemStatusReport();
        if (action === "history") return this._errorHistoryReport();

        return this._diagnose(failedBot, error);
    }

    /* =========================
       DIAGNOSIS
    ========================= */

    async _diagnose(botName, errorMessage) {
        logger.info(`DoctorBot diagnosing: ${botName || "unknown"} → ${errorMessage || "no error info"}`);

        const matched = ERROR_PATTERNS.find(p => p.pattern.test(errorMessage || ""));

        const diagnosis = {
            timestamp: new Date().toISOString(),
            bot: botName || "unknown",
            error: errorMessage || "unknown error",
            label: matched?.label || "Error desconocido",
            suggestion: matched?.suggestion || "Revisá los logs en backend/logs/error.log",
            autoFixed: false
        };

        if (matched?.autoFix) {
            try {
                await matched.autoFix(botName);
                diagnosis.autoFixed = true;
                logger.info(`DoctorBot: auto-fix applied for ${botName}`);
            } catch (e) {
                logger.warn(`DoctorBot: auto-fix failed — ${e.message}`);
            }
        }

        this.errorHistory.unshift(diagnosis);
        if (this.errorHistory.length > this.maxHistory) this.errorHistory.pop();

        this._persistDiagnosis(diagnosis);

        const report = [
            `🩺 **DoctorBot — Diagnóstico**`,
            ``,
            `⚠ Bot: \`${diagnosis.bot}\``,
            `❌ Error: ${diagnosis.error.split("\n")[0]}`,  // first line only
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

        const lines = [`🩺 **Reporte de sistema — últimos ${recent.length} errores:**`, ""];
        recent.forEach((entry, i) => {
            lines.push(`${i + 1}. [${entry.timestamp}] ${entry.bot}: ${entry.label}`);
        });
        return lines.join("\n");
    }

    _errorHistoryReport() {
        if (this.errorHistory.length === 0) return "📋 Sin historial de errores registrado.";
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
                `**Error:** ${diagnosis.error.split("\n")[0]}`,
                `**Diagnóstico:** ${diagnosis.label}`,
                `**Sugerencia:** ${diagnosis.suggestion.split("\n")[0]}`,
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