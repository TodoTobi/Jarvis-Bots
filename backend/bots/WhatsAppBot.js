/**
 * WhatsAppBot.js — v3 con soporte de archivos via Google Drive
 * ─────────────────────────────────────────────────────────
 * Comandos disponibles desde WhatsApp:
 *   - Cualquier mensaje → Jarvis responde con IA
 *   - "sube [ruta]" → sube archivo a Google Drive y envía link
 *   - "subir [ruta]" → igual
 *   - "archivos" / "listar" → lista archivos en una carpeta
 *   - "drive [ruta]" → sube a Drive
 *
 * Configuración .env:
 *   WHATSAPP_NUMBER=5491160597308
 *   WHATSAPP_ALLOWED_NUMBERS=5491160597308
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 *   GOOGLE_REFRESH_TOKEN=...
 * ─────────────────────────────────────────────────────────
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// Logger simple que no rompe si no existe el módulo
let logger;
try {
    logger = require("../utils/logger");
} catch {
    logger = {
        info: (...a) => console.log("[WhatsAppBot]", ...a),
        warn: (...a) => console.warn("[WhatsAppBot]", ...a),
        error: (...a) => console.error("[WhatsAppBot]", ...a),
    };
}

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
        this.description = "Control remoto vía WhatsApp — mensajes, archivos y Drive";
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
        // Si no hay restricciones, aceptar todo (modo debug)
        if (this.allowedNumbers.length === 0) return true;

        // rawJid ejemplo: "5491160597308@c.us"
        const number = rawJid.replace("@c.us", "").replace(/\D/g, "");

        return this.allowedNumbers.some(allowed => {
            // Comparación flexible: puede tener o no el código de país
            return number.endsWith(allowed) || allowed.endsWith(number) || number === allowed;
        });
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
                this.status = "working"; // intentará reconectar
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
        // Ignorar grupos
        if (msg.from.endsWith("@g.us")) return;
        // Ignorar mensajes propios
        if (msg.fromMe) return;
        // Ignorar status
        if (msg.from === "status@broadcast") return;

        const from = msg.from;
        const body = (msg.body || "").trim();

        logger.info(`WhatsAppBot: mensaje de ${from}: "${body.substring(0, 80)}"`);

        // Verificar número permitido
        if (!this._isAllowed(from)) {
            logger.warn(`WhatsAppBot: número no permitido: ${from}`);
            return;
        }

        this.lastRun = new Date().toISOString();
        this.runCount++;
        this.status = "working";

        try {
            // ── Detectar comando de archivo ──────────────
            const fileMatch = body.match(/^(subi[r]?|drive|subir)\s+(.+)/i);
            if (fileMatch) {
                const filePath = fileMatch[2].trim();
                await this._handleFileUpload(msg, filePath);
                this.status = "active";
                return;
            }

            // ── Detectar lista de carpeta ─────────────────
            if (/^(archivos|listar|lista|ls)\s*/i.test(body)) {
                const folder = body.replace(/^(archivos|listar|lista|ls)\s*/i, "").trim() || ".";
                await this._handleListFiles(msg, folder);
                this.status = "active";
                return;
            }

            // ── Comando normal → IA ───────────────────────
            await this._handleAIMessage(msg, body);

        } catch (e) {
            logger.error(`WhatsAppBot: error manejando mensaje: ${e.message}`);
            this.lastError = e.message;
            this.status = "error";
            try {
                await msg.reply(`⚠ Error: ${e.message}`);
            } catch { }
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

    /* ─── Subir archivo a Google Drive ─────────────── */
    async _handleFileUpload(msg, inputPath) {
        // Normalizar ruta
        let filePath = inputPath.trim().replace(/^["']|["']$/g, "");

        // Si es relativa, resolver desde el directorio del backend
        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(process.cwd(), filePath);
        }

        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            await msg.reply(`❌ Archivo no encontrado:\n\`${filePath}\`\n\nUsá la ruta completa, ejemplo:\n• \`subi C:\\Users\\Tobias\\Downloads\\archivo.pdf\`\n• \`subi ./mi-archivo.exe\``);
            return;
        }

        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;
        const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

        await msg.reply(`📤 Subiendo *${fileName}* (${fileSizeMB} MB) a Google Drive...\n⏳ Esperá un momento.`);

        try {
            const driveLink = await this._uploadToDrive(filePath, fileName);
            await msg.reply(
                `✅ *${fileName}* subido exitosamente!\n\n` +
                `📁 *Google Drive:*\n${driveLink}\n\n` +
                `💡 Podés acceder desde cualquier dispositivo con tu cuenta tv286206@gmail.com`
            );
        } catch (e) {
            logger.error("WhatsAppBot: error subiendo a Drive:", e.message);

            // Si Drive falla, intentar link local (solo funciona en red local)
            await msg.reply(
                `⚠ Error subiendo a Drive: ${e.message}\n\n` +
                `🔧 Verificá que configuraste las credenciales de Google en el .env:\n` +
                `• GOOGLE_CLIENT_ID\n• GOOGLE_CLIENT_SECRET\n• GOOGLE_REFRESH_TOKEN`
            );
        }
    }

    /* ─── Upload real a Google Drive via API ────────── */
    async _uploadToDrive(filePath, fileName) {
        const { google } = require("googleapis");

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            "urn:ietf:wg:oauth:2.0:oob"
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        const drive = google.drive({ version: "v3", auth: oauth2Client });

        // Detectar MIME type
        const mime = this._getMimeType(fileName);

        const fileMetadata = {
            name: fileName,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || "root"],
        };

        const media = {
            mimeType: mime,
            body: fs.createReadStream(filePath),
        };

        logger.info(`WhatsAppBot: subiendo "${fileName}" a Drive...`);

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id, name, webViewLink, webContentLink",
        });

        const file = response.data;

        // Hacer el archivo público (o compartido con el usuario)
        try {
            await drive.permissions.create({
                fileId: file.id,
                requestBody: {
                    role: "reader",
                    type: "user",
                    emailAddress: "tv286206@gmail.com",
                },
            });
        } catch (e) {
            logger.warn("WhatsAppBot: no se pudo asignar permiso:", e.message);
        }

        logger.info(`WhatsAppBot: "${fileName}" subido. Link: ${file.webViewLink}`);
        return file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
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
                `_Para subir un archivo: \`subi [ruta]\`_`
            );
        } catch (e) {
            await msg.reply(`⚠ Error listando carpeta: ${e.message}`);
        }
    }

    /* ─── Helpers ───────────────────────────────────── */
    _getMimeType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const types = {
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt": "application/vnd.ms-powerpoint",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".txt": "text/plain",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".zip": "application/zip",
            ".rar": "application/x-rar-compressed",
            ".exe": "application/octet-stream",
            ".mp4": "video/mp4",
            ".mp3": "audio/mpeg",
        };
        return types[ext] || "application/octet-stream";
    }

    _splitMessage(text, maxLen) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            let end = start + maxLen;
            if (end < text.length) {
                // Cortar en salto de línea si es posible
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