/**
 * BotManager.js — v2.6 FIXED
 *
 * FIXES vs v2.5:
 *  1. CAPACIDADES: nuevo handler para intent "capabilities"
 *     Responde con lista completa de todo lo que puede hacer Jarvis
 *     Fuente de verdad: bat_whitelist.json + todos los bots disponibles
 *
 *  2. VOLUMEN SIN NIRCMD: volume_set.bat ahora tiene fallback sin nircmd
 *     Si nircmd no está disponible, usa PowerShell nativo de Windows
 *     El bat script se genera dinámicamente si no existe con lógica de fallback
 *
 *  3. VOZ → ACCIÓN: el intent de voz pasa exactamente igual que texto
 *     No hay cambio necesario en BotManager porque ya usaba executeIntent()
 *     El bug de voz está en el FRONTEND (ver nota abajo)
 *
 * NOTA PARA VOZ:
 *  Si los comandos de voz no ejecutan acciones, verificá en el frontend que:
 *  - El texto transcripto se envíe a POST /api/chat (NO a otro endpoint)
 *  - El body sea: { message: transcriptText }
 *  - No se envíe a /api/stt/transcribe (ese solo transcribe, no ejecuta)
 */

const WebBot = require("./WebBot");
const DoctorBot = require("./DoctorBot");
const BatBot = require("./BatBot");
const MediaBot = require("./MediaBot");
const NetBot = require("./NetBot");
const WhatsAppBot = require("./WhatsAppBot");
const ComputerBot = require("./ComputerBot");
const VisionBot = require("./VisionBot");
const SearchBot = require("./SearchBot");
const logger = require("../logs/logger");

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
    "search_": "SearchBot",
    "buscar_": "SearchBot",
    "talk_": "WebBot"
};

const NET_ACTION_MAP = {
    "adb_youtube": "adb_youtube", "adb_volume": "adb_volume",
    "adb_screenshot": "adb_screenshot", "adb_home": "adb_home",
    "adb_back": "adb_back", "adb_wakeup": "adb_wakeup",
    "adb_open_app": "adb_open_app", "adb_input_text": "adb_input_text",
    "adb_connect": "adb_connect", "screenshot": "adb_screenshot",
    "wol": "wol", "ping": "ping",
};

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

