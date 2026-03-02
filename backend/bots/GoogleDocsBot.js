/**
 * GoogleDocsBot.js — Bot para interactuar con Google Docs
 *
 * SETUP:
 *  1. Google Cloud Console → habilitar Google Docs API + Google Drive API
 *  2. Crear Service Account → descargar JSON → backend/config/google_service_account.json
 *  3. En .env: GOOGLE_SERVICE_ACCOUNT_PATH=./config/google_service_account.json
 *  4. npm install googleapis
 *  5. Compartir cada documento con el client_email de la service account
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");
const path = require("path");
const fs = require("fs");

class GoogleDocsBot extends Bot {
    constructor() {
        super("GoogleDocsBot", "Duplica y edita documentos de Google Docs");
        this.auth = null;
        this.drive = null;
        this.docs = null;
        this._initialized = false;
    }

    /* ══════════════════════════════════════════════════
       RUN — punto de entrada principal (requerido por Bot)
    ══════════════════════════════════════════════════ */

    async run(params = {}) {
        const {
            action = "",
            docId = null,
            docName = null,
            newName = null,
            content = null,
            find = null,
            replace = null,
            title = "Nuevo documento",
            maxResults = 10,
            replaceAll = false,
        } = params;

        const ready = await this._init();
        if (!ready) {
            return "❌ GoogleDocsBot no está configurado.\n\n" +
                "**Setup rápido:**\n" +
                "1. Descargá el JSON de la Service Account de Google Cloud\n" +
                "2. Guardalo como `backend/config/google_service_account.json`\n" +
                "3. En `.env`: `GOOGLE_SERVICE_ACCOUNT_PATH=./config/google_service_account.json`\n" +
                "4. `npm install googleapis`\n" +
                "5. Compartí los docs con el `client_email` del JSON";
        }

        try {
            const act = action.toLowerCase();

            switch (act) {
                case "list_docs":
                case "list":
                    return await this._listDocs({ maxResults });

                case "duplicate_doc":
                case "duplicate":
                    return await this._duplicateDoc({ docId, docName, newName });

                case "read_doc":
                case "read":
                    return await this._readDoc({ docId, docName });

                case "write_doc":
                case "write":
                case "edit_doc":
                case "edit":
                    return await this._writeDoc({ docId, docName, content, replaceAll });

                case "append_doc":
                case "append":
                    return await this._writeDoc({ docId, docName, content, replaceAll: false });

                case "find_replace":
                    return await this._findReplace({ docId, docName, find, replace });

                case "create_doc":
                case "create":
                    return await this._createDoc({ title, content });

                case "get_setup_instructions":
                case "setup":
                    return this._getSetupInstructions();

                default:
                    if (docName || docId) return await this._readDoc({ docId, docName });
                    return await this._listDocs({ maxResults: 5 });
            }
        } catch (err) {
            logger.error(`GoogleDocsBot run error: ${err.message}`);
            throw err;
        }
    }

    /* ── Inicializar cliente de Google ──────────────── */

    async _init() {
        if (this._initialized) return true;
        try {
            const { google } = require("googleapis");

            // Service Account (recomendado)
            const svcPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
                ? path.resolve(__dirname, "../..", process.env.GOOGLE_SERVICE_ACCOUNT_PATH)
                : path.resolve(__dirname, "../../config/google_service_account.json");

            if (fs.existsSync(svcPath)) {
                const serviceAccount = JSON.parse(fs.readFileSync(svcPath, "utf-8"));
                this.auth = new google.auth.GoogleAuth({
                    credentials: serviceAccount,
                    scopes: [
                        "https://www.googleapis.com/auth/drive",
                        "https://www.googleapis.com/auth/documents",
                    ],
                });
                const authClient = await this.auth.getClient();
                this.drive = google.drive({ version: "v3", auth: authClient });
                this.docs = google.docs({ version: "v1", auth: authClient });
                this._initialized = true;
                logger.info("GoogleDocsBot: autenticado con Service Account");
                return true;
            }

            // OAuth2 fallback
            const credsPath = process.env.GOOGLE_CREDENTIALS_PATH
                ? path.resolve(__dirname, "../..", process.env.GOOGLE_CREDENTIALS_PATH)
                : path.resolve(__dirname, "../../config/google_credentials.json");
            const tokenPath = path.resolve(__dirname, "../../config/google_token.json");

            if (fs.existsSync(credsPath) && fs.existsSync(tokenPath)) {
                const credentials = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
                const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
                const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
                const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
                oAuth2Client.setCredentials(token);
                this.drive = google.drive({ version: "v3", auth: oAuth2Client });
                this.docs = google.docs({ version: "v1", auth: oAuth2Client });
                this._initialized = true;
                logger.info("GoogleDocsBot: autenticado con OAuth2");
                return true;
            }

            logger.warn("GoogleDocsBot: sin credenciales de Google.");
            return false;
        } catch (err) {
            logger.error(`GoogleDocsBot _init error: ${err.message}`);
            return false;
        }
    }

    /* ── Listar documentos ──────────────────────────── */

    async _listDocs({ maxResults = 10 } = {}) {
        const res = await this.drive.files.list({
            q: "mimeType='application/vnd.google-apps.document' and trashed=false",
            pageSize: Math.min(maxResults, 20),
            fields: "files(id, name, modifiedTime, webViewLink)",
            orderBy: "modifiedTime desc",
        });
        const files = res.data.files || [];
        if (files.length === 0) {
            return "📄 No encontré documentos. ¿Los compartiste con el email de la service account?";
        }
        const list = files.map((f, i) =>
            `${i + 1}. **${f.name}**\n   ID: \`${f.id}\`\n   🔗 ${f.webViewLink}`
        ).join("\n\n");
        return `📄 **Documentos recientes (${files.length}):**\n\n${list}`;
    }

    /* ── Duplicar documento ─────────────────────────── */

    async _duplicateDoc({ docId, docName, newName } = {}) {
        const targetId = await this._resolveDocId(docId, docName);
        if (!targetId) {
            return `❌ No encontré "${docName || docId}". ¿Está compartido con la service account?`;
        }
        const copyName = newName || (docName ? `Copia de ${docName}` : "Copia del documento");
        const copy = await this.drive.files.copy({
            fileId: targetId,
            requestBody: { name: copyName },
            fields: "id, name, webViewLink",
        });
        return `✅ Documento duplicado:\n📄 **${copy.data.name}**\nID: \`${copy.data.id}\`\n🔗 ${copy.data.webViewLink}`;
    }

    /* ── Leer documento ─────────────────────────────── */

    async _readDoc({ docId, docName } = {}) {
        const targetId = await this._resolveDocId(docId, docName);
        if (!targetId) return `❌ No encontré "${docName || docId}".`;
        const doc = await this.docs.documents.get({ documentId: targetId });
        const text = this._extractText(doc.data);
        const docTitle = doc.data.title || "Sin título";
        const preview = text.length > 2000 ? text.substring(0, 2000) + "\n\n[... truncado]" : text;
        return `📄 **${docTitle}**\n\n${preview || "(Documento vacío)"}`;
    }

    /* ── Escribir en documento ──────────────────────── */

    async _writeDoc({ docId, docName, content, replaceAll = false } = {}) {
        if (!content) return "❌ No indicaste qué texto escribir.";
        const targetId = await this._resolveDocId(docId, docName);
        if (!targetId) return `❌ No encontré "${docName || docId}".`;

        const doc = await this.docs.documents.get({ documentId: targetId });
        const endIndex = this._getEndIndex(doc.data);
        const requests = [];

        if (replaceAll && endIndex > 1) {
            requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
        }
        requests.push({
            insertText: {
                location: { index: replaceAll ? 1 : Math.max(1, endIndex - 1) },
                text: content,
            }
        });

        await this.docs.documents.batchUpdate({
            documentId: targetId,
            requestBody: { requests },
        });

        const actionLabel = replaceAll ? "reemplazado" : "agregado";
        const preview = content.substring(0, 100) + (content.length > 100 ? "..." : "");
        return `✅ Texto ${actionLabel} en **"${doc.data.title || docName}"**.\n📝 "${preview}"`;
    }

    /* ── Buscar y reemplazar ────────────────────────── */

    async _findReplace({ docId, docName, find, replace } = {}) {
        if (!find) return "❌ Indicá el texto a buscar.";
        const targetId = await this._resolveDocId(docId, docName);
        if (!targetId) return `❌ No encontré "${docName || docId}".`;
        await this.docs.documents.batchUpdate({
            documentId: targetId,
            requestBody: {
                requests: [{
                    replaceAllText: {
                        containsText: { text: find, matchCase: false },
                        replaceText: replace || "",
                    }
                }]
            }
        });
        return `✅ Reemplazadas todas las ocurrencias de "${find}" por "${replace || "(vacío)"}" en el documento.`;
    }

    /* ── Crear documento nuevo ──────────────────────── */

    async _createDoc({ title = "Nuevo documento", content } = {}) {
        const doc = await this.docs.documents.create({ requestBody: { title } });
        const docId = doc.data.documentId;
        if (content) {
            await this.docs.documents.batchUpdate({
                documentId: docId,
                requestBody: { requests: [{ insertText: { location: { index: 1 }, text: content } }] }
            });
        }
        const info = await this.drive.files.get({ fileId: docId, fields: "webViewLink" });
        return `✅ Documento creado:\n📄 **${title}**\nID: \`${docId}\`\n🔗 ${info.data.webViewLink}`;
    }

    /* ── Helpers ─────────────────────────────────────── */

    async _resolveDocId(docId, docName) {
        if (docId) return docId;
        if (!docName) return null;
        const safeName = docName.replace(/'/g, "\\'");
        const res = await this.drive.files.list({
            q: `mimeType='application/vnd.google-apps.document' and name contains '${safeName}' and trashed=false`,
            pageSize: 3,
            fields: "files(id, name)",
            orderBy: "modifiedTime desc",
        });
        const files = res.data.files || [];
        return files.length > 0 ? files[0].id : null;
    }

    _extractText(doc) {
        const content = doc.body?.content || [];
        let text = "";
        for (const block of content) {
            if (block.paragraph) {
                for (const el of block.paragraph.elements || []) {
                    if (el.textRun?.content) text += el.textRun.content;
                }
            } else if (block.table) {
                for (const row of block.table.tableRows || []) {
                    for (const cell of row.tableCells || []) {
                        for (const c of cell.content || []) {
                            for (const el of (c.paragraph?.elements || [])) {
                                if (el.textRun?.content) text += el.textRun.content + "\t";
                            }
                        }
                    }
                    text += "\n";
                }
            }
        }
        return text.trim();
    }

    _getEndIndex(doc) {
        const content = doc.body?.content || [];
        if (content.length === 0) return 1;
        const last = content[content.length - 1];
        return last.endIndex || 1;
    }

    _getSetupInstructions() {
        return `📋 **Setup de Google Docs:**\n\n` +
            `1. https://console.cloud.google.com → habilitar **Google Docs API** y **Google Drive API**\n` +
            `2. IAM → Cuentas de servicio → crear → descargar JSON\n` +
            `3. Guardar como \`backend/config/google_service_account.json\`\n` +
            `4. En \`.env\`: \`GOOGLE_SERVICE_ACCOUNT_PATH=./config/google_service_account.json\`\n` +
            `5. \`npm install googleapis\`\n` +
            `6. Compartir cada doc con el \`client_email\` del JSON → Editor`;
    }

    async start() {
        const ok = await this._init();
        return ok ? "GoogleDocsBot listo ✅" : "GoogleDocsBot: sin credenciales";
    }

    async stop() {
        this._initialized = false;
        this.auth = null;
        this.drive = null;
        this.docs = null;
        return "GoogleDocsBot detenido";
    }
}

module.exports = GoogleDocsBot;