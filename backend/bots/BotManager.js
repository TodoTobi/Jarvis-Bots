const WebBot = require("./WebBot");
const DoctorBot = require("./DoctorBot");
const logger = require("../logs/logger");

class BotManager {
    constructor() {
        this.bots = {
            WebBot: new WebBot(),
            DoctorBot: new DoctorBot()
        };

        this.intentMap = {
            web_: "WebBot",
            chat_: "WebBot",
            search_: "WebBot",
            diagnose_: "DoctorBot",
            doctor_: "DoctorBot"
        };

        this.states = {};

        Object.keys(this.bots).forEach(name => {
            this.states[name] = {
                active: false,
                status: "idle",
                lastError: null,
                lastRun: null
            };
        });

        logger.info("BotManager initialized");
    }

    /* =========================
       BOT STATE MANAGEMENT
    ========================= */

    activateBot(name) {
        this.ensureBotExists(name);
        this.states[name].active = true;
        this.states[name].status = "idle";
        logger.info(`Bot activated: ${name}`);
    }

    deactivateBot(name) {
        this.ensureBotExists(name);
        this.states[name].active = false;
        this.states[name].status = "idle";
        logger.warn(`Bot deactivated: ${name}`);
    }

    isBotActive(name) {
        this.ensureBotExists(name);
        return this.states[name].active;
    }

    getAllStates() {
        return Object.entries(this.states).map(([name, state]) => ({
            name,
            ...state
        }));
    }

    ensureBotExists(name) {
        if (!this.bots[name]) {
            logger.error(`Attempted access to unknown bot: ${name}`);
            throw new Error(`Bot "${name}" not found`);
        }
    }

    /* =========================
       MAIN EXECUTION
    ========================= */

    async executeIntent(intentObject) {
        const normalized = this.normalizeIntent(intentObject);

        logger.info(
            `Intent received: ${normalized.intent} | Params: ${JSON.stringify(normalized.parameters)}`
        );

        if (normalized.intent === "error") {
            logger.warn("Model returned error intent");
            return this.buildResponse(
                normalized.parameters.reason || "Model could not determine a valid action.",
                true
            );
        }

        const targetBot = this.mapIntentToBot(normalized.intent);

        if (!targetBot) {
            logger.warn(`No bot mapped for intent: ${normalized.intent}`);

            // Fallback: treat unknown intents as chat via WebBot
            if (this.states["WebBot"]) {
                if (!this.states["WebBot"].active) {
                    this.activateBot("WebBot");
                }
                return this.runBotSafe("WebBot", normalized.parameters);
            }

            return this.buildResponse(
                `No bot mapped for intent: ${normalized.intent}`,
                true
            );
        }

        // Auto-activate bot if inactive
        if (!this.isBotActive(targetBot)) {
            logger.info(`Auto-activating ${targetBot} for intent execution`);
            this.activateBot(targetBot);
        }

        return this.runBotSafe(targetBot, normalized.parameters);
    }

    async runBotSafe(targetBot, parameters) {
        try {
            this.states[targetBot].status = "working";
            this.states[targetBot].lastRun = new Date();
            this.states[targetBot].lastError = null;

            logger.info(`Executing ${targetBot}`);

            const result = await this.bots[targetBot].run(parameters);

            this.states[targetBot].status = "idle";
            logger.info(`Execution completed: ${targetBot}`);

            return this.buildResponse(
                this.normalizeBotReply(result),
                false
            );
        } catch (err) {
            this.states[targetBot].status = "error";
            this.states[targetBot].lastError = err.message;

            logger.error(`Execution failed for ${targetBot}: ${err.message}`);
            await this.handleBotError(targetBot, err);

            return this.buildResponse(
                `Error executing ${targetBot}: ${err.message}`,
                true
            );
        }
    }

    /* =========================
       INTENT NORMALIZATION
    ========================= */

    normalizeIntent(intentObject) {
        if (!intentObject || typeof intentObject !== "object") {
            return { intent: "error", parameters: {} };
        }

        return {
            intent:
                typeof intentObject.intent === "string"
                    ? intentObject.intent.trim().toLowerCase()
                    : "error",
            parameters:
                typeof intentObject.parameters === "object" &&
                    intentObject.parameters !== null
                    ? intentObject.parameters
                    : {}
        };
    }

    /* =========================
       INTENT → BOT MAPPING
    ========================= */

    mapIntentToBot(intent) {
        for (const prefix in this.intentMap) {
            if (intent.startsWith(prefix)) {
                return this.intentMap[prefix];
            }
        }
        return null;
    }

    /* =========================
       REPLY NORMALIZATION
    ========================= */

    normalizeBotReply(result) {
        if (typeof result === "string") return result;
        if (typeof result === "object") return JSON.stringify(result, null, 2);
        return String(result);
    }

    buildResponse(reply, error) {
        return { reply, error };
    }

    /* =========================
       ERROR HANDLING
    ========================= */

    async handleBotError(botName, error) {
        if (!this.bots["DoctorBot"]) return;

        try {
            logger.info(`Triggering DoctorBot for ${botName}`);
            this.states["DoctorBot"].active = true;

            await this.bots["DoctorBot"].run({
                failedBot: botName,
                error: error.message
            });
        } catch (e) {
            logger.error(
                `DoctorBot failed while handling ${botName}: ${e.message}`
            );
        }
    }
}

module.exports = new BotManager();