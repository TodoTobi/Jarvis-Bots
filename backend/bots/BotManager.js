/**
 * BotManager.js — v3.0
 *
 * NUEVAS FUNCIONALIDADES:
 *  1. AUTO-DESACTIVACIÓN: bots que no van a trabajar se desactivan solos
 *     después de N minutos de inactividad (configurable por bot)
 *  2. GOOGLE DOCS: intents para duplicar, leer y editar Google Docs
 *     - google_docs_duplicate: duplicar un documento
 *     - google_docs_read: leer contenido
 *     - google_docs_write: escribir/editar dentro
 *     - google_docs_list: listar documentos
 *     - google_docs_create: crear nuevo
 *  3. ANTIGRAVITY: intent para abrir y operar Antigravity AI
 *     - open_antigravity: abrir la app
 *     - antigravity_agent: enviar mensaje al agente de Antigravity
 *  4. CLOSE BATS: intents para cerrar apps (close_youtube, close_spotify, etc)
 *  5. VOZ FIX: voz y texto van por exactamente el mismo path → executeIntent
 *  6. BOT CLOSE → BAT ALIAS: close_youtube → BatBot → close_youtube.bat
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

/* ══════════════════════════════════════════════════════
   CONFIGURACIÓN DE AUTO-DESACTIVACIÓN
   Tiempo en ms de inactividad antes de desactivar un bot.
   null = nunca se desactiva automáticamente
══════════════════════════════════════════════════════ */
const AUTO_DEACTIVATE_CONFIG = {
    WebBot: null,         // Siempre activo
    BatBot: null,         // Siempre activo (se necesita para cualquier cosa)
    SearchBot: null,         // Siempre activo
    ComputerBot: 15 * 60000,   // 15 min
    VisionBot: 10 * 60000,   // 10 min
    MediaBot: 20 * 60000,   // 20 min
    NetBot: 30 * 60000,   // 30 min
    DoctorBot: null,         // Solo se activa cuando hay error
    WhatsAppBot: null,         // Usuario controla manualmente (bot de conexión continua)
    GoogleDocsBot: 15 * 60000,  // 15 min
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
    // Volumen
    "volume_set": "volume_set", "set_volume": "volume_set",
    "volume_increase": "volume_up", "volume_decrease": "volume_down",
    "mute": "volume_mute", "toggle_mute": "volume_mute", "unmute": "volume_mute",
    // Media — abrir
    "youtube": "media_youtube", "open_youtube": "media_youtube",
    "play_youtube": "media_youtube", "abrir_youtube": "media_youtube",
    "spotify": "media_spotify", "open_spotify": "media_spotify", "play_spotify": "media_spotify",
    "vlc": "media_vlc", "open_vlc": "media_vlc",
    "pause": "media_pause", "play_pause": "media_pause", "play": "media_pause",
    "next_track": "media_next", "next": "media_next",
    "previous": "media_prev", "prev_track": "media_prev", "prev": "media_prev",
    // Media — cerrar ← NUEVO
    "close_youtube": "close_youtube", "cerrar_youtube": "close_youtube",
    "close_spotify": "close_spotify", "cerrar_spotify": "close_spotify",
    "close_vlc": "close_vlc", "cerrar_vlc": "close_vlc",
    // Apps — abrir
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
    // Apps — cerrar ← NUEVO
    "close_discord": "close_discord", "cerrar_discord": "close_discord",
    "close_chrome": "close_chrome", "cerrar_chrome": "close_chrome",
    "close_vscode": "close_vscode", "cerrar_vscode": "close_vscode",
    "close_firefox": "close_firefox", "cerrar_firefox": "close_firefox",
    // Sistema
    "screenshot": "system_screenshot", "captura": "system_screenshot",
    "lock": "system_lock", "lock_pc": "system_lock", "bloquear": "system_lock",
    "sleep": "system_sleep", "suspend": "system_sleep", "dormir": "system_sleep",
    "night_mode": "system_night_mode", "dark_mode": "system_night_mode",
};

