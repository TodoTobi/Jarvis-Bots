/**
 * BotManager.js — v2.3
 *
 * FIXES vs v2.2:
 *  - WebBot: si parameters no tiene query/message/text, se inyecta desde
 *    normalized.parameters.query o desde el intent name como fallback.
 *    Esto evita "WebBot requires a text query parameter" cuando el LLM
 *    devuelve intents custom como "greetings", "default", "farewell", etc.
 *    sin incluir el mensaje original en parameters.
 */

const WebBot = require("./WebBot");
const DoctorBot = require("./DoctorBot");
const BatBot = require("./BatBot");
const MediaBot = require("./MediaBot");
const NetBot = require("./NetBot");
const WhatsAppBot = require("./WhatsAppBot");
const ComputerBot = require("./ComputerBot");
const VisionBot = require("./VisionBot");
const logger = require("../logs/logger");

// ── Intent prefix → Bot name ──────────────────────────────────────────────────
const INTENT_MAP = {
    "computer_": "ComputerBot",
    "vision_": "VisionBot",
    "bat_": "BatBot",
    "media_": "MediaBot",
    "net_music": "MediaBot",
    "net_": "NetBot",
    "diagnose_": "DoctorBot",
    "doctor_": "DoctorBot",
    "system_": "DoctorBot",
    "whatsapp_": "WhatsAppBot",
    "chat_": "WebBot",
    "web_": "WebBot",
    "search_": "WebBot",
    "talk_": "WebBot"
};

// ── net_ intent suffix → NetBot action ───────────────────────────────────────
const NET_ACTION_MAP = {
    "adb_youtube": "adb_youtube",
    "adb_volume": "adb_volume",
    "adb_screenshot": "adb_screenshot",
    "adb_home": "adb_home",
    "adb_back": "adb_back",
    "adb_wakeup": "adb_wakeup",
    "adb_open_app": "adb_open_app",
    "adb_input_text": "adb_input_text",
    "adb_connect": "adb_connect",
    "screenshot": "adb_screenshot",
    "wol": "wol",
    "ping": "ping",
};

// ── media_ intent → MediaBot intent key ──────────────────────────────────────
const MEDIA_INTENT_MAP = {
    "net_music_player": "media_play_spotify",
    "media_youtube": "media_play_youtube",
    "media_spotify": "media_play_spotify",
    "media_vlc": "media_play_vlc",
    "media_pause": "media_pause",
    "media_next": "media_next",
    "media_prev": "media_prev",
    "media_volume_up": "media_volume_up",
    "media_volume_down": "media_volume_down",
    "media_mute": "media_mute",
};

// ── BatBot script key normalization ──────────────────────────────────────────
const BAT_SCRIPT_ALIASES = {
    "volume_set": "volume_up",
    "volume_increase": "volume_up",
    "set_volume": "volume_up",
    "volume_decrease": "volume_down",
    "mute": "volume_mute",
    "toggle_mute": "volume_mute",
    "unmute": "volume_mute",
    "youtube": "media_youtube",
    "open_youtube": "media_youtube",
    "play_youtube": "media_youtube",
    "abrir_youtube": "media_youtube",
    "spotify": "media_spotify",
    "open_spotify": "media_spotify",
    "play_spotify": "media_spotify",
    "vlc": "media_vlc",
    "open_vlc": "media_vlc",
    "pause": "media_pause",
    "play_pause": "media_pause",
    "play": "media_pause",
    "next_track": "media_next",
    "next": "media_next",
    "previous": "media_prev",
    "prev_track": "media_prev",
    "prev": "media_prev",
    "discord": "app_discord",
    "open_discord": "app_discord",
    "abrir_discord": "app_discord",
    "vscode": "app_vscode",
    "code": "app_vscode",
    "open_vscode": "app_vscode",
    "open_code": "app_vscode",
    "fortnite": "app_fortnite",
    "open_fortnite": "app_fortnite",
    "browser": "app_browser",
    "open_browser": "app_browser",
    "chrome": "app_browser",
    "firefox": "app_browser",
    "screenshot": "system_screenshot",
    "captura": "system_screenshot",
    "lock": "system_lock",
    "lock_pc": "system_lock",
    "bloquear": "system_lock",
    "sleep": "system_sleep",
    "suspend": "system_sleep",
    "dormir": "system_sleep",
    "night_mode": "system_night_mode",
    "dark_mode": "system_night_mode",
    "modo_noche": "system_night_mode",
};

