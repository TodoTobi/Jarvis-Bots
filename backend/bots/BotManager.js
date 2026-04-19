/**
 * BotManager.js — v6.0
 *
 * CAMBIOS vs v5:
 *  - TerminalBot agregado: ejecuta comandos de terminal, crea scripts, instala paquetes
 *  - canvas_generate mejorado: detecta tipo y puede ejecutar scripts generados
 *  - Intents nuevos: terminal_exec, create_script, install_package
 *  - Gemini ELIMINADO — todo por Gemma 4 local
 *  - wake word "sistema" correctamente manejado
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
const TerminalBot = require("./TerminalBot");
const logger = require("../logs/logger");

let NLP, LangAliases;
try {
    NLP = require("../services/NLPService");
    LangAliases = require("../services/LanguageAliases");
    logger.info("BotManager: NLPService cargado");
} catch (e) {
    NLP = null;
    LangAliases = null;
    logger.warn("BotManager: NLPService no disponible:", e.message);
}

/* ── AUTO-DESACTIVACIÓN ──────────────────────────────────── */
const AUTO_DEACTIVATE_CONFIG = {
    WebBot: null,
    BatBot: null,
    SearchBot: null,
    DriveBot: null,
    TerminalBot: null,
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
    "drive_": "DriveBot",
    "file_": "DriveBot",
    "folder_": "DriveBot",
    "archivo_": "DriveBot",
    "carpeta_": "DriveBot",
    "terminal_": "TerminalBot",
    "script_": "TerminalBot",
    "exec_": "TerminalBot",
    "create_script": "TerminalBot",
    "install_": "TerminalBot",
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
    "close_discord": "close_discord", "cerrar_discord": "close_discord",
    "close_chrome": "close_chrome", "cerrar_chrome": "close_chrome",
    "close_vscode": "close_vscode", "cerrar_vscode": "close_vscode",
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
};

const ANTIGRAVITY_KEYWORDS = ["antigravity", "antigraviti", "anti gravity", "abre antigravity", "abrir antigravity"];

const SELF_AWARENESS_MODULE_MAP = {
    BotManager: "backend/bots/BotManager.js",
    ModelService: "backend/services/ModelService.js",
    NLPService: "backend/services/NLPService.js",
    LanguageAliases: "backend/services/LanguageAliases.js",
    SupabaseService: "backend/services/SupabaseService.js",
    InstructionLoader: "backend/utils/InstructionLoader.js",
    DriveBot: "backend/bots/DriveBot.js",
    WebBot: "backend/bots/WebBot.js",
    BatBot: "backend/bots/BatBot.js",
    TerminalBot: "backend/bots/TerminalBot.js",
    ComputerBot: "backend/bots/ComputerBot.js",
    VisionBot: "backend/bots/VisionBot.js",
    SearchBot: "backend/bots/SearchBot.js",
    MediaBot: "backend/bots/MediaBot.js",
    NetBot: "backend/bots/NetBot.js",
    WhatsAppBot: "backend/bots/WhatsAppBot.js",
    DoctorBot: "backend/bots/DoctorBot.js",
    GoogleDocsBot: "backend/bots/GoogleDocsBot.js",
    Bot: "backend/bots/Bot.js",
    chatController: "backend/controllers/chatController.js",
    deviceController: "backend/controllers/deviceController.js",
    server: "backend/server.js",
};

class BotManager {
    constructor() {
        const batBot = new BatBot();
        const doctorBot = new DoctorBot();
        const terminalBot = new TerminalBot();

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
            TerminalBot: terminalBot,
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

        // Bots activos por defecto
        ["WebBot", "BatBot", "SearchBot", "DriveBot", "TerminalBot"].forEach(n => {
            this.states[n].active = true;
        });

        this._autoDeactivateInterval = setInterval(() => {
            this._checkAutoDeactivate();
        }, 2 * 60 * 1000);

        logger.info(`BotManager v6 initialized. Bots: ${Object.keys(this.bots).join(", ")}`);
    }

    /* ── AUTO-DESACTIVACIÓN ─────────────────────────────── */
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

