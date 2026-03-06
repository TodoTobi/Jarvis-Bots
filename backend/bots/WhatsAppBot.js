/**
 * WhatsAppBot.js — v4 sin Google Drive API
 * ─────────────────────────────────────────────────────────
 * Comandos disponibles desde WhatsApp:
 *   - Cualquier mensaje → Jarvis responde con IA
 *   - "archivos [carpeta]" / "listar [carpeta]" / "ls [carpeta]" → lista carpeta
 *   - "info [ruta]" → info de un archivo (tamaño, fecha)
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

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs");

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

// Importar fetch de forma compatible
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

class WhatsAppBot {
    constructor() {
        this.name = "WhatsAppBot";
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
        this.description = "Control remoto vía WhatsApp — mensajes de texto y voz";
    }

    /* ─── Cargar números permitidos ─────────────────── */
    _loadAllowedNumbers() {
        const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
        let numbers = raw.split(",").map(n => n.trim().replace(/\D/g, "")).filter(Boolean);

        // Siempre incluir el número propio
        const self = (process.env.WHATSAPP_NUMBER || "").replace(/\D/g, "");
        if (self && !numbers.includes(self)) {
            numbers.push(self);
            logger.info(`WhatsAppBot: número propio incluido como permitido: ${self}`);
        }

        if (numbers.length === 0) {
            logger.warn("WhatsAppBot: ⚠ Sin números configurados — aceptará todos los mensajes en debug");
        }

        return numbers;
    }

    /* ─── Verificar si un número está permitido ─────── */
    _isAllowed(rawJid) {
        if (this.allowedNumbers.length === 0) return true;
        const number = rawJid.replace("@c.us", "").replace(/\D/g, "");
        return this.allowedNumbers.some(allowed =>
            number.endsWith(allowed) || allowed.endsWith(number) || number === allowed
        );
    }

    /* ─── Activar bot ───────────────────────────────── */
    async activate() {
        if (this.active) return;
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

            /* ── Eventos ── */
            this.client.on("qr", async (qr) => {
                logger.info("WhatsAppBot: QR generado");
                try {
                    this.qrCode = await qrcode.toDataURL(qr);
                    this.qrExpiry = Date.now() + 60000;
                    this.status = "working";
                } catch (e) {
                    logger.error("WhatsAppBot: error generando QR:", e.message);
                }
            });

            this.client.on("ready", () => {
                logger.info("WhatsAppBot: ✅ conectado");
                this.connected = true;
                this.qrCode = null;
                this.status = "active";
                const info = this.client.info;
                this.connectedPhone = info?.wid?.user || null;
                logger.info(`WhatsAppBot: número conectado: ${this.connectedPhone}`);
            });

            this.client.on("authenticated", () => {
                logger.info("WhatsAppBot: autenticado (sesión guardada)");
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

            /* ── Mensaje recibido ── */
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
        if (msg.from.endsWith("@g.us")) return;
        if (msg.fromMe) return;
        if (msg.from === "status@broadcast") return;

        const from = msg.from;
        const body = (msg.body || "").trim();

        logger.info(`WhatsAppBot: mensaje de ${from}: "${body.substring(0, 80)}"`);

        if (!this._isAllowed(from)) {
            logger.warn(`WhatsAppBot: número no permitido: ${from}`);
            return;
        }

        this.lastRun = new Date().toISOString();
        this.runCount++;
        this.status = "working";

        try {
            // ── Listar archivos de carpeta ────────────────
            if (/^(archivos|listar|lista|ls)\s*/i.test(body)) {
                const folder = body.replace(/^(archivos|listar|lista|ls)\s*/i, "").trim() || ".";
                await this._handleListFiles(msg, folder);
                this.status = "active";
                return;
            }

            // ── Info de archivo ───────────────────────────
            const infoMatch = body.match(/^info\s+(.+)/i);
            if (infoMatch) {
                await this._handleFileInfo(msg, infoMatch[1].trim());
                this.status = "active";
                return;
            }

            // ── Comando normal → IA ───────────────────────
            await this._handleAIMessage(msg, body);

        } catch (e) {
            logger.error(`WhatsAppBot: error manejando mensaje: ${e.message}`);
            this.lastError = e.message;
            this.status = "error";
            try { await msg.reply(`⚠ Error: ${e.message}`); } catch { }
        }

        this.status = "active";
    }

    /* ─── IA: enviar a /api/chat ────────────────────── */
    async _handleAIMessage(msg, body) {
        try {
            const response = await fetch("http://localhost:3001/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: body,
                    source: "whatsapp",
                    from: msg.from,
                }),
            });

            const data = await response.json();
            const reply = data.reply || "Sin respuesta del sistema.";

            // WhatsApp tiene límite de ~4000 chars
            if (reply.length > 3900) {
                const chunks = this._splitMessage(reply, 3900);
                for (const chunk of chunks) {
                    await msg.reply(chunk);
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                await msg.reply(reply);
            }

        } catch (e) {
            logger.error("WhatsAppBot: error llamando a /api/chat:", e.message);
            await msg.reply("⚠ No pude conectarme al sistema. ¿Está el backend corriendo?");
        }
    }

    /* ─── Info de archivo ───────────────────────────── */
    async _handleFileInfo(msg, inputPath) {
        let filePath = inputPath.replace(/^["']|["']$/g, "");
        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(process.cwd(), filePath);
        }

        if (!fs.existsSync(filePath)) {
            await msg.reply(`❌ No encontré:\n\`${filePath}\``);
            return;
        }

        const stat = fs.statSync(filePath);
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
        const modified = stat.mtime.toLocaleString("es-AR");

        await msg.reply(
            `📄 *${path.basename(filePath)}*\n` +
            `📦 Tamaño: ${sizeMB} MB\n` +
            `🕐 Modificado: ${modified}\n` +
            `📂 Ruta: \`${filePath}\`\n\n` +
            `💡 Para acceder remotamente, copiá el archivo a tu carpeta de Google Drive Sync en la PC.`
        );
    }

    /* ─── Listar archivos de una carpeta ────────────── */
    async _handleListFiles(msg, folderPath) {
        let absPath = folderPath;
        if (!path.isAbsolute(folderPath)) {
            absPath = path.resolve(process.cwd(), folderPath);
        }

        if (!fs.existsSync(absPath)) {
            await msg.reply(`❌ Carpeta no encontrada:\n\`${absPath}\``);
            return;
        }

        try {
            const entries = fs.readdirSync(absPath, { withFileTypes: true });
            const files = entries
                .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
                .join("\n");

            await msg.reply(
                `📂 *${absPath}*\n\n${files || "(carpeta vacía)"}\n\n` +
                `_Para acceder un archivo remotamente, copialo a Google Drive Sync._`
            );
        } catch (e) {
            await msg.reply(`⚠ Error listando carpeta: ${e.message}`);
        }
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

    /* ─── API para el frontend ──────────────────────── */
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