/**
 * BotManager.js — v4.0
 *
 * CAMBIOS vs v3:
 *  - DriveBot registrado: mover/copiar/buscar archivos + Google Drive Sync
 *  - WhatsApp fix: _startWhatsApp llama a bot.activate() no bot.run()
 *  - Intent map: drive_*, file_* → DriveBot
 *  - getCapabilities() actualizado con DriveBot
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
const DriveBot = require("./DriveBot");
const logger = require("../logs/logger");

// ── NLP / Contexto / Aliases ─────────────────────────────────────────────────
let NLP, LangAliases;
try {
    NLP = require("../services/NLPService");
    LangAliases = require("../services/LanguageAliases");
    logger.info("BotManager: NLPService cargado — contexto y aliases habilitados");
} catch (e) {
    NLP = null;
    LangAliases = null;
    logger.warn("BotManager: NLPService no disponible:", e.message);
}

/* ══════════════════════════════════════════════════════
   AUTO-DESACTIVACIÓN (ms de inactividad)
   null = nunca se desactiva
══════════════════════════════════════════════════════ */
const AUTO_DEACTIVATE_CONFIG = {
    WebBot: null,
    BatBot: null,
    SearchBot: null,
    DriveBot: null,           // Siempre activo — operaciones de archivo son frecuentes
    ComputerBot: 15 * 60000,
    VisionBot: 10 * 60000,
    MediaBot: 20 * 60000,
    NetBot: 30 * 60000,
    DoctorBot: null,
    WhatsAppBot: null,
    GoogleDocsBot: 15 * 60000,
};

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
    "talk_": "WebBot",
    "google_docs": "GoogleDocsBot",
    "gdocs_": "GoogleDocsBot",
    // ── DriveBot ──────────────────────────────────
    "drive_": "DriveBot",
    "file_": "DriveBot",
    "folder_": "DriveBot",
    "archivo_": "DriveBot",
    "carpeta_": "DriveBot",
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
    "close_youtube": "close_youtube", "cerrar_youtube": "close_youtube",
    "close_spotify": "close_spotify", "cerrar_spotify": "close_spotify",
    "close_vlc": "close_vlc", "cerrar_vlc": "close_vlc",
    "discord": "app_discord", "open_discord": "app_discord",
    "vscode": "app_vscode", "code": "app_vscode", "open_vscode": "app_vscode",
    "fortnite": "app_fortnite", "open_fortnite": "app_fortnite",
    "browser": "app_browser", "open_browser": "app_browser",
    "chrome": "app_chrome", "open_chrome": "app_chrome",
    "firefox": "app_firefox", "open_firefox": "app_firefox",
    "brave": "app_brave", "open_brave": "app_brave",
    "chatgpt": "app_chatgpt", "open_chatgpt": "app_chatgpt",
    "antigravity": "open_antigravity", "open_antigravity": "open_antigravity",
    "cursor": "app_cursor", "open_cursor": "app_cursor",
    "terminal": "app_terminal", "cmd": "app_terminal",
    "powershell": "app_powershell",
    "postman": "app_postman",
    "github": "app_github_desktop", "github_desktop": "app_github_desktop",
    "close_discord": "close_discord", "cerrar_discord": "close_discord",
    "close_chrome": "close_chrome", "cerrar_chrome": "close_chrome",
    "close_vscode": "close_vscode", "cerrar_vscode": "close_vscode",
    "close_firefox": "close_firefox", "cerrar_firefox": "close_firefox",
    "screenshot": "system_screenshot", "captura": "system_screenshot",
    "lock": "system_lock", "lock_pc": "system_lock", "bloquear": "system_lock",
    "sleep": "system_sleep", "suspend": "system_sleep", "dormir": "system_sleep",
    "night_mode": "system_night_mode", "dark_mode": "system_night_mode",
};

const ANTIGRAVITY_KEYWORDS = ["antigravity", "antigraviti", "anti gravity", "abre antigravity", "abrir antigravity"];