    /* ── Activate / Deactivate ──────────────────────────── */
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
            this.bots.WhatsAppBot.deactivate().catch(() => {});
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

    async _startWhatsApp() {
        if (!this.bots.WhatsAppBot) {
            this.bots.WhatsAppBot = new WhatsAppBot();
        }
        await this.bots.WhatsAppBot.activate();
        this.states.WhatsAppBot.status = "idle";
    }

    /* ══════════════════════════════════════════════════
       EXECUTE INTENT — PUNTO CENTRAL
    ══════════════════════════════════════════════════ */
    async executeIntent(intentObject) {
        const normalized = this._normalizeIntent(intentObject);
        const rawMessage = normalized.parameters?._originalMessage || "";

        let processedMessage = rawMessage;
        if (LangAliases && rawMessage) {
            const { text, changed } = LangAliases.applyAliases(rawMessage);
            if (changed) {
                processedMessage = text;
                logger.info(`[Aliases] Corregido: "${rawMessage}" → "${processedMessage}"`);
            }
        }

        if (NLP && rawMessage) {
            const { resolved, contextUsed, hint } = NLP.context.resolveReferences(processedMessage);
            if (contextUsed) {
                logger.info(`[Context] ${hint}`);
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

        // ── SELF-AWARENESS ─────────────────────────────────
        if (normalized.intent === "self_explain") {
            return await this._handleSelfExplain(normalized.parameters);
        }

        // ── CANVAS ─────────────────────────────────────────
        if (normalized.intent === "canvas_generate" || normalized.intent === "canvas_create") {
            return await this._handleCanvas(normalized.parameters);
        }

        // ── TERMINAL ───────────────────────────────────────
        if (
            normalized.intent === "terminal_exec" ||
            normalized.intent === "create_script" ||
            normalized.intent === "install_package" ||
            normalized.intent === "terminal_run" ||
            normalized.intent.startsWith("terminal_") ||
            normalized.intent.startsWith("script_") ||
            normalized.intent.startsWith("install_")
        ) {
            return await this._handleTerminalIntent(normalized);
        }

        // ── DriveBot ───────────────────────────────────────
        const driveResult = await this._handleDriveIntent(normalized);
        if (driveResult) return driveResult;

        // ── Google Docs ────────────────────────────────────
        const gdocsResult = await this._handleGoogleDocsIntent(normalized);
        if (gdocsResult) return gdocsResult;

        // ── Antigravity ────────────────────────────────────
        const antigravityResult = await this._handleAntigravityIntent(normalized);
        if (antigravityResult) return antigravityResult;

        // ── Cerrar apps ────────────────────────────────────
        const closeResult = await this._handleCloseIntent(normalized);
        if (closeResult) return closeResult;

        // ── Volumen exacto ─────────────────────────────────
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

        // ── Búsqueda web ───────────────────────────────────
        if (["search_web", "web_search", "buscar_web", "google_search"].includes(normalized.intent)) {
            const q = normalized.parameters.query || normalized.parameters.search || "";
            if (!this.isBotActive("SearchBot")) this.activateBot("SearchBot");
            return this._runSafe("SearchBot", { query: q });
        }

        // ── Routing general ────────────────────────────────
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
        if (targetBot === "TerminalBot") {
            return await this._handleTerminalIntent(normalized);
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
       TERMINAL INTENT HANDLER
    ══════════════════════════════════════════════════ */
    async _handleTerminalIntent(normalized) {
        const intent = normalized.intent;
        const params = normalized.parameters;

        if (!this.isBotActive("TerminalBot")) this.activateBot("TerminalBot");

        let action = params.action || "";

        if (!action) {
            if (intent.includes("create_and_run") || intent.includes("create_script")) {
                action = params.content ? "create_and_run" : "exec";
            } else if (intent.includes("create_file") || intent.includes("write_file")) {
                action = "create_file";
            } else if (intent.includes("install")) {
                action = params.package?.includes("pip") ? "install_pip" : "install_npm";
            } else if (intent.includes("list")) {
                action = "list_dir";
            } else {
                action = "exec";
            }
        }

        const terminalParams = {
            action,
            command: params.command || params.task || params.query || null,
            filepath: params.filepath || params.path || null,
            filename: params.filename || params.name || null,
            content: params.content || params.code || null,
            workdir: params.workdir || params.directory || null,
            package: params.package || null,
        };

        logger.info(`TerminalBot: action="${action}" command="${terminalParams.command || ""}"`);
        return this._runSafe("TerminalBot", terminalParams);
    }

    /* ══════════════════════════════════════════════════
       SELF-AWARENESS HANDLER
    ══════════════════════════════════════════════════ */
    async _handleSelfExplain({ filePath, question, module: moduleName }) {
        const axios = require("axios");
        const port = process.env.PORT || 3001;

        let resolvedPath = filePath;
        if (!resolvedPath && moduleName) {
            resolvedPath = SELF_AWARENESS_MODULE_MAP[moduleName] || null;
            if (!resolvedPath) {
                if (/Bot$/.test(moduleName)) resolvedPath = `backend/bots/${moduleName}.js`;
                else if (/Service$/.test(moduleName)) resolvedPath = `backend/services/${moduleName}.js`;
                else if (/Controller$/.test(moduleName)) resolvedPath = `backend/controllers/${moduleName}.js`;
            }
        }

        try {
            const response = await axios.post(
                `http://localhost:${port}/api/self/explain`,
                {
                    filePath: resolvedPath,
                    question: question || `Explicá qué hace ${resolvedPath || moduleName} y cómo se integra`,
                    context: moduleName ? `El usuario preguntó sobre: ${moduleName}` : null,
                },
                { timeout: 90000 }
            );
            return this._response(response.data?.explanation || "No pude generar una explicación.", false);
        } catch (err) {
            logger.error(`[SelfAwareness] Error: ${err.message}`);
            return this._response(`❌ Error de self-awareness: ${err.message}`, true);
        }
    }

    /* ══════════════════════════════════════════════════
       CANVAS HANDLER
    ══════════════════════════════════════════════════ */
    async _handleCanvas({ prompt, type, question, execute }) {
        const axios = require("axios");
        const port = process.env.PORT || 3001;
        const canvasPrompt = prompt || question || "";

        if (!canvasPrompt) {
            return this._response("❌ Indicame qué querés que genere. Ej: 'haceme un diagrama de flujo del login'", true);
        }

        try {
            const response = await axios.post(
                `http://localhost:${port}/api/gemma/canvas`,
                { prompt: canvasPrompt, type: type || "auto" },
                { timeout: 120000 }
            );

            if (!response.data?.success) {
                throw new Error(response.data?.error || "Error al generar canvas");
            }

            const { code, type: detectedType } = response.data;

            const typeLabel = {
                mermaid: "diagrama Mermaid",
                html: "diseño HTML",
                svg: "ilustración SVG",
                react: "componente React",
                javascript: "gráfico JavaScript",
                python: "script Python",
                bash: "script Bash",
                powershell: "script PowerShell",
            }[detectedType] || "contenido generado";

            let result = `🎨 Generé un ${typeLabel}:\n\n\`\`\`${detectedType}\n${code}\n\`\`\``;

            // Si es un script y el usuario quiere ejecutarlo
            if (execute && ["python", "bash", "powershell", "javascript"].includes(detectedType)) {
                if (!this.isBotActive("TerminalBot")) this.activateBot("TerminalBot");
                const ext = { python: ".py", bash: ".sh", powershell: ".ps1", javascript: ".js" }[detectedType];
                const execResult = await this._runSafe("TerminalBot", {
                    action: "create_and_run",
                    filename: `jarvis_script${ext}`,
                    content: code,
                });
                result += `\n\n**Ejecución:**\n${execResult.reply}`;
            }

            return this._response(result, false);

        } catch (err) {
            logger.error(`[Canvas] Error: ${err.message}`);
            return this._response(`❌ Error generando canvas: ${err.message}`, true);
        }
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
             "move_file", "copy_file", "file_search", "file_delete", "folder_create",
             "open_file", "file_open", "abrir_archivo", "abrir_archivo_local",
             "play_file", "reproducir_archivo"].includes(intent);

        if (!isDrive) return null;

        if (!this.isBotActive("DriveBot")) this.activateBot("DriveBot");

        let action = params.action || "";

        if (!action) {
            if (intent.includes("move_to_drive") || intent.includes("pasar_drive")) action = "move_to_drive";
            else if (intent.includes("copy_to_drive") || intent.includes("copiar_drive")) action = "copy_to_drive";
            else if (intent.includes("search") || intent.includes("buscar") || intent === "file_search") action = "search";
            else if (intent.includes("list_drive")) action = "list_drive";
            else if (intent.includes("delete") || intent.includes("eliminar") || intent === "file_delete") action = "delete_file";
            else if (intent.includes("create_folder") || intent === "folder_create") action = "create_folder";
            else if (intent.includes("create_file")) action = "create_file";
            else if (intent.includes("move_file")) action = "move_file";
            else if (intent.includes("copy_file")) action = "copy_file";
            else if (intent.includes("open_file") || intent.includes("abrir_archivo") || intent.includes("play_file")) action = "open_file";
            else action = "search";
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
            return this._response("❌ GoogleDocsBot no disponible.\n```\nnpm install googleapis\n```", true);
        }
        if (!this.isBotActive("GoogleDocsBot")) this.activateBot("GoogleDocsBot");

        let action = params.action || "";
        if (!action) {
            if (intent.includes("duplicate")) action = "duplicate_doc";
            else if (intent.includes("read")) action = "read_doc";
            else if (intent.includes("write") || intent.includes("edit")) action = "write_doc";
            else if (intent.includes("list")) action = "list_docs";
            else if (intent.includes("create")) action = "create_doc";
            else if (intent.includes("find_replace")) action = "find_replace";
            else if (intent.includes("append")) action = "append_doc";
            else action = "list_docs";
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

        const task = `Estás en Antigravity AI. ${message}\nEncontrá el campo de texto, escribí: "${message}", presioná Enter.`;
        return this._runSafe("ComputerBot", { task });
    }

    /* ── CLOSE INTENT ───────────────────────────────── */
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

    /* ── CAPACIDADES ────────────────────────────────── */
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

        return `🤖 **JarvisCore v6 — Capacidades:**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎤 **Voz:** wake words "sistema" o "jarvis", di "enviar" para enviar
🧠 **Self-Awareness** — Conoce su propio código
🎨 **Canvas/Artifacts** — Diagramas Mermaid, HTML, SVG, scripts
💻 **TerminalBot** — Ejecuta comandos, crea y corre scripts
📁 **DriveBot** — Archivos y Google Drive Sync
🖥️ **ComputerBot** — Control del PC con visión IA
📄 **GoogleDocsBot** — Google Docs
🌐 **SearchBot** — Búsqueda web real
💬 **WebBot** — Conversación con Gemma 4
📱 **WhatsAppBot** — Control remoto
📷 **VisionBot** — Análisis de imágenes y PDFs
🤖 **NetBot** — Dispositivos Android (ADB)
🩺 **DoctorBot** — Diagnóstico automático

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${scriptLines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Ejemplos de terminal:
• "ejecutá 'ls -la' en el Desktop"
• "crea un script Python que liste los archivos y ejecutalo"
• "instalá el paquete requests con pip"`;
    }

    /* ── WhatsApp QR ────────────────────────────────── */
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
            return this._response("⏳ WhatsApp iniciando... El QR se genera en ~15 segundos.", false);
        } catch (err) {
            return this._response(`Error al obtener QR: ${err.message}`, true);
        }
    }

    /* ── Run safe ───────────────────────────────────── */
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

            if (NLP) {
                NLP.context.push({
                    intent: parameters.action || parameters.intent || botName,
                    parameters,
                    message: parameters._originalMessage || "",
                    reply: replyText,
                    bot: botName,
                });
            }

            return this._response(replyText, false);
        } catch (err) {
            this.states[botName].status = "error";
            this.states[botName].lastError = err.message;
            logger.error(`[Error] ${botName}: ${err.message}`);
            this._triggerDoctor(botName, err).catch(() => {});
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