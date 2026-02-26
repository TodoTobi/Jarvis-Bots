/**
 * WhatsAppBot.js — Remote control via WhatsApp
 *
 * FIXES:
 *  - Added logging of msg.from to debug number format issues
 *  - Fixed fromMe filter (was using incorrect condition)
 *  - Added number normalization before comparison
 *  - Added debug mode that logs all received messages
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
let Client, LocalAuth, qrcode;

function loadDeps() {
    try {
        ({ Client, LocalAuth } = require("whatsapp-web.js"));
        qrcode = require("qrcode-terminal");
        return true;
    } catch {
        logger.warn("WhatsAppBot: whatsapp-web.js not installed. Run: npm install whatsapp-web.js qrcode-terminal");
        return false;
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

        // Debug: log every received message from/to for troubleshooting
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

    /**
     * FIX: Normalize and check both possible formats:
     *   - "5491160597308@c.us"  (standard)
     *   - "549116XXXXXXXX@c.us" (with country+mobile prefix)
     *
     * WhatsApp Web may return the number with or without '9' for mobile numbers.
     * We strip the @c.us suffix and compare the digits portion.
     */
    isAllowed(from) {
        if (this.allowedNumbers.length === 0) return false;

        // Extract just the number part (remove @c.us and any @s.whatsapp.net)
        const fromDigits = from.replace(/@.*/, "").replace(/\D/g, "");

        for (const allowed of this.allowedNumbers) {
            const allowedDigits = allowed.replace(/@.*/, "").replace(/\D/g, "");

            // Direct match
            if (fromDigits === allowedDigits) return true;

            // Try matching without the '9' mobile prefix (AR: 549 vs 54)
            // Some accounts register as 541160XXXXXX instead of 5491160XXXXXX
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

        this.client.on("qr", (qr) => {
            logger.info("WhatsAppBot: QR ready — scan with your phone:");
            console.log("\n========= WHATSAPP QR =========\n");
            qrcode.generate(qr, { small: true });
            console.log("\n================================\n");
            console.log("📱 After scanning, send a message from your phone to test.");
            console.log(`   Configured numbers: ${this.allowedNumbers.join(", ")}`);
        });

        this.client.on("authenticated", () => {
            logger.info("WhatsAppBot: authenticated ✅");
        });

        this.client.on("ready", () => {
            this.ready = true;
            logger.info("WhatsAppBot: ready ✅ Listening for messages...");
            logger.info(`WhatsAppBot: allowed numbers = ${this.allowedNumbers.join(", ")}`);
            logger.info("WhatsAppBot: TIP — if messages aren't received, set WHATSAPP_DEBUG=true in .env to log all message sources");
        });

        this.client.on("disconnected", (reason) => {
            this.ready = false;
            logger.warn(`WhatsAppBot: disconnected — ${reason}`);
        });

        this.client.on("message", async (msg) => {
            // ── FIX: Always log the from field so user can debug number format ──
            if (this.debugMode || !this.isAllowed(msg.from)) {
                logger.info(`WhatsAppBot DEBUG: message from="${msg.from}" fromMe=${msg.fromMe} type="${msg.type}" allowed=${this.isAllowed(msg.from)}`);
            }
            await this._handleMessage(msg);
        });

        // Also listen to message_create to catch self-sent messages (when testing)
        this.client.on("message_create", async (msg) => {
            if (!msg.fromMe) return; // only process our own sent messages if in debug
            if (this.debugMode) {
                logger.info(`WhatsAppBot DEBUG: self-message from="${msg.from}" to="${msg.to}" body="${msg.body?.substring(0, 50)}"`);
            }
        });

        await this.client.initialize();
        return "WhatsAppBot iniciado — escanear QR en la terminal para vincular el teléfono";
    }

    async stop() {
        if (this.client) {
            await this.client.destroy().catch(() => { });
            this.client = null;
            this.ready = false;
            logger.info("WhatsAppBot: stopped");
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
            // FIX: Simplified fromMe check — just skip anything we sent
            if (msg.fromMe) return;

            // Only allowed numbers
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

            // ─── Check for silence / resume commands ────────
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

            // ─── Forward to orchestrator ──────────────────────
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