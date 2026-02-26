/**
 * BatBot.js — Executes pre-approved .bat scripts on the local PC
 *
 * Security model:
 *  - Only scripts listed in config/bat_whitelist.json can be executed
 *  - Parameters are sanitized before being passed to scripts
 *  - No arbitrary command injection allowed
 */

const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const Bot = require("./Bot");
const logger = require("../logs/logger");

class BatBot extends Bot {
    constructor() {
        super("BatBot", "Ejecutor de scripts .bat en la PC local");

        this.batsDir = path.resolve(__dirname, "../../bats");
        this.whitelistPath = path.resolve(__dirname, "../config/bat_whitelist.json");
        this.whitelist = this._loadWhitelist();
    }

    /* =========================
       WHITELIST
    ========================= */

    _loadWhitelist() {
        try {
            const raw = fs.readFileSync(this.whitelistPath, "utf-8");
            const parsed = JSON.parse(raw);
            logger.info(`BatBot: whitelist loaded (${Object.keys(parsed.scripts).length} scripts)`);
            return parsed.scripts;
        } catch (err) {
            logger.error(`BatBot: failed to load whitelist — ${err.message}`);
            return {};
        }
    }

    reloadWhitelist() {
        this.whitelist = this._loadWhitelist();
        logger.info("BatBot: whitelist reloaded");
    }

    /* =========================
       MAIN EXECUTION
    ========================= */

    async run(parameters) {
        const scriptKey = this.requireParam(parameters, "script");
        const args = this.getParam(parameters, "args", []);

        // Security check — only whitelisted scripts
        const entry = this.whitelist[scriptKey];
        if (!entry) {
            throw new Error(`Script "${scriptKey}" is not in the whitelist`);
        }

        const scriptPath = path.join(this.batsDir, entry.path);

        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script file not found: ${entry.path}`);
        }

        // Sanitize arguments — only allow safe characters
        const safeArgs = args
            .map(arg => String(arg).replace(/[;&|`$<>\\]/g, ""))
            .join(" ");

        const command = `"${scriptPath}" ${safeArgs}`.trim();

        logger.info(`BatBot executing: ${scriptKey} → ${entry.path} ${safeArgs ? "| args: " + safeArgs : ""}`);

        return new Promise((resolve, reject) => {
            exec(command, { shell: true, timeout: entry.timeout || 15000 }, (error, stdout, stderr) => {
                if (error) {
                    const msg = stderr?.trim() || error.message;
                    logger.error(`BatBot error (${scriptKey}): ${msg}`);
                    reject(new Error(msg));
                    return;
                }

                const output = stdout?.trim() || `✅ ${entry.label} ejecutado correctamente`;
                logger.info(`BatBot success (${scriptKey}): ${output.substring(0, 100)}`);
                resolve(output);
            });
        });
    }

    /* =========================
       LIST AVAILABLE SCRIPTS
    ========================= */

    getAvailableScripts() {
        return Object.entries(this.whitelist).map(([key, val]) => ({
            key,
            label: val.label,
            category: val.category,
            description: val.description
        }));
    }
}

module.exports = BatBot;