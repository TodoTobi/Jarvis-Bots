/**
 * WhatsAppBot.js — v3.0 SELF-CHAT DEFINITIVE FIX
 *
 * PROBLEMA RAÍZ: Cuando mandás un mensaje a tu propio número desde WhatsApp móvil,
 * whatsapp-web.js puede disparar "message" (no solo "message_create").
 * El evento "message" solo se escuchaba para mensajes de OTROS → self-chat ignorado.
 *
 * FIXES v3:
 *  - Listener "message" ahora detecta self-chat (from o to === myNumber)
 *  - Listener "message_create" mejorado con _isSelfChat() unificado
 *  - _numbersMatch() con variantes argentinas completas (549/54/9/sin prefijo)
 *  - ACCEPT_ALL_MESSAGES=true en .env desactiva filtro para debug
 *  - Logging exhaustivo de TODOS los mensajes recibidos
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");
const fs = require("fs");
const path = require("path");

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

let Client, LocalAuth, qrcodeTerminal;

function loadDeps() {
    try {
        ({ Client, LocalAuth } = require("whatsapp-web.js"));
        qrcodeTerminal = require("qrcode-terminal");
        return true;
    } catch {
        logger.warn("WhatsAppBot: whatsapp-web.js no instalado. Ejecutá: npm install whatsapp-web.js qrcode-terminal");
        return false;
    }
}

async function generateBase64QR(qrString) {
    try {
        const QRCode = require("qrcode");
        return await QRCode.toDataURL(qrString);
    } catch {
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
        // Poner ACCEPT_ALL_MESSAGES=true en .env para debug (acepta cualquier número)
        this.acceptAll = process.env.ACCEPT_ALL_MESSAGES === "true";
    }

    /* ── Allowed numbers ─────────────────────────────── */

    _loadAllowedNumbers() {
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        let numbers = raw.split(",").map(n => n.trim()).filter(Boolean);

        // Siempre incluir WHATSAPP_NUMBER como permitido
        const selfNumber = (process.env.WHATSAPP_NUMBER || "").replace(/\D/g, "").replace(/^0+/, "");
        if (selfNumber && !numbers.includes(selfNumber)) {
            numbers.push(selfNumber);
            logger.info(`WhatsAppBot: WHATSAPP_NUMBER incluido como permitido: ${selfNumber}`);
        }

        if (numbers.length === 0) {
            logger.warn("WhatsAppBot: ⚠ Sin números configurados en WHATSAPP_ALLOWED_NUMBERS ni WHATSAPP_NUMBER");
        }
        return numbers;
    }

    _normalizeNumber(raw) {
        return (raw || "")
            .replace(/@.*/, "")
            .replace(/\D/g, "")
            .replace(/^0+/, "");
    }

    _numbersMatch(a, b) {
        const na = this._normalizeNumber(a);
        const nb = this._normalizeNumber(b);
        if (!na || !nb) return false;
        if (na === nb) return true;

        const variants = (n) => {
            const s = new Set([n]);
            if (n.startsWith("549")) s.add("54" + n.slice(3));
            if (n.startsWith("54") && !n.startsWith("549")) s.add("549" + n.slice(2));
            if (n.startsWith("9") && n.length <= 11) { s.add("54" + n); s.add("549" + n.slice(1)); }
            if (!n.startsWith("9") && !n.startsWith("54") && n.length === 10) {
                s.add("54" + n); s.add("549" + n);
            }
            if (n.length >= 8) s.add(n.slice(-8));
            return s;
        };

        const va = variants(na);
        const vb = variants(nb);
        for (const x of va) { if (vb.has(x)) return true; }
        if (na.length >= 8 && nb.length >= 8 && na.slice(-8) === nb.slice(-8)) return true;
        return false;
    }

    isAllowed(from) {
        if (this.acceptAll) return true;
        if (this.allowedNumbers.length === 0) return false;
        return this.allowedNumbers.some(a => this._numbersMatch(from, a));
    }

    _isSelfChat(msg) {
        try {
            const myUser = this.client?.info?.wid?.user;
            if (!myUser) return false;

            // Caso 1: fromMe + destino es mi propio número
            if (msg.fromMe) {
                return this._numbersMatch(msg.to, myUser);
            }

            // Caso 2: el "from" es mi propio número (cuando WhatsApp envía self via "message")
            return this._numbersMatch(msg.from, myUser);
        } catch { return false; }
    }

    /* ── Execute ─────────────────────────────────────── */

    async execute(action, params = {}) {
        if (action === "send_whatsapp") {
            const { number, message } = params;
            if (!this.ready) throw new Error("WhatsAppBot no está conectado");
            const chat = await this.client.getChatById(`${number}@c.us`);
            await chat.sendMessage(message);
            return { reply: `✅ Mensaje enviado a ${number}` };
        }
        if (action === "get_status") return { reply: this.getStatus() };
        throw new Error(`WhatsAppBot: acción desconocida "${action}"`);
    }

    /* ── Start ────────────────────────────────────────── */

    async start() {
        if (!loadDeps()) throw new Error("whatsapp-web.js no está instalado");

        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: this.sessionDir }),
            puppeteer: {
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            },
        });

        this.client.on("qr", async (qr) => {
            logger.info("WhatsAppBot: QR generado");
            if (qrcodeTerminal) qrcodeTerminal.generate(qr, { small: true });
            try {
                const base64 = await generateBase64QR(qr);
                const waRoutes = require("../routes/whatsappRoutes");
                waRoutes.setQR(base64, qr);
            } catch { }
        });

        this.client.on("ready", async () => {
            this.ready = true;
            const myNumber = this.client.info?.wid?.user || "unknown";
            logger.info(`WhatsAppBot: ✅ conectado como +${myNumber}`);

            // Auto-agregar mi número si no hay lista configurada
            if (this.allowedNumbers.length === 0 && myNumber !== "unknown") {
                this.allowedNumbers = [myNumber];
                logger.info(`WhatsAppBot: auto-autorizado: ${myNumber}`);
            }

            try {
                require("../routes/whatsappRoutes").setConnected(myNumber);
            } catch { }
        });

        this.client.on("disconnected", (reason) => {
            this.ready = false;
            logger.warn(`WhatsAppBot: desconectado — ${reason}`);
            try { require("../routes/whatsappRoutes").setDisconnected(); } catch { }
        });

        /* ═══════════════════════════════════════════════
           LISTENER "message" — mensajes recibidos
           Incluye mensajes a uno mismo (self-chat) en
           algunas versiones de whatsapp-web.js
        ═══════════════════════════════════════════════ */
        this.client.on("message", async (msg) => {
            logger.info(`[WA:message] from="${msg.from}" to="${msg.to}" fromMe=${msg.fromMe} type=${msg.type} body="${(msg.body || "").substring(0, 60)}"`);

            if (this._isSelfChat(msg)) {
                logger.info("WhatsAppBot: self-chat detectado via [message]");
                await this._processSelfChat(msg);
                return;
            }

            if (msg.fromMe) return; // eco de mensaje enviado → ignorar
            await this._handleMessage(msg);
        });

        /* ═══════════════════════════════════════════════
           LISTENER "message_create" — todos los mensajes creados
           Captura mensajes enviados por el propio cliente
        ═══════════════════════════════════════════════ */
        this.client.on("message_create", async (msg) => {
            if (!msg.fromMe) return;

            logger.info(`[WA:message_create] from="${msg.from}" to="${msg.to}" type=${msg.type} body="${(msg.body || "").substring(0, 60)}"`);

            if (this._isSelfChat(msg)) {
                logger.info("WhatsAppBot: self-chat detectado via [message_create]");
                await this._processSelfChat(msg);
            }
        });

        await this.client.initialize();
        return "WhatsAppBot iniciado — escaneá el QR en la UI para vincular el teléfono";
    }

    /* ── Procesar self-chat ────────────────────────────── */

    async _processSelfChat(msg) {
        try {
            let text = "";

            if (msg.hasMedia && (msg.type === "ptt" || msg.type === "audio")) {
                logger.info("WhatsAppBot: self-chat audio — transcribiendo...");
                try {
                    const media = await msg.downloadMedia();
                    text = await this._transcribeAudio(media.data, media.mimetype);
                    if (!text) { await msg.reply("❌ No pude transcribir el audio."); return; }
                    logger.info(`WhatsAppBot self-chat STT: "${text}"`);
                } catch (e) {
                    logger.warn(`WhatsAppBot self-chat audio error: ${e.message}`);
                    return;
                }
            } else {
                text = (msg.body || "").trim();
            }

            if (!text) return;

            if (SILENCE_TRIGGERS.some(r => r.test(text))) {
                this.silenced = true;
                await msg.reply("🔇 Silencio activado.");
                return;
            }
            if (RESUME_TRIGGERS.some(r => r.test(text))) {
                this.silenced = false;
                await msg.reply("🔊 Activo y respondiendo.");
                return;
            }
            if (this.silenced) return;

            logger.info(`WhatsAppBot self-chat → orchestrator: "${text.substring(0, 80)}"`);
            const result = await this.orchestrator(text);
            const reply = this._cleanReply(result?.reply || "Sin respuesta del sistema.");
            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot _processSelfChat error: ${err.message}`);
            try { await msg.reply("❌ Error interno."); } catch { }
        }
    }

    /* ── Mensajes de otros ────────────────────────────── */

    async _handleMessage(msg) {
        try {
            if (msg.fromMe) return;

            if (!this.isAllowed(msg.from)) {
                logger.warn(`WhatsAppBot: BLOQUEADO de "${msg.from}" (${this._normalizeNumber(msg.from)})`);
                logger.warn(`WhatsAppBot: Permitidos: ${this.allowedNumbers.join(", ")}`);
                logger.warn(`WhatsAppBot: FIX → en .env: WHATSAPP_ALLOWED_NUMBERS=${this._normalizeNumber(msg.from)}`);
                logger.warn(`WhatsAppBot: O bien: ACCEPT_ALL_MESSAGES=true para debug`);
                return;
            }

            let text = "";
            if (msg.hasMedia && msg.type === "ptt") {
                const media = await msg.downloadMedia();
                text = await this._transcribeAudio(media.data, media.mimetype);
                if (!text) { if (!this.silenced) await msg.reply("❌ No pude transcribir el audio."); return; }
            } else if (msg.body) {
                text = msg.body.trim();
            } else return;

            if (!text) return;

            if (SILENCE_TRIGGERS.some(r => r.test(text))) {
                this.silenced = true;
                await msg.reply("🔇 Modo silencio. Decime *'responde'* para volver.");
                return;
            }
            if (RESUME_TRIGGERS.some(r => r.test(text))) {
                this.silenced = false;
                await msg.reply("🔊 Activo.");
                return;
            }
            if (this.silenced) return;

            logger.info(`WhatsAppBot → orchestrator: "${text.substring(0, 80)}"`);
            const result = await this.orchestrator(text);
            const reply = this._cleanReply(result?.reply || "Sin respuesta.");
            await msg.reply(reply);

        } catch (err) {
            logger.error(`WhatsAppBot _handleMessage error: ${err.message}`);
            try { await msg.reply("❌ Error interno."); } catch { }
        }
    }

    async stop() {
        if (this.client) {
            await this.client.destroy().catch(() => { });
            this.client = null;
            this.ready = false;
            logger.info("WhatsAppBot: detenido");
            try { require("../routes/whatsappRoutes").setDisconnected(); } catch { }
        }
        return "WhatsAppBot detenido";
    }

    getStatus() {
        return [
            `WhatsAppBot: ${this.ready ? "🟢 conectado" : "🔴 desconectado"}`,
            `Silencio: ${this.silenced ? "🔇 ON" : "🔊 OFF"}`,
            `Números permitidos: ${this.allowedNumbers.join(", ") || "(ninguno)"}`,
            `Debug: ${this.debugMode ? "ON" : "OFF"}`,
            `Aceptar todos: ${this.acceptAll ? "✅ SÍ" : "NO"}`
        ].join("\n");
    }

    _cleanReply(text) {
        if (!text) return text;
        const patterns = [
            /^(hola[,!.]?\s*){1,3}/i,
            /^(buenas?\s*(tardes?|noches?|días?)[,!.]?\s*)/i,
            /^(¿en qué (puedo )?ayudarte[,?.]?\s*)/i,
            /^(jarvis aquí[,!.]?\s*)/i,
            /^(claro[,!.]?\s*)/i,
        ];
        let cleaned = text.trim();
        let changed = true;
        while (changed) {
            changed = false;
            for (const p of patterns) {
                const n = cleaned.replace(p, "").trim();
                if (n !== cleaned && n.length > 0) { cleaned = n; changed = true; }
            }
        }
        return cleaned || text;
    }

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

            const groqKey = process.env.GROQ_API_KEY;
            if (groqKey) {
                const FormData = require("form-data");
                const axios = require("axios");
                const form = new FormData();
                form.append("file", fs.createReadStream(tmpFile), { filename: `audio.${ext}` });
                form.append("model", "whisper-large-v3-turbo");
                form.append("language", "es");
                const res = await axios.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    form,
                    { headers: { ...form.getHeaders(), Authorization: `Bearer ${groqKey}` } }
                );
                return res.data?.text?.trim() || "";
            }
            return "";
        } catch (e) {
            logger.warn(`WhatsAppBot _transcribeAudio error: ${e.message}`);
            return "";
        } finally {
            try { fs.unlinkSync(tmpFile); } catch { }
        }
    }
}

module.exports = WhatsAppBot;