class BotManager {
    constructor() {
        const batBot = new BatBot();
        const doctorBot = new DoctorBot();

        let GoogleDocsBot = null;
        try {
            GoogleDocsBot = require("./GoogleDocsBot");
        } catch {
            logger.warn("BotManager: GoogleDocsBot no disponible (npm install googleapis)");
        }

        this.bots = {
            WebBot: new WebBot(),
            DoctorBot: doctorBot,
            BatBot: batBot,
            MediaBot: new MediaBot(batBot),
            NetBot: new NetBot(),
            WhatsAppBot: null,
            ComputerBot: new ComputerBot(),
            VisionBot: new VisionBot(),
            SearchBot: new SearchBot(),
            DriveBot: new DriveBot(),
            GoogleDocsBot: GoogleDocsBot ? new GoogleDocsBot() : null,
        };

        this.states = {};
        for (const name of Object.keys(this.bots)) {
            this.states[name] = {
                active: false,
                status: "idle",
                lastError: null,
                lastRun: null,
                runCount: 0,
            };
        }

        // Auto-activar bots esenciales
        ["WebBot", "BatBot", "SearchBot", "DriveBot"].forEach(n => {
            this.states[n].active = true;
        });

        this._autoDeactivateInterval = setInterval(() => {
            this._checkAutoDeactivate();
        }, 2 * 60 * 1000);

        logger.info(`BotManager v4 initialized. Bots: ${Object.keys(this.bots).join(", ")}`);
    }

    /* ── AUTO-DESACTIVACIÓN ───────────────────────── */

    _checkAutoDeactivate() {
        const now = Date.now();
        for (const [name, state] of Object.entries(this.states)) {
            if (!state.active) continue;
            const timeout = AUTO_DEACTIVATE_CONFIG[name];
            if (!timeout) continue;
            const lastActivity = state.lastRun ? new Date(state.lastRun).getTime() : null;
            if (!lastActivity) continue;
            if (now - lastActivity >= timeout) {
                logger.info(`[AutoDeactivate] ${name} inactivo → desactivando`);
                this.deactivateBot(name);
            }
        }
    }

    /* ── Activate / Deactivate ────────────────────── */

    activateBot(name) {
        this._assertExists(name);
        this.states[name].active = true;
        this.states[name].status = "idle";
        if (name === "WhatsAppBot") {
            this._startWhatsApp().catch(err => logger.error(`WhatsAppBot start error: ${err.message}`));
        }
        if (name === "GoogleDocsBot" && !this.bots.GoogleDocsBot) {
            logger.warn("BotManager: GoogleDocsBot no disponible. npm install googleapis");
        }
        logger.info(`Bot activated: ${name}`);
    }

    deactivateBot(name) {
        this._assertExists(name);
        this.states[name].active = false;
        this.states[name].status = "idle";
        if (name === "WhatsAppBot" && this.bots.WhatsAppBot) {
            this.bots.WhatsAppBot.deactivate().catch(() => { });
        }
        logger.info(`Bot deactivated: ${name}`);
    }

    isBotActive(name) {
        if (!(name in this.states)) return false;
        return this.states[name].active;
    }

    getBot(name) { return this.bots[name] || null; }

    getAllStates() {
        return Object.entries(this.states).map(([name, state]) => ({
            name,
            description: this.bots[name]?.description || "",
            available: !!this.bots[name],
            autoDeactivateMinutes: AUTO_DEACTIVATE_CONFIG[name]
                ? AUTO_DEACTIVATE_CONFIG[name] / 60000
                : null,
            ...state,
        }));
    }

    _assertExists(name) {
        if (!(name in this.bots)) throw new Error(`Bot "${name}" no existe`);
    }

    /* ── WhatsApp — FIX: usar activate() no run() ─── */

