/**
 * WhatsAppBot.js — v5
 * ─────────────────────────────────────────────────────────
 * FIX: El bot no respondía porque BotManager llamaba run({action:"start"})
 * pero la clase no tiene método run(). Ahora expone run() correctamente
 * y el método activate() se llama internamente.
 *
 * Para acceso remoto de archivos: usá Google Drive Sync en tu PC.
 * Cualquier archivo que copies a la carpeta de Drive Sync queda disponible
 * automáticamente desde cualquier dispositivo con tu cuenta.
 *
 * Configuración .env:
 *   WHATSAPP_NUMBER=5491160597308
 *   WHATSAPP_ALLOWED_NUMBERS=5491160597308
 * ─────────────────────────────────────────────────────────
 */

const path = require("path");
const fs = require("fs");

let Client, LocalAuth, qrcode;
try {
    ({ Client, LocalAuth } = require("whatsapp-web.js"));
    qrcode = require("qrcode");
} catch (e) {
    // whatsapp-web.js es opcional — bot no arranca pero no rompe el servidor
}

let logger;
try {
    logger = require("../logs/logger");
} catch {
    logger = {
        info: (...a) => console.log("[WhatsAppBot]", ...a),
        warn: (...a) => console.warn("[WhatsAppBot]", ...a),
        error: (...a) => console.error("[WhatsAppBot]", ...a),
    };
}

// fetch compatible con CommonJS
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

class WhatsAppBot {
    constructor() {
        this.name = "WhatsAppBot";
        this.description = "Control remoto vía WhatsApp — IA, archivos y Drive Sync";
        this.active = false;
        this.status = "idle";
        this.client = null;
        this.qrCode = null;
        this.qrExpiry = null;
        this.connected = false;
        this.connectedPhone = null;
        this.lastError = null;
        this.lastRun = null;
        this.runCount = 0;
        this.allowedNumbers = this._loadAllowedNumbers();
    }

    /* ─── run() — requerido por BotManager ─────────── */
    async run(params = {}) {
        const action = params?.action || "start";

        if (action === "start") {
            await this.activate();
            return "WhatsAppBot iniciado — esperá el QR o ya está conectado.";
        }
        if (action === "stop") {
            await this.deactivate();
            return "WhatsAppBot detenido.";
        }
        if (action === "status") {
            return JSON.stringify(this.getStatus(), null, 2);
        }
        return `Acción desconocida: ${action}`;
    }

    /* ─── Cargar números permitidos ─────────────────── */
    _loadAllowedNumbers() {
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        let numbers = raw.split(",").map(n => n.trim().replace(/\D/g, "")).filter(Boolean);

        const self = (process.env.WHATSAPP_NUMBER || "").replace(/\D/g, "");
        if (self && !numbers.includes(self)) {
            numbers.push(self);
            logger.info(`WhatsAppBot: número propio incluido: ${self}`);
        }

        if (numbers.length === 0) {
            logger.warn("WhatsAppBot: sin números configurados — debug mode (acepta todos)");
        }

        return numbers;
    }

    /* ─── Verificar número permitido ────────────────── */
    _isAllowed(rawJid) {
        if (this.allowedNumbers.length === 0) return true;
        const number = rawJid.replace("@c.us", "").replace(/\D/g, "");
        return this.allowedNumbers.some(allowed =>
            number.endsWith(allowed) || allowed.endsWith(number) || number === allowed
        );
    }

