/**
 * BotManager.js — Central bot orchestrator
 *
 * Manages all bots, routes intents to the correct bot,
 * handles errors via DoctorBot, and exposes state for the UI.
 */

const WebBot = require("./WebBot");
const DoctorBot = require("./DoctorBot");
const BatBot = require("./BatBot");
const MediaBot = require("./MediaBot");
const NetBot = require("./NetBot");
const WhatsAppBot = require("./WhatsAppBot");
const logger = require("../logs/logger");

/* =========================
   INTENT → BOT ROUTING
   Order matters: more specific prefixes first
========================= */
const INTENT_MAP = {
    // BatBot — direct .bat execution
    "bat_":         "BatBot",

    // MediaBot — media playback
    "media_":       "MediaBot",

    // NetBot — network/device control
    "net_":         "NetBot",

    // DoctorBot — diagnostics
    "diagnose_":    "DoctorBot",
    "doctor_":      "DoctorBot",
    "system_":      "DoctorBot",

    // WhatsAppBot — messaging control
    "whatsapp_":    "WhatsAppBot",

    // WebBot — conversation fallback
    "chat_":        "WebBot",
    "web_":         "WebBot",
    "search_":      "WebBot",
    "talk_":        "WebBot"
};

class BotManager {
    constructor() {
        // Instantiate all bots
        const batBot = new BatBot();
        const doctorBot = new DoctorBot();

        this.bots = {
            WebBot: new WebBot(),
            DoctorBot: doctorBot,
            BatBot: batBot,
            MediaBot: new MediaBot(batBot),   // MediaBot uses BatBot internally
            NetBot: new NetBot(),
            WhatsAppBot: null                  // initialized on demand via activate
        };

        // State map (persisted separately from bot instances for clean API)
        this.states = {};
        for (const name of Object.keys(this.bots)) {
            this.states[name] = {
                active: false,
                status: "idle",
                lastError: null,
                lastRun: null,
                runCount: 0
            };
        }

        logger.info(`BotManager initialized with ${Object.keys(this.bots).length} bots`);
    }

    /* =========================
       BOT STATE
    ========================= */

    activateBot(name) {
        this._assertExists(name);
        this.states[name].active = true;
        this.states[name].status = "idle";

        // Special: activate WhatsAppBot by starting its service
        if (name === "WhatsAppBot") {
            this._startWhatsApp().catch(err =>
                logger.error(`WhatsAppBot start error: ${err.message}`)
            );
        }

        logger.info(`Bot activated: ${name}`);
    }

    deactivateBot(name) {
        this._assertExists(name);
        this.states[name].active = false;
        this.states[name].status = "idle";

        // Stop WhatsApp service if running
        if (name === "WhatsAppBot" && this.bots.WhatsAppBot) {
            this.bots.WhatsAppBot.stop().catch(() => {});
        }

        logger.warn(`Bot deactivated: ${name}`);
    }

    isBotActive(name) {
        this._assertExists(name);
        return this.states[name].active;
    }

    getAllStates() {
        return Object.entries(this.states).map(([name, state]) => ({
            name,
            description: this.bots[name]?.description || "",
            ...state
        }));
    }

    _assertExists(name) {
        if (!(name in this.bots)) {
            throw new Error(`Bot "${name}" does not exist`);
        }
    }

    /* =========================
       WHATSAPP INIT
    ========================= */

    async _startWhatsApp() {
        const { handleChat } = require("../controllers/chatController");

        // Lazy-init WhatsAppBot with orchestrator callback
        this.bots.WhatsAppBot = new WhatsAppBot(async (message) => {
            const instructionLoader = require("../utils/InstructionLoader");
            const modelService = require("../services/ModelService");

            const context = instructionLoader.buildFullContext(message);
            const intentObject = await modelService.generateIntent(context);
            return this.executeIntent(intentObject);
        });

        await this.bots.WhatsAppBot.run({ action: "start" });
        this.states.WhatsAppBot.status = "idle";
    }

    /* =========================
       INTENT EXECUTION
    ========================= */

    async executeIntent(intentObject) {
        const normalized = this._normalizeIntent(intentObject);

        logger.info(`Intent: ${normalized.intent} | Params: ${JSON.stringify(normalized.parameters)}`);

        // Model signaled an error
        if (normalized.intent === "error") {
            logger.warn(`Model error intent: ${normalized.parameters.reason}`);
            return this._response(
                normalized.parameters.reason || "El modelo no pudo determinar una acción válida.",
                true
            );
        }

        const targetBot = this._mapIntent(normalized.intent);

        if (!targetBot) {
            logger.warn(`No bot mapped for intent: ${normalized.intent}`);

            // Fallback to WebBot for unknown intents
            if (!this.isBotActive("WebBot")) this.activateBot("WebBot");
            return this._runSafe("WebBot", normalized.parameters);
        }

        // Auto-activate bot if needed
        if (!this.isBotActive(targetBot)) {
            logger.info(`Auto-activating ${targetBot}`);
            this.activateBot(targetBot);
        }

        return this._runSafe(targetBot, normalized.parameters);
    }

    /* =========================
       SAFE EXECUTION
    ========================= */

    async _runSafe(botName, parameters) {
        const bot = this.bots[botName];

        if (!bot) {
            return this._response(`Bot "${botName}" no está disponible`, true);
        }

        try {
            this.states[botName].status = "working";
            this.states[botName].lastRun = new Date();
            this.states[botName].lastError = null;

            logger.info(`Executing: ${botName}`);

            const result = await bot.run(parameters);

            this.states[botName].status = "idle";
            this.states[botName].runCount = (this.states[botName].runCount || 0) + 1;

            logger.info(`Done: ${botName}`);

            return this._response(this._stringify(result), false);

        } catch (err) {
            this.states[botName].status = "error";
            this.states[botName].lastError = err.message;

            logger.error(`${botName} failed: ${err.message}`);

            // Trigger DoctorBot asynchronously
            this._triggerDoctor(botName, err).catch(() => {});

            return this._response(`Error en ${botName}: ${err.message}`, true);
        }
    }

    /* =========================
       DOCTOR TRIGGER
    ========================= */

    async _triggerDoctor(failedBot, error) {
        const doctor = this.bots["DoctorBot"];
        if (!doctor) return;

        try {
            this.states["DoctorBot"].active = true;
            this.states["DoctorBot"].status = "working";

            await doctor.run({ failedBot, error: error.message });

            this.states["DoctorBot"].status = "idle";
            this.states["DoctorBot"].lastRun = new Date();
        } catch (e) {
            logger.error(`DoctorBot failed: ${e.message}`);
            this.states["DoctorBot"].status = "error";
        }
    }

    /* =========================
       HELPERS
    ========================= */

    _normalizeIntent(obj) {
        if (!obj || typeof obj !== "object") {
            return { intent: "error", parameters: { reason: "Invalid intent object" } };
        }

        return {
            intent: typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : "error",
            parameters: (obj.parameters && typeof obj.parameters === "object") ? obj.parameters : {}
        };
    }

    _mapIntent(intent) {
        // Sort by prefix length descending so more specific matches win
        const sorted = Object.entries(INTENT_MAP).sort((a, b) => b[0].length - a[0].length);

        for (const [prefix, bot] of sorted) {
            if (intent.startsWith(prefix)) return bot;
        }
        return null;
    }

    _stringify(result) {
        if (typeof result === "string") return result;
        if (typeof result === "object") return JSON.stringify(result, null, 2);
        return String(result);
    }

    _response(reply, error) {
        return { reply, error };
    }
}

module.exports = new BotManager();