class BotManager {
    constructor() {
        const batBot = new BatBot();
        const doctorBot = new DoctorBot();

        this.bots = {
            WebBot: new WebBot(),
            DoctorBot: doctorBot,
            BatBot: batBot,
            MediaBot: new MediaBot(batBot),
            NetBot: new NetBot(),
            WhatsAppBot: null,
            ComputerBot: new ComputerBot(),
            VisionBot: new VisionBot()
        };

        this.states = {};
        for (const name of Object.keys(this.bots)) {
            this.states[name] = {
                active: false, status: "idle",
                lastError: null, lastRun: null, runCount: 0
            };
        }

        logger.info(`BotManager initialized with ${Object.keys(this.bots).length} bots`);
    }

    activateBot(name) {
        this._assertExists(name);
        this.states[name].active = true;
        this.states[name].status = "idle";
        if (name === "WhatsAppBot") {
            this._startWhatsApp().catch(err => logger.error(`WhatsAppBot start error: ${err.message}`));
        }
        logger.info(`Bot activated: ${name}`);
    }

    deactivateBot(name) {
        this._assertExists(name);
        this.states[name].active = false;
        this.states[name].status = "idle";
        if (name === "WhatsAppBot" && this.bots.WhatsAppBot) {
            this.bots.WhatsAppBot.stop().catch(() => { });
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
        if (!(name in this.bots)) throw new Error(`Bot "${name}" does not exist`);
    }

    async _startWhatsApp() {
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

    async executeIntent(intentObject) {
        const normalized = this._normalizeIntent(intentObject);
        logger.info(`Intent: ${normalized.intent} | Params: ${JSON.stringify(normalized.parameters)}`);

        if (normalized.intent === "error") {
            logger.warn(`Model error intent: ${normalized.parameters.reason}`);
            return this._response(
                normalized.parameters.reason || "El modelo no pudo determinar una acción válida.",
                true
            );
        }

        if (normalized.intent === "whatsapp_qr") {
            return this._handleWhatsAppQR();
        }

        const targetBot = this._mapIntent(normalized.intent);

        // ── FIX: Auto-inject "action" for NetBot ─────────────────────────────
        if (targetBot === "NetBot") {
            if (!normalized.parameters.action) {
                const suffix = normalized.intent.replace(/^net_/, "");
                const mappedAction = NET_ACTION_MAP[suffix] || suffix;
                normalized.parameters.action = mappedAction;
                logger.info(`NetBot: injected action="${mappedAction}" from intent "${normalized.intent}"`);
            }
        }

        // ── FIX: Auto-inject "intent" for MediaBot ───────────────────────────
        if (targetBot === "MediaBot") {
            if (!normalized.parameters.intent) {
                const mappedIntent = MEDIA_INTENT_MAP[normalized.intent] || normalized.intent;
                normalized.parameters.intent = mappedIntent;
                logger.info(`MediaBot: injected intent="${mappedIntent}" from "${normalized.intent}"`);
            }
        }

        // ── FIX: Auto-inject "task" for ComputerBot ──────────────────────────
        if (targetBot === "ComputerBot") {
            if (!normalized.parameters.task) {
                normalized.parameters.task =
                    normalized.parameters.query ||
                    normalized.parameters.command ||
                    normalized.parameters.description ||
                    "";
                logger.info(`ComputerBot: injected task="${normalized.parameters.task}"`);
            }
        }

        // ── FIX: Normalize BatBot script keys via aliases ─────────────────────
        if (targetBot === "BatBot" && normalized.parameters.script) {
            const raw = normalized.parameters.script;
            if (BAT_SCRIPT_ALIASES[raw]) {
                logger.info(`BatBot: aliased script "${raw}" → "${BAT_SCRIPT_ALIASES[raw]}"`);
                normalized.parameters.script = BAT_SCRIPT_ALIASES[raw];
            }
        }

        // ── FIX v2.3: Ensure WebBot always has a query ───────────────────────
        // The LLM sometimes returns intents like "greetings", "default", "farewell"
        // (no known prefix) or "chat_response" (known prefix) WITHOUT including
        // the original user message in parameters. WebBot then throws because it
        // has no text to process.
        // Solution: if the resolved bot is WebBot and there's no usable text
        // parameter, fall back to the original message stored in parameters._originalMessage,
        // or the intent name itself as a last resort.
        const effectiveBot = targetBot || "WebBot";
        if (effectiveBot === "WebBot") {
            const hasQuery =
                normalized.parameters.query ||
                normalized.parameters.message ||
                normalized.parameters.prompt ||
                normalized.parameters.text;

            if (!hasQuery) {
                // Try to recover original message from controller (passed via _originalMessage)
                const fallback =
                    normalized.parameters._originalMessage ||
                    normalized.parameters.input ||
                    "";

                normalized.parameters.query = fallback;

                if (fallback) {
                    logger.info(`WebBot: injected query from _originalMessage: "${fallback.substring(0, 60)}"`);
                } else {
                    logger.warn(`WebBot: no query found in parameters for intent "${normalized.intent}" — using intent name as fallback`);
                    normalized.parameters.query = normalized.intent;
                }
            }
        }

        if (!targetBot) {
            if (!this.isBotActive("WebBot")) this.activateBot("WebBot");
            return this._runSafe("WebBot", normalized.parameters);
        }

        if (!this.isBotActive(targetBot)) {
            logger.info(`Auto-activating ${targetBot}`);
            this.activateBot(targetBot);
        }

        return this._runSafe(targetBot, normalized.parameters);
    }

    async _handleWhatsAppQR() {
        try {
            if (!this.isBotActive("WhatsAppBot")) {
                logger.info("WhatsAppBot: activating to generate QR...");
                this.activateBot("WhatsAppBot");
                await new Promise(r => setTimeout(r, 3000));
            }

            let waState;
            try {
                waState = require("../routes/whatsappRoutes");
            } catch {
                return this._response("❌ WhatsApp module no disponible.", true);
            }

            const state = waState.state;

            if (state.status === "connected" && state.phone) {
                return this._response(
                    `✅ WhatsApp ya está vinculado al número +${state.phone}.\n[WHATSAPP_CONNECTED:${state.phone}]`,
                    false
                );
            }

            if (state.qr) {
                const age = Date.now() - (state.qrTimestamp || 0);
                if (age > 60000) {
                    return this._response(
                        "⏳ El QR expiró. Estoy generando uno nuevo, pedímelo en unos segundos.",
                        false
                    );
                }
                return this._response(
                    `📱 Escaneá este QR con WhatsApp:\n[WHATSAPP_QR:${state.qr}]`,
                    false
                );
            }

            return this._response(
                "⏳ Estoy iniciando WhatsApp... Esperá 10 segundos y volvé a pedirme el QR.",
                false
            );
        } catch (err) {
            logger.error(`WhatsApp QR handler: ${err.message}`);
            return this._response(`Error al obtener QR de WhatsApp: ${err.message}`, true);
        }
    }

    async _runSafe(botName, parameters) {
        const bot = this.bots[botName];
        if (!bot) return this._response(`Bot "${botName}" no está disponible`, true);

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
            this._triggerDoctor(botName, err).catch(() => { });
            return this._response(`Error en ${botName}: ${err.message}`, true);
        }
    }

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

    _response(reply, error) { return { reply, error }; }
}

module.exports = new BotManager();