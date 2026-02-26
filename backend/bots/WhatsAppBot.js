/**
 * WhatsAppBot.js — Remote control via WhatsApp
 *
 * - Receives text messages and voice notes from WhatsApp
 * - Transcribes audio with Whisper (local)
 * - Forwards to the orchestrator as if sent from the chat
 * - Replies with the result
 *
 * Requires: npm install whatsapp-web.js qrcode-terminal
 * Optional STT: npm install @xenova/transformers (or use whisper.cpp)
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");
const fs = require("fs");
const path = require("path");

let Client, LocalAuth, qrcode;

// Lazy-load so the app doesn't crash if whatsapp-web.js is not installed
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

        // orchestratorCallback(message: string) => Promise<{ reply: string }>
        this.orchestrator = orchestratorCallback;

        this.client = null;
        this.ready = false;
        this.sessionDir = path.resolve(__dirname, "../../.wwebjs_auth");

        // Load allowed numbers from env or config
        this.allowedNumbers = this._loadAllowedNumbers();
    }

    /* =========================
       ALLOWED NUMBERS
    ========================= */

    _loadAllowedNumbers() {
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        const numbers = raw
            .split(",")
            .map(n => n.trim())
            .filter(Boolean)
            .map(n => `${n}@c.us`);

        if (numbers.length === 0) {
            logger.warn("WhatsAppBot: no allowed numbers configured. Set WHATSAPP_ALLOWED_NUMBERS in .env");
        }

        return numbers;
    }

    isAllowed(from) {
        if (this.allowedNumbers.length === 0) return false;
        return this.allowedNumbers.includes(from);
    }

    /* =========================
       STARTUP
    ========================= */

    async run(parameters) {
        const action = parameters?.action || "start";

        if (action === "start") return this.start();
        if (action === "stop") return this.stop();
        if (action === "status") return this.getStatus();

        throw new Error(`WhatsAppBot: unknown action "${action}"`);
    }

    async start() {
        if (!loadDeps()) {
            throw new Error("whatsapp-web.js not installed");
        }

        if (this.client) {
            return "WhatsAppBot ya está corriendo";
        }

        logger.info("WhatsAppBot: starting...");

        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: this.sessionDir }),
            puppeteer: {
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"]
            }
        });

        this.client.on("qr", (qr) => {
            logger.info("WhatsAppBot: scan the QR code to link your phone");
            console.log("\n========== WHATSAPP QR CODE ==========\n");
            qrcode.generate(qr, { small: true });
            console.log("\n======================================\n");
        });

        this.client.on("ready", () => {
            this.ready = true;
            logger.info("WhatsAppBot: connected and ready ✅");
        });

        this.client.on("disconnected", (reason) => {
            this.ready = false;
            logger.warn(`WhatsAppBot: disconnected — ${reason}`);
        });

        this.client.on("message", async (msg) => {
            await this._handleMessage(msg);
        });

        await this.client.initialize();

        return "WhatsAppBot iniciado — esperando QR scan...";
    }

    async stop() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.ready = false;
            logger.info("WhatsAppBot: stopped");
        }
        return "WhatsAppBot detenido";
    }

    getStatus() {
        return `WhatsAppBot: ${this.ready ? "🟢 conectado" : "🔴 desconectado"}`;
    }

    /* =========================
       MESSAGE HANDLER
    ========================= */

    async _handleMessage(msg) {
        try {
            // Security: only allowed numbers
            if (!this.isAllowed(msg.from)) {
                logger.warn(`WhatsAppBot: blocked message from ${msg.from}`);
                return;
            }

            let text = "";

            if (msg.hasMedia && msg.type === "ptt") {
                // Voice note — transcribe
                logger.info("WhatsAppBot: voice note received, transcribing...");
                const media = await msg.downloadMedia();
                text = await this._transcribeAudio(media.data, media.mimetype);

                if (!text) {
                    await msg.reply("❌ No pude transcribir el audio.");
                    return;
                }

                logger.info(`WhatsAppBot STT: "${text}"`);
            } else if (msg.body && typeof msg.body === "string") {
                text = msg.body.trim();
            } else {
                return; // ignore non-text, non-audio
            }

            if (!text) return;

            // Forward to orchestrator
            logger.info(`WhatsAppBot → orchestrator: "${text.substring(0, 80)}"`);

            const result = await this.orchestrator(text);
            const reply = result?.reply || "Sin respuesta del sistema.";

            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot message handler error: ${err.message}`);
            try { await msg.reply("❌ Error interno del sistema."); } catch { }
        }
    }

    /* =========================
       STT — WHISPER LOCAL
       Requires whisper.cpp or Python whisper
       Falls back to a placeholder if not installed
    ========================= */

    async _transcribeAudio(base64Data, mimetype) {
        const audioDir = path.resolve(__dirname, "../../tmp");
        fs.mkdirSync(audioDir, { recursive: true });

        const ext = mimetype?.includes("ogg") ? "ogg" : "mp3";
        const tmpFile = path.join(audioDir, `audio_${Date.now()}.${ext}`);

        try {
            fs.writeFileSync(tmpFile, Buffer.from(base64Data, "base64"));

            // Try whisper.cpp first (fastest, runs locally)
            const whisperPath = process.env.WHISPER_CPP_PATH;
            const modelPath = process.env.WHISPER_MODEL_PATH;

            if (whisperPath && modelPath) {
                const { execSync } = require("child_process");
                const output = execSync(
                    `"${whisperPath}" -m "${modelPath}" -f "${tmpFile}" --language es --output-txt`,
                    { timeout: 30000, encoding: "utf-8" }
                );
                return output.trim();
            }

            // Fallback: Python whisper
            const { execSync } = require("child_process");
            const pyOutput = execSync(
                `python -c "import whisper; m=whisper.load_model('base'); r=m.transcribe('${tmpFile}'); print(r['text'])"`,
                { timeout: 60000, encoding: "utf-8" }
            );
            return pyOutput.trim();

        } catch (err) {
            logger.warn(`WhatsAppBot STT failed: ${err.message}`);
            return "";
        } finally {
            try { fs.unlinkSync(tmpFile); } catch { }
        }
    }
}

module.exports = WhatsAppBot;