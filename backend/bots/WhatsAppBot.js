/**
 * WhatsAppBot.js — Remote control via WhatsApp
 *
 * Features:
 *  - Receives text messages and voice notes from your own number
 *  - Forwards to the LLaMA orchestrator and replies
 *  - SILENCE MODE: say "callate" / "modo silencio" → bot stops responding
 *    Say "responde" / "actívate" / "despertá" → bot resumes
 *  - All .ogg audio transcribed locally with Whisper
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
        this.silenced = false; // 🔇 silence mode flag
        this.sessionDir = path.resolve(__dirname, "../../.wwebjs_auth");
        this.allowedNumbers = this._loadAllowedNumbers();
    }

    /* ── Allowed numbers ─────────────────────────────── */

    _loadAllowedNumbers() {
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        const numbers = raw
            .split(",")
            .map(n => n.trim())
            .filter(Boolean)
            .map(n => `${n}@c.us`);

        if (numbers.length === 0) {
            logger.warn("WhatsAppBot: WHATSAPP_ALLOWED_NUMBERS not set in .env");
        }
        return numbers;
    }

    isAllowed(from) {
        if (this.allowedNumbers.length === 0) return false;
        return this.allowedNumbers.includes(from);
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
        });

        this.client.on("authenticated", () => {
            logger.info("WhatsAppBot: authenticated ✅");
        });

        this.client.on("ready", () => {
            this.ready = true;
            logger.info("WhatsAppBot: ready ✅ Listening for messages...");
        });

        this.client.on("disconnected", (reason) => {
            this.ready = false;
            logger.warn(`WhatsAppBot: disconnected — ${reason}`);
        });

        this.client.on("message", async (msg) => {
            await this._handleMessage(msg);
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
            `Modo silencio: ${this.silenced ? "🔇 activo" : "🔊 inactivo"}`
        ].join("\n");
    }

    /* ── Message handler ────────────────────────────── */

    async _handleMessage(msg) {
        try {
            // Only allowed numbers
            if (!this.isAllowed(msg.from)) return;

            // Skip messages sent by the bot itself
            if (msg.fromMe && !msg.id._serialized.includes("me")) return;

            let text = "";

            if (msg.hasMedia && msg.type === "ptt") {
                // Voice note → transcribe
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
                await msg.reply("🔇 Modo silencio activado. Dile *'responde'* cuando quieras que vuelva.");
                return;
            }

            if (RESUME_TRIGGERS.some(r => r.test(text))) {
                this.silenced = false;
                logger.info("WhatsAppBot: silence mode OFF");
                await msg.reply("🔊 De vuelta. ¿En qué puedo ayudarte?");
                return;
            }

            // ─── Silenced: don't respond ─────────────────────
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

            // Option A: whisper.cpp (fastest)
            const whisperBin = process.env.WHISPER_CPP_PATH;
            const whisperModel = process.env.WHISPER_MODEL_PATH;

            if (whisperBin && whisperModel && fs.existsSync(whisperBin)) {
                const out = execSync(
                    `"${whisperBin}" -m "${whisperModel}" -f "${tmpFile}" --language auto --output-txt 2>/dev/null`,
                    { timeout: 30000, encoding: "utf-8" }
                );
                return out.trim();
            }

            // Option B: Python openai-whisper
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