    /* ─── Activar bot ───────────────────────────────── */
    async activate() {
        if (this.active) {
            logger.info("WhatsAppBot: ya activo");
            return;
        }

        if (!Client || !LocalAuth) {
            this.lastError = "whatsapp-web.js no está instalado";
            logger.error("WhatsAppBot: npm install whatsapp-web.js qrcode");
            return;
        }

        this.active = true;
        this.status = "working";
        this.lastError = null;

        try {
            logger.info("WhatsAppBot: iniciando cliente...");

            this.client = new Client({
                authStrategy: new LocalAuth({ clientId: "jarvis-whatsapp" }),
                puppeteer: {
                    headless: true,
                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                    ],
                },
            });

            this.client.on("qr", async (qr) => {
                logger.info("WhatsAppBot: QR generado");
                try {
                    this.qrCode = await qrcode.toDataURL(qr);
                    this.qrExpiry = Date.now() + 65000;
                } catch (e) {
                    logger.error("WhatsAppBot: error generando QR:", e.message);
                }
            });

            this.client.on("ready", () => {
                logger.info("WhatsAppBot: ✅ conectado");
                this.connected = true;
                this.qrCode = null;
                this.status = "active";
                this.connectedPhone = this.client.info?.wid?.user || null;
                logger.info(`WhatsAppBot: número: ${this.connectedPhone}`);
            });

            this.client.on("authenticated", () => {
                logger.info("WhatsAppBot: autenticado");
                this.status = "active";
            });

            this.client.on("auth_failure", (msg) => {
                logger.error("WhatsAppBot: auth failure:", msg);
                this.lastError = "Auth failure: " + msg;
                this.status = "error";
                this.connected = false;
            });

            this.client.on("disconnected", (reason) => {
                logger.warn("WhatsAppBot: desconectado:", reason);
                this.connected = false;
                this.status = "working";
                this.connectedPhone = null;
            });

            // ── HANDLER PRINCIPAL ──
            this.client.on("message", async (msg) => {
                await this._handleMessage(msg);
            });

            await this.client.initialize();

        } catch (e) {
            logger.error("WhatsAppBot: error de inicialización:", e.message);
            this.lastError = e.message;
            this.status = "error";
            this.active = false;
        }
    }

    /* ─── Desactivar bot ────────────────────────────── */
    async deactivate() {
        this.active = false;
        this.connected = false;
        this.status = "idle";
        this.qrCode = null;
        if (this.client) {
            try { await this.client.destroy(); } catch { }
            this.client = null;
        }
        logger.info("WhatsAppBot: desactivado");
    }

    /* ─── Manejar mensaje entrante ──────────────────── */
    async _handleMessage(msg) {
        // Filtros básicos
        if (msg.from.endsWith("@g.us")) return;   // grupos
        if (msg.fromMe) return;                     // propios
        if (msg.from === "status@broadcast") return;

        const from = msg.from;
        const body = (msg.body || "").trim();

        logger.info(`WhatsAppBot ← ${from}: "${body.substring(0, 80)}"`);

        if (!this._isAllowed(from)) {
            logger.warn(`WhatsAppBot: número no permitido: ${from}`);
            return;
        }

        this.lastRun = new Date().toISOString();
        this.runCount++;
        this.status = "working";

        try {
            // ── Mover/copiar a Drive Sync ─────────────
            const driveMatch = body.match(/^(?:drive|pasame|mandame|manda|mover?|pasa)\s+(.+?)(?:\s+al?\s+drive)?$/i);
            if (driveMatch || /al?\s+drive/i.test(body)) {
                const filename = (driveMatch ? driveMatch[1] : body)
                    .replace(/al?\s+drive/i, "").trim();
                await this._handleDrive(msg, filename);
                this.status = "active";
                return;
            }

            // ── Listar carpeta ────────────────────────
            if (/^(archivos|listar|lista|ls)\s*/i.test(body)) {
                const folder = body.replace(/^(archivos|listar|lista|ls)\s*/i, "").trim() || ".";
                await this._handleListFiles(msg, folder);
                this.status = "active";
                return;
            }

            // ── Buscar archivo ────────────────────────
            const searchMatch = body.match(/^(?:buscar?|encontrar?|donde\s+(?:esta|está))\s+(.+)/i);
            if (searchMatch) {
                await this._handleSearch(msg, searchMatch[1].trim());
                this.status = "active";
                return;
            }

            // ── Info archivo ──────────────────────────
            const infoMatch = body.match(/^info\s+(.+)/i);
            if (infoMatch) {
                await this._handleFileInfo(msg, infoMatch[1].trim());
                this.status = "active";
                return;
            }

            // ── Mensaje normal → IA ───────────────────
            await this._handleAIMessage(msg, body);

        } catch (e) {
            logger.error(`WhatsAppBot: error: ${e.message}`);
            this.lastError = e.message;
            this.status = "error";
            try { await msg.reply(`⚠ Error: ${e.message}`); } catch { }
        }

        this.status = "active";
    }

    /* ─── IA via /api/chat ──────────────────────────── */
    async _handleAIMessage(msg, body) {
        try {
            const port = process.env.PORT || 3001;
            const response = await fetch(`http://localhost:${port}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: body, source: "whatsapp", from: msg.from }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply || "Sin respuesta del sistema.";

            if (reply.length > 3900) {
                for (const chunk of this._splitMessage(reply, 3900)) {
                    await msg.reply(chunk);
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                await msg.reply(reply);
            }

        } catch (e) {
            logger.error("WhatsAppBot: error llamando /api/chat:", e.message);
            await msg.reply(`⚠ No pude conectarme al sistema.\nError: ${e.message}`);
        }
    }

    /* ─── Mover a Drive Sync ────────────────────────── */
    async _handleDrive(msg, filename) {
        try {
            const port = process.env.PORT || 3001;
            const response = await fetch(`http://localhost:${port}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `pasame el archivo "${filename}" al drive`,
                    source: "whatsapp",
                    from: msg.from,
                }),
            });
            const data = await response.json();
            await msg.reply(data.reply || "Sin respuesta.");
        } catch (e) {
            await msg.reply(`⚠ Error moviendo al Drive: ${e.message}`);
        }
    }

    /* ─── Buscar archivo ────────────────────────────── */
    async _handleSearch(msg, query) {
        try {
            const port = process.env.PORT || 3001;
            const response = await fetch(`http://localhost:${port}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `buscá el archivo "${query}"`,
                    source: "whatsapp",
                    from: msg.from,
                }),
            });
            const data = await response.json();
            await msg.reply(data.reply || "Sin respuesta.");
        } catch (e) {
            await msg.reply(`⚠ Error buscando: ${e.message}`);
        }
    }

    /* ─── Listar carpeta ────────────────────────────── */
    async _handleListFiles(msg, folderPath) {
        let absPath = folderPath;
        if (!path.isAbsolute(folderPath)) {
            absPath = path.resolve(process.env.USERPROFILE || "C:\\Users\\Tobias", folderPath);
        }

        if (!fs.existsSync(absPath)) {
            await msg.reply(`❌ Carpeta no encontrada:\n\`${absPath}\``);
            return;
        }

        try {
            const entries = fs.readdirSync(absPath, { withFileTypes: true });
            const lines = entries.slice(0, 50).map(e =>
                `${e.isDirectory() ? "📁" : "📄"} ${e.name}`
            ).join("\n");

            const extra = entries.length > 50 ? `\n\n_... y ${entries.length - 50} más_` : "";
            await msg.reply(`📂 *${absPath}*\n\n${lines || "(vacía)"}${extra}`);
        } catch (e) {
            await msg.reply(`⚠ Error: ${e.message}`);
        }
    }

    /* ─── Info de archivo ───────────────────────────── */
    async _handleFileInfo(msg, inputPath) {
        let filePath = inputPath.replace(/^["']|["']$/g, "");
        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(process.env.USERPROFILE || "C:\\Users\\Tobias", filePath);
        }

        if (!fs.existsSync(filePath)) {
            await msg.reply(`❌ No encontré:\n\`${filePath}\``);
            return;
        }

        const stat = fs.statSync(filePath);
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
        const modified = stat.mtime.toLocaleString("es-AR");
        const type = stat.isDirectory() ? "Carpeta" : "Archivo";

        await msg.reply(
            `${stat.isDirectory() ? "📁" : "📄"} *${path.basename(filePath)}*\n` +
            `📋 Tipo: ${type}\n` +
            `📦 Tamaño: ${sizeMB} MB\n` +
            `🕐 Modificado: ${modified}\n` +
            `📂 \`${filePath}\``
        );
    }

    /* ─── Helpers ───────────────────────────────────── */
    _splitMessage(text, maxLen) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            let end = start + maxLen;
            if (end < text.length) {
                const nl = text.lastIndexOf("\n", end);
                if (nl > start) end = nl;
            }
            chunks.push(text.slice(start, end));
            start = end;
        }
        return chunks;
    }

    /* ─── API para el frontend / BotManager ─────────── */
    getQRData() {
        return {
            available: !!this.qrCode && Date.now() < (this.qrExpiry || 0),
            qr: this.qrCode,
            status: this.connected ? "connected" : this.active ? "connecting" : "disconnected",
            phone: this.connectedPhone,
            expiresIn: this.qrExpiry ? Math.max(0, Math.round((this.qrExpiry - Date.now()) / 1000)) : 0,
        };
    }

    getStatus() {
        return {
            name: this.name,
            active: this.active,
            connected: this.connected,
            status: this.status,
            phone: this.connectedPhone,
            lastError: this.lastError,
            lastRun: this.lastRun,
            runCount: this.runCount,
            description: this.description,
            allowedNumbers: this.allowedNumbers,
        };
    }
}

module.exports = WhatsAppBot;