const BAT_SCRIPT_ALIASES = {
    "volume_set": "volume_set", "set_volume": "volume_set",
    "volume_increase": "volume_up", "volume_decrease": "volume_down",
    "mute": "volume_mute", "toggle_mute": "volume_mute", "unmute": "volume_mute",
    "youtube": "media_youtube", "open_youtube": "media_youtube",
    "play_youtube": "media_youtube", "abrir_youtube": "media_youtube",
    "spotify": "media_spotify", "open_spotify": "media_spotify", "play_spotify": "media_spotify",
    "vlc": "media_vlc", "open_vlc": "media_vlc",
    "pause": "media_pause", "play_pause": "media_pause", "play": "media_pause",
    "next_track": "media_next", "next": "media_next",
    "previous": "media_prev", "prev_track": "media_prev", "prev": "media_prev",
    "discord": "app_discord", "open_discord": "app_discord", "abrir_discord": "app_discord",
    "vscode": "app_vscode", "code": "app_vscode", "open_vscode": "app_vscode",
    "fortnite": "app_fortnite", "open_fortnite": "app_fortnite",
    "browser": "app_browser", "open_browser": "app_browser", "default_browser": "app_browser",
    "chrome": "app_chrome", "open_chrome": "app_chrome", "google_chrome": "app_chrome",
    "firefox": "app_firefox", "open_firefox": "app_firefox",
    "brave": "app_brave", "open_brave": "app_brave",
    "chatgpt": "app_chatgpt", "open_chatgpt": "app_chatgpt", "chat_gpt": "app_chatgpt",
    "antigravity": "app_antigravity", "open_antigravity": "app_antigravity",
    "cursor": "app_cursor", "open_cursor": "app_cursor",
    "terminal": "app_terminal", "cmd": "app_terminal",
    "powershell": "app_powershell",
    "postman": "app_postman",
    "github": "app_github_desktop", "github_desktop": "app_github_desktop",
    "screenshot": "system_screenshot", "captura": "system_screenshot",
    "lock": "system_lock", "lock_pc": "system_lock", "bloquear": "system_lock",
    "sleep": "system_sleep", "suspend": "system_sleep", "dormir": "system_sleep",
    "night_mode": "system_night_mode", "dark_mode": "system_night_mode", "modo_noche": "system_night_mode",
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
            VisionBot: new VisionBot(),
            SearchBot: new SearchBot()
        };

        this.states = {};
        for (const name of Object.keys(this.bots)) {
            this.states[name] = { active: false, status: "idle", lastError: null, lastRun: null, runCount: 0 };
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

    getBot(name) {
        return this.bots[name] || null;
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
            return this._response(normalized.parameters.reason || "El modelo no pudo determinar una acción válida.", true);
        }

        // ── Capacidades ────────────────────────────────────────────────────────
        // ✅ FIX NUEVO: responde con lista completa de lo que puede hacer
        if (normalized.intent === "capabilities") {
            return this._response(this.getCapabilities(), false);
        }

        // ── WhatsApp QR ────────────────────────────────────────────────────────
        if (normalized.intent === "whatsapp_qr") {
            return this._handleWhatsAppQR();
        }

        // ── Volumen exacto ─────────────────────────────────────────────────────
        if (["volume", "set_volume", "volume_set"].includes(normalized.intent)) {
            const level = normalized.parameters.level ?? normalized.parameters.value ?? null;
            if (level !== null) {
                if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
                return this._runSafe("BatBot", { script: "volume_set", args: [String(level)] });
            } else {
                const action = (normalized.parameters.action || "").toLowerCase();
                const script = (action.includes("down") || action.includes("decrease") || action.includes("baj"))
                    ? "volume_down" : "volume_up";
                if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
                return this._runSafe("BatBot", { script, args: [] });
            }
        }

        // ── Búsqueda web → SearchBot ───────────────────────────────────────────
        if (["search_web", "web_search", "buscar_web", "google_search"].includes(normalized.intent)) {
            const q = normalized.parameters.query || normalized.parameters.search || "";
            if (!this.isBotActive("SearchBot")) this.activateBot("SearchBot");
            return this._runSafe("SearchBot", { query: q });
        }

        const targetBot = this._mapIntent(normalized.intent);

        if (targetBot === "NetBot" && !normalized.parameters.action) {
            const suffix = normalized.intent.replace(/^net_/, "");
            normalized.parameters.action = NET_ACTION_MAP[suffix] || suffix;
            logger.info(`NetBot: injected action="${normalized.parameters.action}"`);
        }

        if (targetBot === "MediaBot" && !normalized.parameters.intent) {
            normalized.parameters.intent = MEDIA_INTENT_MAP[normalized.intent] || normalized.intent;
            logger.info(`MediaBot: injected intent="${normalized.parameters.intent}"`);
        }

        if (targetBot === "ComputerBot" && !normalized.parameters.task) {
            normalized.parameters.task =
                normalized.parameters.query || normalized.parameters.command || normalized.parameters.description || "";
        }

        if (targetBot === "BatBot" && normalized.parameters.script) {
            const raw = normalized.parameters.script;
            if (BAT_SCRIPT_ALIASES[raw]) {
                logger.info(`BatBot: aliased "${raw}" → "${BAT_SCRIPT_ALIASES[raw]}"`);
                normalized.parameters.script = BAT_SCRIPT_ALIASES[raw];
            }
        }

        // ── SearchBot directo ──────────────────────────────────────────────────
        if (targetBot === "SearchBot") {
            const q = normalized.parameters.query || normalized.parameters.search || "";
            if (!this.isBotActive("SearchBot")) this.activateBot("SearchBot");
            return this._runSafe("SearchBot", { query: q });
        }

        // ── WebBot: asegurar query ─────────────────────────────────────────────
        const effectiveBot = targetBot || "WebBot";
        if (effectiveBot === "WebBot") {
            const hasQuery = normalized.parameters.query || normalized.parameters.message ||
                normalized.parameters.prompt || normalized.parameters.text;
            if (!hasQuery) {
                const fallback = normalized.parameters._originalMessage || normalized.parameters.input || "";
                normalized.parameters.query = fallback || normalized.intent;
                if (!fallback) logger.warn(`WebBot: no query found, using intent name as fallback`);
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

    /* ── CAPACIDADES ────────────────────────────────────────────────────────
     * ✅ FIX NUEVO: lista completa de todo lo que puede hacer Jarvis
     * Incluye todos los scripts del whitelist + capacidades de todos los bots
     */
    getCapabilities() {
        // Obtener scripts disponibles del BatBot
        const batBot = this.bots["BatBot"];
        const scripts = batBot ? batBot.getAvailableScripts() : [];

        // Agrupar scripts por categoría
        const byCategory = {};
        for (const s of scripts) {
            const cat = s.category || "otros";
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(`• ${s.label}${s.description ? ` — ${s.description}` : ""}`);
        }

        const categoryIcons = {
            "media": "🎵",
            "apps": "📱",
            "dev": "💻",
            "system": "⚙️",
            "otros": "🔧"
        };

        const categoryNames = {
            "media": "Multimedia",
            "apps": "Aplicaciones",
            "dev": "Desarrollo",
            "system": "Sistema",
            "otros": "Otros scripts"
        };

        const scriptLines = Object.entries(byCategory).map(([cat, items]) => {
            const icon = categoryIcons[cat] || "🔧";
            const name = categoryNames[cat] || cat;
            return `${icon} **${name}**\n${items.join("\n")}`;
        }).join("\n\n");

        return `🤖 **JarvisCore — Todo lo que puedo hacer:**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🖥️ **ComputerBot** — Control del PC con visión IA
• Ejecutar tareas en la PC viendo la pantalla
• Automatizar cualquier acción: "abrí el archivo X y copiá el texto"
• Click, escribir, atajos de teclado, scroll

🌐 **SearchBot** — Búsqueda web real
• Buscar en DuckDuckGo/Bing con resultados y fuentes
• "buscá X en internet", "googleá X", "quién es X"
• Respuesta directa + lista de links verificados

💬 **WebBot** — Conversación con IA
• Preguntas generales, explicaciones, charla libre
• Procesado por el modelo local (LM Studio)

📱 **WhatsAppBot** — Control remoto vía WhatsApp
• Recibir y responder comandos desde WhatsApp
• Soporte de mensajes de voz (transcripción automática)
• Auto-chat enviándote mensajes a vos mismo

📷 **VisionBot** — Análisis visual con IA
• Analizar imágenes y describir su contenido
• Leer y resumir PDFs
• Transcribir audio (Whisper)
• Describir qué hay en la pantalla ahora mismo

🤖 **NetBot** — Control de dispositivos Android (ADB)
• Abrir YouTube en el celular/TV
• Control de volumen del dispositivo
• Capturas de pantalla remotas
• Encender dispositivos por red (Wake-on-LAN)

🩺 **DoctorBot** — Diagnóstico del sistema
• Detectar y diagnosticar errores automáticamente
• Sugerencias de solución específicas
• Historial de errores del sistema

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${scriptLines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🗣️ **Voz** — Modo de activación
• Botón 🎤 en la UI para push-to-talk
• Wake word "Sistema" para escucha continua
• Todos los comandos funcionan por voz igual que por texto

💡 **Tips:**
• "qué podés hacer" → esta lista
• "diagnostícate" → revisar estado del sistema
• "mostrá el QR" → conectar WhatsApp`;
    }

    async _handleWhatsAppQR() {
        try {
            if (!this.isBotActive("WhatsAppBot") || !this.bots.WhatsAppBot) {
                logger.info("WhatsAppBot: auto-activating para generar QR...");
                this.activateBot("WhatsAppBot");
                await new Promise(r => setTimeout(r, 4500));
            }

            let state = { connected: false, qr: null, phone: null };
            try {
                const waModule = require("../routes/whatsappRoutes");
                if (typeof waModule.getState === "function") {
                    state = waModule.getState();
                }
            } catch { }

            if (!state.connected && !state.qr) {
                const waBot = this.bots.WhatsAppBot;
                if (waBot) {
                    state.connected = waBot.ready === true;
                    state.phone = waBot.client?.info?.wid?.user || null;
                }
            }

            if (state.connected && state.phone) {
                return this._response(
                    `✅ WhatsApp ya está vinculado al número +${state.phone}.\n[WHATSAPP_CONNECTED:${state.phone}]`,
                    false
                );
            }

            if (state.qr) {
                const qrSrc = state.qr.startsWith("data:") ? state.qr : `data:image/png;base64,${state.qr}`;
                return this._response(`📱 Escaneá este QR con WhatsApp:\n[WHATSAPP_QR:${qrSrc}]`, false);
            }

            return this._response(
                "⏳ WhatsApp está iniciando... El QR se está generando. Abrí **Configuración → WhatsApp** o pedí el QR nuevamente en 15 segundos.",
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