    async _startWhatsApp() {
        if (!this.bots.WhatsAppBot) {
            this.bots.WhatsAppBot = new WhatsAppBot();
        }
        // FIX: el bot expone activate(), no run({action:"start"})
        await this.bots.WhatsAppBot.activate();
        this.states.WhatsAppBot.status = "idle";
    }

    /* ══════════════════════════════════════════════════
       EXECUTE INTENT
    ══════════════════════════════════════════════════ */

    async executeIntent(intentObject) {
        const normalized = this._normalizeIntent(intentObject);
        const rawMessage = normalized.parameters?._originalMessage || "";

        // ── Aplicar aliases lingüísticos al mensaje original ──────────────────────
        let processedMessage = rawMessage;
        let aliasCorrection = null;
        if (LangAliases && rawMessage) {
            const { text, changed, corrections } = LangAliases.applyAliases(rawMessage);
            if (changed) {
                processedMessage = text;
                aliasCorrection = corrections.length > 0 ? corrections[corrections.length - 1].corrected : text;
                logger.info(`[Aliases] Corregido: "${rawMessage}" → "${processedMessage}"`);
            }
        }

        // ── Resolver referencias contextuales ─────────────────────────────────────
        // Ej: "mueve ese al drive" → resuelve "ese" con el archivo del turno anterior
        if (NLP && rawMessage) {
            const { resolved, contextUsed, hint } = NLP.context.resolveReferences(processedMessage);
            if (contextUsed) {
                logger.info(`[Context] ${hint}`);
                // Actualizar parámetros con referencia resuelta
                if (!normalized.parameters.filename && !normalized.parameters.source) {
                    normalized.parameters._resolvedFromContext = resolved;
                }
            }
        }

        logger.info(`[Intent] "${normalized.intent}" | params: ${JSON.stringify(normalized.parameters).substring(0, 120)}`);

        if (normalized.intent === "error") {
            return this._response(normalized.parameters.reason || "El modelo no pudo determinar una acción.", true);
        }

        if (normalized.intent === "capabilities") {
            return this._response(this.getCapabilities(), false);
        }

        if (normalized.intent === "whatsapp_qr") {
            return this._handleWhatsAppQR();
        }

        // ── DriveBot ──────────────────────────────────
        const driveResult = await this._handleDriveIntent(normalized);
        if (driveResult) return driveResult;

        // ── Google Docs ────────────────────────────────
        const gdocsResult = await this._handleGoogleDocsIntent(normalized);
        if (gdocsResult) return gdocsResult;

        // ── Antigravity ───────────────────────────────
        const antigravityResult = await this._handleAntigravityIntent(normalized);
        if (antigravityResult) return antigravityResult;

        // ── Cerrar apps ───────────────────────────────
        const closeResult = await this._handleCloseIntent(normalized);
        if (closeResult) return closeResult;

        // ── Volumen exacto ────────────────────────────
        if (["volume", "set_volume", "volume_set"].includes(normalized.intent)) {
            const level = normalized.parameters.level ?? normalized.parameters.value ?? null;
            if (level !== null) {
                if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
                return this._runSafe("BatBot", { script: "volume_set", args: [String(level)] });
            }
            const action = (normalized.parameters.action || "").toLowerCase();
            const script = (action.includes("down") || action.includes("decrease") || action.includes("baj"))
                ? "volume_down" : "volume_up";
            if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
            return this._runSafe("BatBot", { script, args: [] });
        }

        // ── Búsqueda web ──────────────────────────────
        if (["search_web", "web_search", "buscar_web", "google_search"].includes(normalized.intent)) {
            const q = normalized.parameters.query || normalized.parameters.search || "";
            if (!this.isBotActive("SearchBot")) this.activateBot("SearchBot");
            return this._runSafe("SearchBot", { query: q });
        }

        // ── Routing general ───────────────────────────
        const targetBot = this._mapIntent(normalized.intent);

        if (targetBot === "NetBot" && !normalized.parameters.action) {
            const suffix = normalized.intent.replace(/^net_/, "");
            normalized.parameters.action = NET_ACTION_MAP[suffix] || suffix;
        }
        if (targetBot === "MediaBot" && !normalized.parameters.intent) {
            normalized.parameters.intent = MEDIA_INTENT_MAP[normalized.intent] || normalized.intent;
        }
        if (targetBot === "ComputerBot" && !normalized.parameters.task) {
            normalized.parameters.task =
                normalized.parameters.query || normalized.parameters.command || normalized.parameters.description || "";
        }
        if (targetBot === "BatBot" && normalized.parameters.script) {
            const raw = normalized.parameters.script;
            if (BAT_SCRIPT_ALIASES[raw]) {
                normalized.parameters.script = BAT_SCRIPT_ALIASES[raw];
            }
        }
        if (targetBot === "SearchBot") {
            const q = normalized.parameters.query || normalized.parameters.search || "";
            if (!this.isBotActive("SearchBot")) this.activateBot("SearchBot");
            return this._runSafe("SearchBot", { query: q });
        }

        const effectiveBot = targetBot || "WebBot";
        if (effectiveBot === "WebBot") {
            const hasQuery = normalized.parameters.query || normalized.parameters.message || normalized.parameters.text;
            if (!hasQuery) {
                normalized.parameters.query = normalized.parameters._originalMessage || normalized.intent;
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

    /* ══════════════════════════════════════════════════
       DRIVE INTENT HANDLER
    ══════════════════════════════════════════════════ */

    async _handleDriveIntent(normalized) {
        const intent = normalized.intent;
        const params = normalized.parameters;

        const isDrive =
            intent.startsWith("drive_") ||
            intent.startsWith("file_") ||
            intent.startsWith("folder_") ||
            intent.startsWith("archivo_") ||
            intent.startsWith("carpeta_") ||
            ["move_to_drive", "copy_to_drive", "search_file", "search_files",
             "list_drive", "delete_file", "create_folder", "create_file",
             "move_file", "copy_file",
             "open_file", "file_open", "abrir_archivo", "abrir_archivo_local",
             "play_file", "reproducir_archivo"].includes(intent);

        if (!isDrive) return null;

        if (!this.isBotActive("DriveBot")) this.activateBot("DriveBot");

        // Normalizar acción
        let action = params.action || "";

        if (!action) {
            if (intent.includes("move_to_drive") || intent.includes("pasar_drive") || intent.includes("mover_drive")) {
                action = "move_to_drive";
            } else if (intent.includes("copy_to_drive") || intent.includes("copiar_drive")) {
                action = "copy_to_drive";
            } else if (intent.includes("search") || intent.includes("buscar")) {
                action = "search";
            } else if (intent.includes("list_drive") || intent.includes("listar_drive")) {
                action = "list_drive";
            } else if (intent.includes("delete") || intent.includes("eliminar")) {
                action = "delete_file";
            } else if (intent.includes("create_folder") || intent.includes("crear_carpeta")) {
                action = "create_folder";
            } else if (intent.includes("create_file") || intent.includes("crear_archivo")) {
                action = "create_file";
            } else if (intent.includes("move_file") || intent.includes("mover_archivo")) {
                action = "move_file";
            } else if (intent.includes("copy_file") || intent.includes("copiar_archivo")) {
                action = "copy_file";
            } else if (
                intent.includes("open_file") || intent.includes("file_open") ||
                intent.includes("abrir_archivo") || intent.includes("play_file") ||
                intent.includes("reproducir_archivo")
            ) {
                action = "open_file";
            } else {
                action = "search";
            }
        }

        const driveParams = {
            action,
            source: params.source || params.path || params.ruta || params.archivo || null,
            filename: params.filename || params.name || params.nombre || params.query || null,
            destination: params.destination || params.dest || params.destino || null,
            subfolder: params.subfolder || params.subcarpeta || null,
            query: params.query || params.search || params.nombre || null,
            type: params.type || params.tipo || null,
            location: params.location || params.ubicacion || null,
            content: params.content || params.contenido || "",
            skipShortcuts: params.skip_shortcuts !== false,
        };

        logger.info(`DriveBot: action="${action}" filename="${driveParams.filename}" source="${driveParams.source}"`);
        return this._runSafe("DriveBot", driveParams);
    }

    /* ══════════════════════════════════════════════════
       GOOGLE DOCS HANDLER
    ══════════════════════════════════════════════════ */

    async _handleGoogleDocsIntent(normalized) {
        const intent = normalized.intent;
        const params = normalized.parameters;

        const isGdocs =
            intent.startsWith("google_docs") ||
            intent.startsWith("gdocs_") ||
            intent.includes("google_doc") ||
            intent.includes("gdoc");

        if (!isGdocs) return null;

        if (!this.bots.GoogleDocsBot) {
            return this._response(
                "❌ GoogleDocsBot no disponible.\n```\nnpm install googleapis\n```\nLuego configurá la service account.",
                true
            );
        }
        if (!this.isBotActive("GoogleDocsBot")) this.activateBot("GoogleDocsBot");

        let action = params.action || "";
        if (!action) {
            if (intent.includes("duplicate") || intent.includes("duplicar")) action = "duplicate_doc";
            else if (intent.includes("read") || intent.includes("leer")) action = "read_doc";
            else if (intent.includes("write") || intent.includes("escribir") || intent.includes("edit")) action = "write_doc";
            else if (intent.includes("list") || intent.includes("listar")) action = "list_docs";
            else if (intent.includes("create") || intent.includes("crear")) action = "create_doc";
            else if (intent.includes("find_replace") || intent.includes("reemplazar")) action = "find_replace";
            else if (intent.includes("append") || intent.includes("agregar")) action = "append_doc";
            else action = "list_docs";
        }

        if (action === "duplicate_and_write" || intent === "google_docs_duplicate_and_write") {
            return await this._handleDuplicateAndWrite(params);
        }

        const docsParams = {
            action,
            docId: params.doc_id || params.docId || params.id || null,
            docName: params.doc_name || params.docName || params.document || params.nombre || params.name || null,
            newName: params.new_name || params.newName || null,
            content: params.content || params.text || params.texto || params.contenido || null,
            find: params.find || params.buscar || null,
            replace: params.replace || params.reemplazar || null,
            title: params.title || params.titulo || params.nombre || null,
            maxResults: params.max_results || params.limit || 10,
            replaceAll: params.replace_all === true || params.replaceAll === true || false,
        };

        return this._runSafe("GoogleDocsBot", docsParams);
    }

    async _handleDuplicateAndWrite(params) {
        if (!this.bots.GoogleDocsBot) return this._response("❌ GoogleDocsBot no disponible.", true);
        if (!this.isBotActive("GoogleDocsBot")) this.activateBot("GoogleDocsBot");

        const dupResult = await this._runSafe("GoogleDocsBot", {
            action: "duplicate_doc",
            docName: params.docName,
            newName: params.newName || null,
        });
        if (dupResult.error) return dupResult;

        const replyText = dupResult.reply || "";
        const idMatch = replyText.match(/ID[:\s]+`?([a-zA-Z0-9_-]{20,})`?/);
        const newDocId = idMatch?.[1] || null;

        if (!newDocId || !params.content) {
            return this._response(`${dupResult.reply}\n\n${params.content ? "⚠ No pude extraer el ID. Pedime que escriba en él por nombre." : "✅ Documento duplicado."}`, false);
        }

        const writeResult = await this._runSafe("GoogleDocsBot", {
            action: "write_doc",
            docId: newDocId,
            content: params.content,
            replaceAll: false,
        });

        return this._response(`${dupResult.reply}\n\n✏️ **Contenido escrito:**\n${writeResult.reply}`, false);
    }

    /* ══════════════════════════════════════════════════
       ANTIGRAVITY HANDLER
    ══════════════════════════════════════════════════ */

    async _handleAntigravityIntent(normalized) {
        const intent = normalized.intent;
        const params = normalized.parameters;

        const isAntigravity =
            intent.includes("antigravity") ||
            intent.includes("anti_gravity") ||
            ANTIGRAVITY_KEYWORDS.some(kw => (params._originalMessage || "").toLowerCase().includes(kw));

        if (!isAntigravity) return null;

        const message = params.message || params.query || params.task || "";
        const isAgentTask = message.length > 0 &&
            !intent.includes("open") && !intent.includes("abre") && !intent.includes("abrir");

        if (!isAgentTask) {
            if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
            return this._runSafe("BatBot", { script: "open_antigravity", args: [] });
        }

        if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
        if (!this.isBotActive("ComputerBot")) this.activateBot("ComputerBot");

        await this._runSafe("BatBot", { script: "open_antigravity", args: [] });
        await new Promise(r => setTimeout(r, 3000));

        const task = `Estás en Antigravity AI. ${message}\nEncontrá el campo de texto, escribí: "${message}", presioná Enter. Transcribí la respuesta.`;
        return this._runSafe("ComputerBot", { task, url: process.env.ANTIGRAVITY_URL || "https://antigravity.ai" });
    }

    /* ── CLOSE INTENT ─────────────────────────────── */

    async _handleCloseIntent(normalized) {
        const closeMap = {
            "close_youtube": "close_youtube", "cerrar_youtube": "close_youtube",
            "close_spotify": "close_spotify", "cerrar_spotify": "close_spotify",
            "close_discord": "close_discord", "cerrar_discord": "close_discord",
            "close_chrome": "close_chrome", "cerrar_chrome": "close_chrome",
            "close_vscode": "close_vscode", "cerrar_vscode": "close_vscode",
            "close_vlc": "close_vlc", "cerrar_vlc": "close_vlc",
        };
        const script = closeMap[normalized.intent];
        if (!script) return null;
        if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
        return this._runSafe("BatBot", { script, args: [] });
    }

    /* ── CAPACIDADES ──────────────────────────────── */

    getCapabilities() {
        const batBot = this.bots["BatBot"];
        const scripts = batBot ? batBot.getAvailableScripts() : [];
        const byCategory = {};
        for (const s of scripts) {
            const cat = s.category || "otros";
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(`• ${s.label}${s.description ? ` — ${s.description}` : ""}`);
        }
        const icons = { media: "🎵", apps: "📱", dev: "💻", system: "⚙️", otros: "🔧" };
        const names = { media: "Multimedia", apps: "Aplicaciones", dev: "Desarrollo", system: "Sistema", otros: "Otros" };
        const scriptLines = Object.entries(byCategory).map(([cat, items]) =>
            `${icons[cat] || "🔧"} **${names[cat] || cat}**\n${items.join("\n")}`
        ).join("\n\n");

        const driveFolder = this.bots["DriveBot"]?.driveFolder || "No configurada (DRIVE_SYNC_FOLDER en .env)";

        return `🤖 **JarvisCore — Todo lo que puedo hacer:**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 **DriveBot** — Archivos y Google Drive Sync
• Mover archivos al Drive: "pasame tarea.pdf al drive"
• Copiar al Drive: "copiá cuphead al drive"
• Buscar en la PC: "buscá el archivo tarea.pdf"
• Listar Drive: "qué hay en el drive"
• Crear carpetas: "creá una carpeta Proyectos en el drive"
• Eliminar archivos: "eliminá el archivo X"
• Carpeta sincronizada: \`${driveFolder}\`

🖥️ **ComputerBot** — Control del PC con visión IA
• Automatizar cualquier tarea visual

📄 **GoogleDocsBot** — Google Docs
• Duplicar, editar, leer y crear documentos

🌐 **SearchBot** — Búsqueda web real
• "buscá X en internet"

🤖 **Antigravity AI** — Agente externo

💬 **WebBot** — Conversación con IA local

📱 **WhatsAppBot** — Control remoto
• "pasame [archivo] al drive"
• "buscá [archivo]"
• "archivos [carpeta]"

📷 **VisionBot** — Análisis de imágenes y PDFs

🤖 **NetBot** — Dispositivos Android (ADB)

🩺 **DoctorBot** — Diagnóstico automático

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${scriptLines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🗣️ **Voz:** wake word "jarvis [comando]"`;
    }

    /* ── WhatsApp QR ──────────────────────────────── */

    async _handleWhatsAppQR() {
        try {
            if (!this.isBotActive("WhatsAppBot") || !this.bots.WhatsAppBot) {
                this.activateBot("WhatsAppBot");
                await new Promise(r => setTimeout(r, 4500));
            }
            const waBot = this.bots.WhatsAppBot;
            if (waBot?.connected) {
                return this._response(`✅ WhatsApp vinculado al número +${waBot.connectedPhone}.\n[WHATSAPP_CONNECTED:${waBot.connectedPhone}]`, false);
            }
            const qrData = waBot?.getQRData();
            if (qrData?.available) {
                const qrSrc = qrData.qr.startsWith("data:") ? qrData.qr : `data:image/png;base64,${qrData.qr}`;
                return this._response(`📱 Escaneá este QR con WhatsApp:\n[WHATSAPP_QR:${qrSrc}]`, false);
            }
            return this._response("⏳ WhatsApp iniciando... El QR se genera en ~15 segundos. Pedilo nuevamente.", false);
        } catch (err) {
            return this._response(`Error al obtener QR: ${err.message}`, true);
        }
    }

    /* ── Run safe ─────────────────────────────────── */

    async _runSafe(botName, parameters) {
        const bot = this.bots[botName];
        if (!bot) return this._response(`Bot "${botName}" no disponible`, true);

        try {
            this.states[botName].status = "working";
            this.states[botName].lastRun = new Date();
            this.states[botName].lastError = null;

            const result = await bot.run(parameters);

            this.states[botName].status = "idle";
            this.states[botName].runCount = (this.states[botName].runCount || 0) + 1;

            const replyText = this._stringify(result);

            // ── Guardar en contexto NLP para refinamiento futuro ──────────────
            if (NLP) {
                NLP.context.push({
                    intent:     parameters.action || parameters.intent || botName,
                    parameters: parameters,
                    message:    parameters._originalMessage || "",
                    reply:      replyText,
                    bot:        botName,
                });
            }

            return this._response(replyText, false);
        } catch (err) {
            this.states[botName].status = "error";
            this.states[botName].lastError = err.message;
            logger.error(`[Error] ${botName}: ${err.message}`);
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
            return { intent: "error", parameters: { reason: "Intent inválido" } };
        }
        return {
            intent: typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : "error",
            parameters: (obj.parameters && typeof obj.parameters === "object") ? obj.parameters : {},
        };
    }

    _mapIntent(intent) {
        const sorted = Object.entries(INTENT_MAP).sort((a, b) => b[0].length - a[0].length);
        for (const [prefix, bot] of sorted) {
            if (intent.startsWith(prefix) || intent.includes(prefix.replace("_", ""))) return bot;
        }
        return null;
    }

    _stringify(result) {
        if (typeof result === "string") return result;
        if (result && typeof result === "object" && result.reply) return result.reply;
        if (typeof result === "object") return JSON.stringify(result, null, 2);
        return String(result);
    }

    _response(reply, error) { return { reply, error }; }

    destroy() {
        if (this._autoDeactivateInterval) clearInterval(this._autoDeactivateInterval);
    }
}

module.exports = new BotManager();