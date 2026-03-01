/**
 * WhatsAppBot.js — Remote control via WhatsApp
 *
 * FIXES:
 *  - Now generates base64 QR image and pushes it to whatsappRoutes state (for frontend)
 *  - Calls setConnected / setDisconnected on lifecycle events
 *  - Added logging of msg.from to debug number format issues
 *  - Fixed fromMe filter
 *  - Added number normalization before comparison
 *  - Debug mode logs all received messages
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
        // qrcode package not installed — try to install hint
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
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        const numbers = raw
            .split(",")
            .map(n => n.trim())
            .filter(Boolean);

        if (numbers.length === 0) {
            logger.warn("WhatsAppBot: WHATSAPP_ALLOWED_NUMBERS not set in .env");
        } else {
            logger.info(`WhatsAppBot: allowed numbers configured: ${numbers.length}`);
        }
        return numbers;
    }

    isAllowed(from) {
        if (this.allowedNumbers.length === 0) return false;

        const fromDigits = from.replace(/@.*/, "").replace(/\D/g, "");

        for (const allowed of this.allowedNumbers) {
            const allowedDigits = allowed.replace(/@.*/, "").replace(/\D/g, "");

            if (fromDigits === allowedDigits) return true;

            if (fromDigits.startsWith("549") && allowedDigits.startsWith("54")) {
                const withoutMobile = "54" + fromDigits.substring(3);
                if (withoutMobile === allowedDigits) return true;
            }
            if (allowedDigits.startsWith("549") && fromDigits.startsWith("54")) {
                const withoutMobile = "54" + allowedDigits.substring(3);
                if (withoutMobile === fromDigits) return true;
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

        // ── QR event: generate base64 for frontend ──────────
        this.client.on("qr", async (qr) => {
            logger.info("WhatsAppBot: QR ready — scan with your phone:");

            // 1. Terminal display (fallback)
            if (qrcodeTerminal) {
                console.log("\n========= WHATSAPP QR =========\n");
                qrcodeTerminal.generate(qr, { small: true });
                console.log("\n================================\n");
            }

            // 2. Generate base64 PNG for frontend API ← THE FIX
            const base64 = await generateBase64QR(qr);
            if (base64) {
                try {
                    const waRoutes = require("../routes/whatsappRoutes");
                    waRoutes.setQR(base64);
                    logger.info("WhatsAppBot: QR pushed to frontend state ✅");
                } catch (err) {
                    logger.warn(`WhatsAppBot: could not push QR to routes — ${err.message}`);
                }
            } else {
                logger.warn("WhatsAppBot: base64 QR unavailable — install 'qrcode' package: npm install qrcode");
            }
        });

        this.client.on("authenticated", () => {
            logger.info("WhatsAppBot: authenticated ✅");
        });

        this.client.on("ready", () => {
            this.ready = true;
            logger.info("WhatsAppBot: ready ✅ Listening for messages...");
            logger.info(`WhatsAppBot: allowed numbers = ${this.allowedNumbers.join(", ")}`);
            logger.info("WhatsAppBot: TIP — if messages aren't received, set WHATSAPP_DEBUG=true in .env to log all message sources");

            // ← Notify routes state that we're connected
            try {
                const waRoutes = require("../routes/whatsappRoutes");
                const phone = this.client.info?.wid?.user || "unknown";
                waRoutes.setConnected(phone);
            } catch (err) {
                logger.warn(`WhatsAppBot: could not set connected state — ${err.message}`);
            }
        });

        this.client.on("disconnected", (reason) => {
            this.ready = false;
            logger.warn(`WhatsAppBot: disconnected — ${reason}`);

            // ← Notify routes state
            try {
                const waRoutes = require("../routes/whatsappRoutes");
                waRoutes.setDisconnected();
            } catch { }
        });

        this.client.on("message", async (msg) => {
            if (this.debugMode || !this.isAllowed(msg.from)) {
                logger.info(`WhatsAppBot DEBUG: message from="${msg.from}" fromMe=${msg.fromMe} type="${msg.type}" allowed=${this.isAllowed(msg.from)}`);
            }
            await this._handleMessage(msg);
        });

        // ── Self-chat: mensajes enviados AL PROPIO NÚMERO ──────────────────
        // Cuando mandás un mensaje a tu propio chat de WhatsApp (chat "Tú mismo"),
        // fromMe=true y msg.to contiene tu propio JID.
        // Esto permite controlar Jarvis directamente desde WhatsApp.
        this.client.on("message_create", async (msg) => {
            if (!msg.fromMe) return;

            if (this.debugMode) {
                logger.info(`WhatsAppBot DEBUG: self-message from="${msg.from}" to="${msg.to}" body="${msg.body?.substring(0, 60)}"`);
            }

            // Solo procesar si fue enviado al propio número (self-chat)
            try {
                const myJid = this.client.info?.wid?.user;
                if (!myJid) return;

                const toNumber = (msg.to || "").replace(/@.*/, "").replace(/\D/g, "");
                const myNumber = myJid.replace(/\D/g, "");

                // Chequear coincidencia numérica (con o sin prefijo 549)
                const isSelfChat = toNumber === myNumber
                    || toNumber === myNumber.replace(/^549/, "54")
                    || "549" + toNumber.replace(/^54/, "") === myNumber
                    || toNumber === myNumber;

                if (!isSelfChat) return;

                const text = msg.body?.trim();
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
    // Procesa mensajes que vos mismo enviaste a tu propio número de WhatsApp.
    // Funciona exactamente igual al chat del panel web.

    async _handleSelfMessage(msg, text) {
        try {
            // Chequear comandos de silencio
            if (SILENCE_TRIGGERS.some(r => r.test(text))) {
                this.silenced = true;
                logger.info("WhatsAppBot: silence mode ON (self-chat)");
                await msg.reply("🔇 Modo silencio activado.");
                return;
            }

            if (RESUME_TRIGGERS.some(r => r.test(text))) {
                this.silenced = false;
                logger.info("WhatsAppBot: silence mode OFF (self-chat)");
                await msg.reply("🔊 De vuelta. ¿En qué puedo ayudarte?");
                return;
            }

            if (this.silenced) return;

            logger.info(`WhatsAppBot self-chat → orchestrator: "${text.substring(0, 80)}"`);

            const result = await this.orchestrator(text);
            const reply = result?.reply || "Sin respuesta del sistema.";

            // Responder en el mismo chat (self-chat)
            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot _handleSelfMessage error: ${err.message}`);
            try { await msg.reply("❌ Error interno del sistema."); } catch { }
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
                if (this.debugMode) {
                    logger.warn(`WhatsAppBot: BLOCKED message from ${msg.from} — not in allowed list`);
                    logger.warn(`WhatsAppBot: Allowed numbers are: ${this.allowedNumbers.join(", ")}`);
                    logger.warn(`WhatsAppBot: To fix: add "${msg.from.replace(/@.*/, "")}" to WHATSAPP_ALLOWED_NUMBERS in .env`);
                }
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
                await msg.reply("🔊 De vuelta. ¿En qué puedo ayudarte?");
                return;
            }

            if (this.silenced) {
                logger.info(`WhatsAppBot: silenced — ignoring: "${text.substring(0, 50)}"`);
                return;
            }

            logger.info(`WhatsAppBot → orchestrator: "${text.substring(0, 80)}"`);

            const result = await this.orchestrator(text);
            const reply = result?.reply || "Sin respuesta del sistema.";

            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot handler error: ${err.message}`);
            try { await msg.reply("❌ Error interno del sistema."); } catch { }
        }
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

            if (whisperBin && whisperModel && fs.existsSync(whisperBin)) {
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