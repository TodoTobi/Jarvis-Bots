/**
 * WhatsAppBot.js — v2.1 FIXED
 *
 * FIXES:
 *  - isAllowed() ahora también toma WHATSAPP_NUMBER como número autorizado (antes solo leía WHATSAPP_ALLOWED_NUMBERS)
 *  - Si WHATSAPP_ALLOWED_NUMBERS está vacío, usa WHATSAPP_NUMBER como fallback
 *  - Debug mode siempre loguea el número exacto que llegó para poder debuggear
 *  - _handleMessage: si WHATSAPP_DEBUG=true loguea el from exacto SIEMPRE (incluso si pasa el filtro)
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");
const fs = require("fs");
const path = require("path");

// ─── Silence triggers ─────────────────────────────────────────
const SILENCE_TRIGGERS = [
    /callate/i, /cállate/i, /silencio/i, /modo silencio/i,
    /no respondas/i, /quedáte callado/i, /quedate callado/i,
    /shut up/i, /stop responding/i
];

const RESUME_TRIGGERS = [
    /responde/i, /respondé/i, /actívate/i, /activate/i,
    /despertá/i, /desperta/i, /volvé/i, /volve/i,
    /resume/i, /estás ahí/i, /estas ahí/i, /estas ahi/i
];

// ─── Lazy-load whatsapp-web.js ────────────────────────────────
let Client, LocalAuth, qrcodeTerminal;

function loadDeps() {
    try {
        ({ Client, LocalAuth } = require("whatsapp-web.js"));
        qrcodeTerminal = require("qrcode-terminal");
        return true;
    } catch {
        logger.warn("WhatsAppBot: whatsapp-web.js not installed. Run: npm install whatsapp-web.js qrcode-terminal");
        return false;
    }
}

// ─── Helper: generate base64 QR for frontend ─────────────────
async function generateBase64QR(qrString) {
    try {
        const QRCode = require("qrcode");
        return await QRCode.toDataURL(qrString);
    } catch {
        logger.warn("WhatsAppBot: 'qrcode' package not found. Run: npm install qrcode");
        return null;
    }
}

class WhatsAppBot extends Bot {
    constructor(orchestratorCallback) {
        super("WhatsAppBot", "Control remoto vía WhatsApp");

        this.orchestrator = orchestratorCallback;
        this.client = null;
        this.ready = false;
        this.silenced = false;
        this.sessionDir = path.resolve(__dirname, "../../.wwebjs_auth");
        this.allowedNumbers = this._loadAllowedNumbers();

        this.debugMode = process.env.WHATSAPP_DEBUG === "true";
    }

    /* ── Allowed numbers ─────────────────────────────── */

    _loadAllowedNumbers() {
        // Primero leer WHATSAPP_ALLOWED_NUMBERS
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        let numbers = raw
            .split(",")
            .map(n => n.trim())
            .filter(Boolean);

        // ✅ FIX: Si no hay WHATSAPP_ALLOWED_NUMBERS, usar WHATSAPP_NUMBER como fallback
        if (numbers.length === 0) {
            const fallback = (process.env.WHATSAPP_NUMBER || "").trim();
            if (fallback) {
                numbers = [fallback];
                logger.info(`WhatsAppBot: WHATSAPP_ALLOWED_NUMBERS vacío, usando WHATSAPP_NUMBER como fallback: ${fallback}`);
            } else {
                logger.warn("WhatsAppBot: ni WHATSAPP_ALLOWED_NUMBERS ni WHATSAPP_NUMBER están configurados en .env");
                logger.warn("WhatsAppBot: Para permitir mensajes, agrega en .env: WHATSAPP_ALLOWED_NUMBERS=5491160597308");
            }
        } else {
            logger.info(`WhatsAppBot: ${numbers.length} número(s) autorizado(s): ${numbers.join(", ")}`);
        }
        return numbers;
    }

    isAllowed(from) {
        if (this.allowedNumbers.length === 0) return false;

        // WhatsApp envía el número en formato: "5491160597308@c.us" o "54911XXXXXXXX@c.us"
        const fromDigits = from.replace(/@.*/, "").replace(/\D/g, "");

        for (const allowed of this.allowedNumbers) {
            const allowedDigits = allowed.replace(/@.*/, "").replace(/\D/g, "");

            // Comparación exacta
            if (fromDigits === allowedDigits) return true;

            // Argentina: WhatsApp puede enviar con "549" (móvil) o "54" (fijo)
            // fromDigits = "5491160597308" , allowed = "5491160597308" → match
            // fromDigits = "541160597308"  , allowed = "5491160597308" → match con normalización
            if (fromDigits.startsWith("549") && allowedDigits.startsWith("54")) {
                const withoutMobile = "54" + fromDigits.substring(3);
                if (withoutMobile === allowedDigits) return true;
            }
            if (allowedDigits.startsWith("549") && fromDigits.startsWith("54")) {
                const withoutMobile = "54" + allowedDigits.substring(3);
                if (withoutMobile === fromDigits) return true;
            }

            // ✅ FIX: también comparar solo los últimos 8 dígitos como último recurso
            if (fromDigits.length >= 8 && allowedDigits.length >= 8) {
                const fromLast8 = fromDigits.slice(-8);
                const allowedLast8 = allowedDigits.slice(-8);
                if (fromLast8 === allowedLast8) return true;
            }
        }
        return false;
    }

    /* ── Bot run() entry point ──────────────────────── */

    async run(parameters) {
        const action = parameters?.action || "start";
        if (action === "start") return this.start();
        if (action === "stop") return this.stop();
        if (action === "status") return this.getStatus();
        if (action === "silence") { this.silenced = true; return "🔇 Modo silencio activado"; }
        if (action === "resume") { this.silenced = false; return "🔊 Modo silencio desactivado"; }
        throw new Error(`WhatsAppBot: unknown action "${action}"`);
    }

    /* ── Start ──────────────────────────────────────── */

    async start() {
        if (!loadDeps()) {
            throw new Error("whatsapp-web.js not installed. Run: npm install whatsapp-web.js qrcode-terminal");
        }

        if (this.client) return "WhatsAppBot ya está corriendo";

        logger.info("WhatsAppBot: initializing...");

        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: this.sessionDir }),
            puppeteer: {
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            }
        });

        // ── QR event ──────────────────────────────────────────────
        this.client.on("qr", async (qr) => {
            logger.info("WhatsAppBot: QR ready — scan with your phone:");

            if (qrcodeTerminal) {
                console.log("\n========= WHATSAPP QR =========\n");
                qrcodeTerminal.generate(qr, { small: true });
                console.log("\n================================\n");
            }

            const base64 = await generateBase64QR(qr);
            if (base64) {
                try {
                    const waRoutes = require("../routes/whatsappRoutes");
                    waRoutes.setQR(base64);
                    logger.info("WhatsAppBot: QR pushed to frontend state ✅");
                } catch (err) {
                    logger.warn(`WhatsAppBot: could not push QR to routes — ${err.message}`);
                }
            }
        });

        this.client.on("authenticated", () => {
            logger.info("WhatsAppBot: authenticated ✅");
        });

        this.client.on("ready", () => {
            this.ready = true;
            const myNumber = this.client.info?.wid?.user || "unknown";
            logger.info(`WhatsAppBot: ready ✅ Mi número: ${myNumber}`);
            logger.info(`WhatsAppBot: números permitidos = ${this.allowedNumbers.join(", ")}`);

            // ✅ FIX: Si allowedNumbers está vacío, usar el número propio como autorizado
            if (this.allowedNumbers.length === 0 && myNumber !== "unknown") {
                this.allowedNumbers = [myNumber];
                logger.info(`WhatsAppBot: auto-configurando número propio como permitido: ${myNumber}`);
            }

            try {
                const waRoutes = require("../routes/whatsappRoutes");
                waRoutes.setConnected(myNumber);
            } catch (err) {
                logger.warn(`WhatsAppBot: could not set connected state — ${err.message}`);
            }
        });

        this.client.on("disconnected", (reason) => {
            this.ready = false;
            logger.warn(`WhatsAppBot: disconnected — ${reason}`);
            try {
                const waRoutes = require("../routes/whatsappRoutes");
                waRoutes.setDisconnected();
            } catch { }
        });

        // ── Mensajes de otros → _handleMessage ───────────────────
        this.client.on("message", async (msg) => {
            // ✅ FIX: SIEMPRE loguear el from para poder debuggear sin activar debug mode
            logger.info(`WhatsAppBot: mensaje recibido de="${msg.from}" fromMe=${msg.fromMe} allowed=${this.isAllowed(msg.from)}`);
            await this._handleMessage(msg);
        });

        // ── Self-chat: mensajes enviados AL PROPIO NÚMERO ─────────
        this.client.on("message_create", async (msg) => {
            if (!msg.fromMe) return;

            if (this.debugMode) {
                logger.info(`WhatsAppBot DEBUG: self-message from="${msg.from}" to="${msg.to}" body="${msg.body?.substring(0, 60)}"`);
            }

            try {
                const myJid = this.client.info?.wid?.user;
                if (!myJid) return;

                const toNumber = (msg.to || "").replace(/@.*/, "").replace(/\D/g, "");
                const myNumber = myJid.replace(/\D/g, "");

                const isSelfChat = toNumber === myNumber
                    || toNumber === myNumber.replace(/^549/, "54")
                    || "549" + toNumber.replace(/^54/, "") === myNumber;

                if (!isSelfChat) return;

                let text = "";
                if (msg.hasMedia && (msg.type === "ptt" || msg.type === "audio")) {
                    logger.info("WhatsAppBot: self-chat voice note received, transcribing...");
                    try {
                        const media = await msg.downloadMedia();
                        text = await this._transcribeAudio(media.data, media.mimetype);
                        if (!text) {
                            await msg.reply("❌ No pude transcribir el audio.");
                            return;
                        }
                        logger.info(`WhatsAppBot self-chat STT: "${text}"`);
                    } catch (e) {
                        logger.warn(`WhatsAppBot self-chat audio error: ${e.message}`);
                        return;
                    }
                } else {
                    text = msg.body?.trim();
                }

                if (!text) return;

                logger.info(`WhatsAppBot: self-chat command: "${text.substring(0, 80)}"`);
                await this._handleSelfMessage(msg, text);

            } catch (err) {
                logger.warn(`WhatsAppBot self-message error: ${err.message}`);
            }
        });

        await this.client.initialize();
        return "WhatsAppBot iniciado — escanear QR en la UI o terminal para vincular el teléfono";
    }

    /* ── Self-chat message handler ───────────────────────── */

    async _handleSelfMessage(msg, text) {
        try {
            if (SILENCE_TRIGGERS.some(r => r.test(text))) {
                this.silenced = true;
                logger.info("WhatsAppBot: silence mode ON (self-chat)");
                await msg.reply("🔇 Silencio activado.");
                return;
            }
            if (RESUME_TRIGGERS.some(r => r.test(text))) {
                this.silenced = false;
                logger.info("WhatsAppBot: silence mode OFF (self-chat)");
                await msg.reply("🔊 Activo.");
                return;
            }
            if (this.silenced) return;

            logger.info(`WhatsAppBot self-chat → orchestrator: "${text.substring(0, 80)}"`);
            const result = await this.orchestrator(text);
            const reply = this._cleanReply(result?.reply || "Sin respuesta.");
            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot _handleSelfMessage error: ${err.message}`);
            try { await msg.reply("❌ Error interno."); } catch { }
        }
    }

    async stop() {
        if (this.client) {
            await this.client.destroy().catch(() => { });
            this.client = null;
            this.ready = false;
            logger.info("WhatsAppBot: stopped");
            try {
                const waRoutes = require("../routes/whatsappRoutes");
                waRoutes.setDisconnected();
            } catch { }
        }
        return "WhatsAppBot detenido";
    }

    getStatus() {
        return [
            `WhatsAppBot: ${this.ready ? "🟢 conectado" : "🔴 desconectado"}`,
            `Modo silencio: ${this.silenced ? "🔇 activo" : "🔊 inactivo"}`,
            `Números permitidos: ${this.allowedNumbers.join(", ")}`,
            `Debug mode: ${this.debugMode ? "ON" : "OFF (set WHATSAPP_DEBUG=true para activar)"}`
        ].join("\n");
    }

    /* ── Message handler ────────────────────────────── */

    async _handleMessage(msg) {
        try {
            if (msg.fromMe) return;

            if (!this.isAllowed(msg.from)) {
                // ✅ FIX: SIEMPRE mostrar este warning (no solo en debug mode)
                // para que el usuario sepa exactamente qué número está siendo bloqueado
                logger.warn(`WhatsAppBot: BLOQUEADO mensaje de ${msg.from}`);
                logger.warn(`WhatsAppBot: Número recibido (sin @): ${msg.from.replace(/@.*/, "")}`);
                logger.warn(`WhatsAppBot: Números permitidos: ${this.allowedNumbers.join(", ")}`);
                logger.warn(`WhatsAppBot: Para arreglar, agregá en .env: WHATSAPP_ALLOWED_NUMBERS=${msg.from.replace(/@.*/, "")}`);
                return;
            }

            let text = "";

            if (msg.hasMedia && msg.type === "ptt") {
                logger.info("WhatsAppBot: voice note received, transcribing...");
                const media = await msg.downloadMedia();
                text = await this._transcribeAudio(media.data, media.mimetype);

                if (!text) {
                    if (!this.silenced) await msg.reply("❌ No pude transcribir el audio.");
                    return;
                }
                logger.info(`WhatsAppBot STT: "${text}"`);

            } else if (msg.body && typeof msg.body === "string") {
                text = msg.body.trim();
            } else {
                return;
            }

            if (!text) return;

            if (SILENCE_TRIGGERS.some(r => r.test(text))) {
                this.silenced = true;
                logger.info("WhatsAppBot: silence mode ON");
                await msg.reply("🔇 Modo silencio activado. Decime *'responde'* cuando quieras que vuelva.");
                return;
            }

            if (RESUME_TRIGGERS.some(r => r.test(text))) {
                this.silenced = false;
                logger.info("WhatsAppBot: silence mode OFF");
                await msg.reply("🔊 Activo.");
                return;
            }

            if (this.silenced) {
                logger.info(`WhatsAppBot: silenced — ignoring: "${text.substring(0, 50)}"`);
                return;
            }

            logger.info(`WhatsAppBot → orchestrator: "${text.substring(0, 80)}"`);

            const result = await this.orchestrator(text);
            const reply = this._cleanReply(result?.reply || "Sin respuesta del sistema.");

            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot handler error: ${err.message}`);
            try { await msg.reply("❌ Error interno."); } catch { }
        }
    }

    /* ── Limpiar respuesta para WhatsApp ──────────────── */

    _cleanReply(text) {
        if (!text) return text;
        const greetingPatterns = [
            /^(hola[,!.]?\s*){1,3}/i,
            /^(buenas?\s*(tardes?|noches?|días?)[,!.]?\s*)/i,
            /^(¿en qué (puedo )?ayudarte[,?.]?\s*)/i,
            /^(¿cómo (puedo )?ayudarte[,?.]?\s*)/i,
            /^(¿en qué te puedo ayudar[,?.]?\s*)/i,
            /^(¿qué (necesitás|necesitas)[,?.]?\s*)/i,
            /^(jarvis aquí[,!.]?\s*)/i,
            /^(claro[,!.]?\s*)/i,
        ];

        let cleaned = text.trim();
        let changed = true;
        while (changed) {
            changed = false;
            for (const p of greetingPatterns) {
                const newText = cleaned.replace(p, "").trim();
                if (newText !== cleaned && newText.length > 0) {
                    cleaned = newText;
                    changed = true;
                }
            }
        }
        return cleaned || text;
    }

    /* ── STT — Whisper ──────────────────────────────── */

    async _transcribeAudio(base64Data, mimetype) {
        const tmpDir = path.resolve(__dirname, "../../tmp");
        fs.mkdirSync(tmpDir, { recursive: true });

        const ext = mimetype?.includes("ogg") ? "ogg" : "mp3";
        const tmpFile = path.join(tmpDir, `audio_${Date.now()}.${ext}`);

        try {
            fs.writeFileSync(tmpFile, Buffer.from(base64Data, "base64"));

            const { execSync } = require("child_process");

            const whisperBin = process.env.WHISPER_CPP_PATH;
            const whisperModel = process.env.WHISPER_MODEL_PATH;

            if (whisperBin && whisperModel && require("fs").existsSync(whisperBin)) {
                const out = execSync(
                    `"${whisperBin}" -m "${whisperModel}" -f "${tmpFile}" --language auto --output-txt 2>/dev/null`,
                    { timeout: 30000, encoding: "utf-8" }
                );
                return out.trim();
            }

            const pyOut = execSync(
                `python -c "import whisper; m=whisper.load_model('base'); r=m.transcribe('${tmpFile.replace(/\\/g, "/")}',language='es'); print(r['text'])"`,
                { timeout: 60000, encoding: "utf-8" }
            );
            return pyOut.trim();

        } catch (err) {
            logger.warn(`WhatsAppBot STT failed: ${err.message}`);
            return "";
        } finally {
            try { fs.unlinkSync(tmpFile); } catch { }
        }
    }
}

module.exports = WhatsAppBot;