/* ══════════════════════════════════════════════════════
   GOOGLE DOCS INTENT KEYWORDS
   El modelo puede devolver distintas variaciones; todas
   se normalizan a acciones de GoogleDocsBot
══════════════════════════════════════════════════════ */
const GOOGLE_DOCS_KEYWORDS = {
    duplicate: ["duplicar", "duplicate", "copiar", "copia", "clonar", "clone"],
    read: ["leer", "read", "mostrar", "ver", "abrir contenido", "qué dice"],
    write: ["escribir", "write", "editar", "edit", "agregar", "añadir", "append",
        "modificar", "reemplazar", "replace", "poner", "insertar"],
    list: ["listar", "list", "mostrar documentos", "mis documentos", "ver docs"],
    create: ["crear", "create", "nuevo documento", "new document"],
};

/* ══════════════════════════════════════════════════════
   ANTIGRAVITY KEYWORDS
══════════════════════════════════════════════════════ */
const ANTIGRAVITY_KEYWORDS = ["antigravity", "antigraviti", "anti gravity", "abre antigravity", "abrir antigravity"];

class BotManager {
    constructor() {
        const batBot = new BatBot();
        const doctorBot = new DoctorBot();

        // Intentar cargar GoogleDocsBot (requiere `npm install googleapis`)
        let GoogleDocsBot = null;
        try {
            GoogleDocsBot = require("./GoogleDocsBot");
        } catch {
            logger.warn("BotManager: GoogleDocsBot no disponible (¿falta googleapis?)");
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
        ["WebBot", "BatBot", "SearchBot"].forEach(n => {
            this.states[n].active = true;
        });

        // ── AUTO-DESACTIVACIÓN: check cada 2 minutos ─────────────
        this._autoDeactivateInterval = setInterval(() => {
            this._checkAutoDeactivate();
        }, 2 * 60 * 1000);

        logger.info(`BotManager v3 initialized. Bots: ${Object.keys(this.bots).join(", ")}`);
    }

    /* ── AUTO-DESACTIVACIÓN ───────────────────────────────── */

    _checkAutoDeactivate() {
        const now = Date.now();
        for (const [name, state] of Object.entries(this.states)) {
            if (!state.active) continue;

            const timeout = AUTO_DEACTIVATE_CONFIG[name];
            if (!timeout) continue; // null = nunca

            const lastActivity = state.lastRun ? new Date(state.lastRun).getTime() : null;
            if (!lastActivity) continue; // nunca corrió, no desactivar

            const elapsed = now - lastActivity;
            if (elapsed >= timeout) {
                logger.info(`[AutoDeactivate] ${name} inactivo por ${Math.round(elapsed / 60000)} min → desactivando`);
                this.deactivateBot(name);
            }
        }
    }

    /* ── Activate / Deactivate ────────────────────────────── */

    activateBot(name) {
        this._assertExists(name);
        this.states[name].active = true;
        this.states[name].status = "idle";
        if (name === "WhatsAppBot") {
            this._startWhatsApp().catch(err => logger.error(`WhatsAppBot start error: ${err.message}`));
        }
        if (name === "GoogleDocsBot" && !this.bots.GoogleDocsBot) {
            logger.warn("BotManager: GoogleDocsBot no disponible. Instalá 'googleapis': npm install googleapis");
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

    /* ── WhatsApp ─────────────────────────────────────────── */

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

    /* ══════════════════════════════════════════════════════
       EXECUTE INTENT — punto de entrada único para voz Y texto
    ══════════════════════════════════════════════════════ */

    async executeIntent(intentObject) {
        const normalized = this._normalizeIntent(intentObject);
        logger.info(`[Intent] "${normalized.intent}" | params: ${JSON.stringify(normalized.parameters)}`);

        if (normalized.intent === "error") {
            return this._response(normalized.parameters.reason || "El modelo no pudo determinar una acción.", true);
        }

        // ── Capacidades ───────────────────────────────────────
        if (normalized.intent === "capabilities") {
            return this._response(this.getCapabilities(), false);
        }

        // ── WhatsApp QR ───────────────────────────────────────
        if (normalized.intent === "whatsapp_qr") {
            return this._handleWhatsAppQR();
        }

        // ── Google Docs ────────────────────────────────────────
        const gdocsResult = await this._handleGoogleDocsIntent(normalized);
        if (gdocsResult) return gdocsResult;

        // ── Antigravity ───────────────────────────────────────
        const antigravityResult = await this._handleAntigravityIntent(normalized);
        if (antigravityResult) return antigravityResult;

        // ── Cerrar apps (close_*) ─────────────────────────────
        const closeResult = await this._handleCloseIntent(normalized);
        if (closeResult) return closeResult;

        // ── Volumen exacto ────────────────────────────────────
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

        // ── Búsqueda web ──────────────────────────────────────
        if (["search_web", "web_search", "buscar_web", "google_search"].includes(normalized.intent)) {
            const q = normalized.parameters.query || normalized.parameters.search || "";
            if (!this.isBotActive("SearchBot")) this.activateBot("SearchBot");
            return this._runSafe("SearchBot", { query: q });
        }

        // ── Routing general ───────────────────────────────────
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
                logger.info(`BatBot alias: "${raw}" → "${normalized.parameters.script}"`);
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

    /* ── Duplicar Y escribir (workflow de 2 pasos) ──────── */

    async _handleDuplicateAndWrite(params) {
        if (!this.bots.GoogleDocsBot) {
            return this._response("❌ GoogleDocsBot no disponible. Instalá 'googleapis': npm install googleapis", true);
        }
        if (!this.isBotActive("GoogleDocsBot")) this.activateBot("GoogleDocsBot");

        logger.info(`GoogleDocsBot: duplicate_and_write — docName="${params.docName}" content="${(params.content || "").substring(0, 60)}"`);

        // Paso 1: Duplicar
        const dupResult = await this._runSafe("GoogleDocsBot", {
            action: "duplicate_doc",
            docName: params.docName,
            newName: params.newName || null,
        });

        if (dupResult.error) return dupResult;

        // Extraer el ID del documento duplicado de la respuesta
        const replyText = dupResult.reply || "";
        const idMatch = replyText.match(/ID[:\s]+`?([a-zA-Z0-9_-]{20,})`?/);
        const newDocId = idMatch?.[1] || null;

        if (!newDocId || !params.content) {
            return this._response(
                `${dupResult.reply}\n\n${params.content ? "⚠ No pude extraer el ID del documento para escribir en él. Pedime que escriba en él indicando su nombre." : "✅ Documento duplicado."}`,
                false
            );
        }

        // Paso 2: Escribir en el documento duplicado
        const writeResult = await this._runSafe("GoogleDocsBot", {
            action: "write_doc",
            docId: newDocId,
            content: params.content,
            replaceAll: false,
        });

        return this._response(
            `${dupResult.reply}\n\n✏️ **Contenido escrito:**\n${writeResult.reply}`,
            false
        );
    }

    /* ══════════════════════════════════════════════════════
       GOOGLE DOCS HANDLER
    ══════════════════════════════════════════════════════ */

    async _handleGoogleDocsIntent(normalized) {
        const intent = normalized.intent;
        const params = normalized.parameters;

        // Detectar si es un intent de Google Docs
        const isGdocs =
            intent.startsWith("google_docs") ||
            intent.startsWith("gdocs_") ||
            intent.includes("google_doc") ||
            intent.includes("gdoc");

        if (!isGdocs) return null;

        if (!this.bots.GoogleDocsBot) {
            return this._response(
                "❌ GoogleDocsBot no está disponible. Instalá las dependencias:\n```\nnpm install googleapis\n```\nLuego configurá las credenciales de Google. Pedime 'cómo configurar Google Docs' para el paso a paso.",
                true
            );
        }
        if (!this.isBotActive("GoogleDocsBot")) {
            this.activateBot("GoogleDocsBot");
        }

        // Determinar acción específica
        let action = params.action || "";

        // Workflow especial: duplicar Y luego escribir
        if (action === "duplicate_and_write" || intent === "google_docs_duplicate_and_write") {
            return await this._handleDuplicateAndWrite(params);
        }

        // Si el modelo no especificó action, inferir desde el intent
        if (!action) {
            if (intent.includes("duplicate") || intent.includes("duplicar") || intent.includes("copy")) {
                action = "duplicate_doc";
            } else if (intent.includes("read") || intent.includes("leer") || intent.includes("ver")) {
                action = "read_doc";
            } else if (intent.includes("write") || intent.includes("escribir") || intent.includes("edit")) {
                action = "write_doc";
            } else if (intent.includes("list") || intent.includes("listar")) {
                action = "list_docs";
            } else if (intent.includes("create") || intent.includes("crear")) {
                action = "create_doc";
            } else if (intent.includes("find_replace") || intent.includes("reemplazar")) {
                action = "find_replace";
            } else if (intent.includes("append") || intent.includes("agregar") || intent.includes("añadir")) {
                action = "append_doc";
            } else {
                action = "list_docs";
            }
        }

        // Mapear parámetros comunes
        const docsParams = {
            action,
            docId: params.doc_id || params.docId || params.id || null,
            docName: params.doc_name || params.docName || params.document || params.nombre || params.name || null,
            newName: params.new_name || params.newName || params.nombre_nuevo || null,
            content: params.content || params.text || params.texto || params.contenido || null,
            find: params.find || params.buscar || null,
            replace: params.replace || params.reemplazar || null,
            title: params.title || params.titulo || params.nombre || null,
            maxResults: params.max_results || params.limit || 10,
            replaceAll: params.replace_all === true || params.replaceAll === true || false,
        };

        logger.info(`GoogleDocsBot: action="${action}" docName="${docsParams.docName}" docId="${docsParams.docId}"`);

        return this._runSafe("GoogleDocsBot", docsParams);
    }

    /* ══════════════════════════════════════════════════════
       ANTIGRAVITY HANDLER
    ══════════════════════════════════════════════════════ */

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

        // Solo abrir → .bat
        if (!isAgentTask) {
            if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
            return this._runSafe("BatBot", { script: "open_antigravity", args: [] });
        }

        // Tarea compleja: abrir Antigravity Y enviar instrucción al agente via ComputerBot
        if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
        if (!this.isBotActive("ComputerBot")) this.activateBot("ComputerBot");

        // 1. Abrir Antigravity
        await this._runSafe("BatBot", { script: "open_antigravity", args: [] });
        await new Promise(r => setTimeout(r, 3000)); // esperar que cargue

        // 2. ComputerBot interactúa con la UI de Antigravity
        const task = `Estás en Antigravity AI (${process.env.ANTIGRAVITY_URL || "https://antigravity.ai"}). 
${message}
Instrucciones: Encontrá el campo de texto del agente, escribí exactamente esto: "${message}", luego presioná Enter o el botón de enviar. Esperá la respuesta y transcribila.`;

        return this._runSafe("ComputerBot", { task, url: process.env.ANTIGRAVITY_URL || "https://antigravity.ai" });
    }

    /* ══════════════════════════════════════════════════════
       CLOSE INTENT HANDLER (cerrar apps)
    ══════════════════════════════════════════════════════ */

    async _handleCloseIntent(normalized) {
        const intent = normalized.intent;

        const closeMap = {
            "close_youtube": "close_youtube", "cerrar_youtube": "close_youtube",
            "close_spotify": "close_spotify", "cerrar_spotify": "close_spotify",
            "close_discord": "close_discord", "cerrar_discord": "close_discord",
            "close_chrome": "close_chrome", "cerrar_chrome": "close_chrome",
            "close_vscode": "close_vscode", "cerrar_vscode": "close_vscode",
            "close_vlc": "close_vlc", "cerrar_vlc": "close_vlc",
        };

        const script = closeMap[intent];
        if (!script) return null;

        if (!this.isBotActive("BatBot")) this.activateBot("BatBot");
        return this._runSafe("BatBot", { script, args: [] });
    }

    /* ── CAPACIDADES ──────────────────────────────────────── */

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

        return `🤖 **JarvisCore — Todo lo que puedo hacer:**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🖥️ **ComputerBot** — Control del PC con visión IA
• Ejecutar tareas complejas en la PC
• Automatizar cualquier acción: abrir archivos, copiar texto, rellenar formularios
• Click, escribir, atajos de teclado, scroll

📄 **GoogleDocsBot** — Google Docs
• Duplicar documentos existentes: "duplicá el documento X"
• Editar/escribir dentro: "escribí X en el documento Y"
• Crear documentos nuevos, leer contenido, buscar y reemplazar

🌐 **SearchBot** — Búsqueda web real
• Buscar en internet con resultados y fuentes
• "buscá X", "quién es X", "qué pasó con X"

🤖 **Antigravity AI** — Agente externo
• Abrir Antigravity: "abrí Antigravity"
• Enviar tareas al agente: "abrí Antigravity y que busque errores en el proyecto"

💬 **WebBot** — Conversación con IA local
• Preguntas, explicaciones, charla libre

📱 **WhatsAppBot** — Control remoto
• Recibir comandos por WhatsApp
• Soporte de mensajes de voz

📷 **VisionBot** — Análisis visual
• Analizar imágenes, PDFs
• Transcribir audio

🤖 **NetBot** — Dispositivos Android (ADB)
• YouTube en el celular/TV, volumen, capturas remotas

🩺 **DoctorBot** — Diagnóstico automático
• Se activa solo cuando un bot falla

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${scriptLines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🗣️ **Voz:** 🎤 click para grabar/parar · 👂 wake word "Sistema [comando]"
💡 Todos los comandos funcionan igual por voz y por texto`;
    }

    /* ── WhatsApp QR ──────────────────────────────────────── */

    async _handleWhatsAppQR() {
        try {
            if (!this.isBotActive("WhatsAppBot") || !this.bots.WhatsAppBot) {
                this.activateBot("WhatsAppBot");
                await new Promise(r => setTimeout(r, 4500));
            }
            let state = { connected: false, qr: null, phone: null };
            try {
                const waModule = require("../routes/whatsappRoutes");
                if (typeof waModule.getState === "function") state = waModule.getState();
            } catch { }

            if (!state.connected && !state.qr) {
                const waBot = this.bots.WhatsAppBot;
                if (waBot) { state.connected = waBot.ready === true; state.phone = waBot.client?.info?.wid?.user || null; }
            }
            if (state.connected && state.phone) {
                return this._response(`✅ WhatsApp vinculado al número +${state.phone}.\n[WHATSAPP_CONNECTED:${state.phone}]`, false);
            }
            if (state.qr) {
                const qrSrc = state.qr.startsWith("data:") ? state.qr : `data:image/png;base64,${state.qr}`;
                return this._response(`📱 Escaneá este QR con WhatsApp:\n[WHATSAPP_QR:${qrSrc}]`, false);
            }
            return this._response("⏳ WhatsApp iniciando... El QR se genera en ~15 segundos. Pedilo nuevamente.", false);
        } catch (err) {
            return this._response(`Error al obtener QR: ${err.message}`, true);
        }
    }

    /* ── Run safe con tracking de actividad ───────────────── */

    async _runSafe(botName, parameters) {
        const bot = this.bots[botName];
        if (!bot) return this._response(`Bot "${botName}" no disponible`, true);
        if (!this.states[botName]) return this._response(`Estado de "${botName}" no encontrado`, true);

        try {
            this.states[botName].status = "working";
            this.states[botName].lastRun = new Date();
            this.states[botName].lastError = null;
            logger.info(`[Run] ${botName}`);

            const result = await bot.run(parameters);

            this.states[botName].status = "idle";
            this.states[botName].runCount = (this.states[botName].runCount || 0) + 1;
            logger.info(`[Done] ${botName}`);

            return this._response(this._stringify(result), false);
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

    /* ── Cleanup ─────────────────────────────────────────── */
    destroy() {
        if (this._autoDeactivateInterval) {
            clearInterval(this._autoDeactivateInterval);
        }
    }
}

module.exports = new BotManager();