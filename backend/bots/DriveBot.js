/**
 * DriveBot.js — Manejo de archivos locales + Google Drive Sync
 *
 * Estrategia: Google Drive para PC sincroniza una carpeta local automáticamente.
 * Jarvis solo mueve/copia archivos a esa carpeta — Drive hace el resto.
 *
 * Configuración .env:
 *   DRIVE_SYNC_FOLDER=C:\Users\Tobias\Google Drive
 *
 * Acciones disponibles:
 *   move_to_drive   — mover archivo/carpeta a Drive Sync
 *   copy_to_drive   — copiar archivo/carpeta a Drive Sync (original intacto)
 *   move_file       — mover a cualquier destino
 *   copy_file       — copiar a cualquier destino
 *   delete_file     — eliminar archivo o carpeta
 *   create_folder   — crear carpeta
 *   create_file     — crear archivo con contenido
 *   search          — buscar archivos por nombre/tipo/ubicación
 *   list_drive      — listar contenido de la carpeta Drive Sync
 */

const Bot = require("./Bot");
const path = require("path");
const fs = require("fs");
const logger = require("../logs/logger");

// Extensiones que son accesos directos — siempre ignorados al mover
const SHORTCUT_EXTENSIONS = new Set([".lnk", ".url", ".desktop"]);

// Carpetas del sistema que nunca tocar
const SYSTEM_FOLDERS = new Set([
    "windows", "system32", "syswow64", "program files",
    "program files (x86)", "programdata", "appdata"
]);

class DriveBot extends Bot {
    constructor() {
        super("DriveBot", "Manejo de archivos locales y sincronización con Google Drive Sync");
        this.driveFolder = this._resolveDriveFolder();
    }

    /* ── Resolver carpeta de Drive Sync ─────────────── */
    _resolveDriveFolder() {
        const envFolder = process.env.DRIVE_SYNC_FOLDER;
        if (envFolder && fs.existsSync(envFolder)) {
            logger.info(`DriveBot: Drive Sync folder → ${envFolder}`);
            return envFolder;
        }

        // Auto-detectar carpetas comunes de Drive Sync en Windows
        const userProfile = process.env.USERPROFILE || "C:\\Users\\Tobias";
        const candidates = [
            path.join(userProfile, "Google Drive"),
            path.join(userProfile, "GoogleDrive"),
            path.join(userProfile, "Mi unidad"),
            "C:\\Google Drive",
            "D:\\Google Drive",
        ];

        for (const c of candidates) {
            if (fs.existsSync(c)) {
                logger.info(`DriveBot: Drive Sync auto-detectada → ${c}`);
                return c;
            }
        }

        if (envFolder) {
            logger.warn(`DriveBot: DRIVE_SYNC_FOLDER="${envFolder}" no existe aún — se creará al usarla`);
            return envFolder;
        }

        logger.warn("DriveBot: carpeta Drive Sync no encontrada. Configurá DRIVE_SYNC_FOLDER en .env");
        return null;
    }

    /* ══════════════════════════════════════════════════
       RUN — punto de entrada
    ══════════════════════════════════════════════════ */

    async run(params = {}) {
        const action = (params.action || "").toLowerCase();

        switch (action) {
            case "move_to_drive":
                return await this._moveToDrive(params);
            case "copy_to_drive":
                return await this._copyToDrive(params);
            case "move_file":
                return await this._moveFile(params);
            case "copy_file":
                return await this._copyFile(params);
            case "delete_file":
                return await this._deleteFile(params);
            case "create_folder":
                return await this._createFolder(params);
            case "create_file":
                return await this._createFile(params);
            case "search":
                return await this._search(params);
            case "list_drive":
                return await this._listDrive(params);
            default:
                throw new Error(`DriveBot: acción desconocida "${action}". Usá: move_to_drive, copy_to_drive, search, list_drive, move_file, copy_file, delete_file, create_folder, create_file`);
        }
    }

    /* ── MOVER A DRIVE ──────────────────────────────── */

    async _moveToDrive({ source, filename, subfolder, location, skipShortcuts = true } = {}) {
        const driveOk = this._checkDriveFolder();
        if (driveOk !== true) return driveOk;

        // Buscar por filename con fuzzy matching y soporte de carpeta específica
        let sourcePath = source;
        if (!sourcePath && filename) {
            const { filename: parsedName, location: parsedLoc } = this._parseFilenameAndLocation(filename);
            const resolvedLoc = location || parsedLoc;
            const found = await this._findFile(parsedName, resolvedLoc);
            if (!found) {
                const locHint = resolvedLoc ? " en " + resolvedLoc + "" : " en la PC";
                return "❌ No encontré ningún archivo parecido a " + parsedName + "" + locHint + ".\n\n💡 Indicá la carpeta: 'pasame 21.mp4 desde Desktop al drive'";
            }
            sourcePath = found;
        }
        if (!sourcePath) return "❌ Indicá el archivo o su nombre. Ej: 'pasame tarea.pdf al drive'";

        // Resolver ruta
        sourcePath = this._resolvePath(sourcePath);
        if (!fs.existsSync(sourcePath)) {
            return `❌ El archivo no existe:\n\`${sourcePath}\``;
        }

        // Filtrar accesos directos
        if (skipShortcuts && this._isShortcut(sourcePath)) {
            return `⚠ "${path.basename(sourcePath)}" es un acceso directo (.lnk/.url) y no se movió.\nSi querés mover el archivo real, buscalo en su ubicación original.`;
        }

        const dest = this._buildDestPath(sourcePath, subfolder);
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        const stat = fs.statSync(sourcePath);
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

        if (stat.isDirectory()) {
            this._copyDirSync(sourcePath, dest, skipShortcuts);
            fs.rmSync(sourcePath, { recursive: true, force: true });
            return `✅ Carpeta movida a Drive Sync:\n📁 **${path.basename(sourcePath)}**\n📂 ${dest}\n\n☁️ Drive la subirá automáticamente.`;
        } else {
            fs.renameSync(sourcePath, dest);
            return `✅ Archivo movido a Drive Sync:\n📄 **${path.basename(sourcePath)}** (${sizeMB} MB)\n📂 ${dest}\n\n☁️ Drive lo subirá automáticamente.`;
        }
    }

    /* ── COPIAR A DRIVE ─────────────────────────────── */

    async _copyToDrive({ source, filename, subfolder, location, skipShortcuts = true } = {}) {
        const driveOk = this._checkDriveFolder();
        if (driveOk !== true) return driveOk;

        let sourcePath = source;
        if (!sourcePath && filename) {
            const { filename: parsedName, location: parsedLoc } = this._parseFilenameAndLocation(filename);
            const resolvedLoc = location || parsedLoc;
            const found = await this._findFile(parsedName, resolvedLoc);
            if (!found) {
                const locHint = resolvedLoc ? " en " + resolvedLoc + "" : " en la PC";
                return "❌ No encontré ningún archivo parecido a " + parsedName + "" + locHint + ".";
            }
            sourcePath = found;
        }
        if (!sourcePath) return "❌ Indicá el archivo o su nombre.";

        sourcePath = this._resolvePath(sourcePath);
        if (!fs.existsSync(sourcePath)) {
            return `❌ El archivo no existe:\n\`${sourcePath}\``;
        }

        if (skipShortcuts && this._isShortcut(sourcePath)) {
            return `⚠ "${path.basename(sourcePath)}" es un acceso directo y no se copió.`;
        }

        const dest = this._buildDestPath(sourcePath, subfolder);
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        const stat = fs.statSync(sourcePath);
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

        if (stat.isDirectory()) {
            this._copyDirSync(sourcePath, dest, skipShortcuts);
            return `✅ Carpeta copiada a Drive Sync (original intacto):\n📁 **${path.basename(sourcePath)}**\n📂 ${dest}\n\n☁️ Drive la subirá automáticamente.`;
        } else {
            fs.copyFileSync(sourcePath, dest);
            return `✅ Archivo copiado a Drive Sync (original intacto):\n📄 **${path.basename(sourcePath)}** (${sizeMB} MB)\n📂 ${dest}\n\n☁️ Drive lo subirá automáticamente.`;
        }
    }

    /* ── MOVER ARCHIVO GENÉRICO ─────────────────────── */

    async _moveFile({ source, destination } = {}) {
        if (!source) return "❌ Indicá el archivo de origen.";
        if (!destination) return "❌ Indicá el destino.";

        const src = this._resolvePath(source);
        const dest = this._resolvePath(destination);

        if (!fs.existsSync(src)) return `❌ No existe:\n\`${src}\``;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(src, dest);

        return `✅ Movido:\n📄 ${path.basename(src)}\n  de: ${path.dirname(src)}\n  a:  ${dest}`;
    }

    /* ── COPIAR ARCHIVO GENÉRICO ────────────────────── */

    async _copyFile({ source, destination } = {}) {
        if (!source) return "❌ Indicá el archivo de origen.";
        if (!destination) return "❌ Indicá el destino.";

        const src = this._resolvePath(source);
        const dest = this._resolvePath(destination);

        if (!fs.existsSync(src)) return `❌ No existe:\n\`${src}\``;
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            this._copyDirSync(src, dest, false);
        } else {
            fs.copyFileSync(src, dest);
        }

        return `✅ Copiado:\n📄 ${path.basename(src)}\n  de: ${path.dirname(src)}\n  a:  ${dest}`;
    }

    /* ── ELIMINAR ───────────────────────────────────── */

    async _deleteFile({ source, filename } = {}) {
        let targetPath = source;
        if (!targetPath && filename) {
            const found = await this._findFile(filename);
            if (!found) return `❌ No encontré "${filename}".`;
            targetPath = found;
        }
        if (!targetPath) return "❌ Indicá el archivo a eliminar.";

        targetPath = this._resolvePath(targetPath);

        // Protección anti-sistema
        const lower = targetPath.toLowerCase();
        if (SYSTEM_FOLDERS.has(path.basename(lower)) || lower.includes("\\windows\\")) {
            return `🚫 No puedo eliminar esa ubicación (carpeta del sistema protegida).`;
        }

        if (!fs.existsSync(targetPath)) return `❌ No existe:\n\`${targetPath}\``;

        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return `✅ Carpeta eliminada:\n📁 ${targetPath}`;
        } else {
            fs.unlinkSync(targetPath);
            return `✅ Archivo eliminado:\n📄 ${targetPath}`;
        }
    }

    /* ── CREAR CARPETA ──────────────────────────────── */

    async _createFolder({ destination, name } = {}) {
        let folderPath = destination;
        if (!folderPath && name) {
            // Crear en Drive Sync si no se especificó destino
            if (this.driveFolder) {
                folderPath = path.join(this.driveFolder, name);
            } else {
                return "❌ Indicá la ruta completa donde crear la carpeta.";
            }
        }
        if (!folderPath) return "❌ Indicá el nombre o ruta de la carpeta.";

        folderPath = this._resolvePath(folderPath);
        fs.mkdirSync(folderPath, { recursive: true });
        return `✅ Carpeta creada:\n📁 ${folderPath}`;
    }

    /* ── CREAR ARCHIVO ──────────────────────────────── */

    async _createFile({ destination, filename, content = "", inDrive = false } = {}) {
        let filePath = destination;

        if (!filePath) {
            if (!filename) return "❌ Indicá el nombre del archivo a crear.";
            const base = inDrive && this.driveFolder ? this.driveFolder : process.cwd();
            filePath = path.join(base, filename);
        }

        filePath = this._resolvePath(filePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");

        return `✅ Archivo creado:\n📄 ${filePath}\n📝 ${content.length} caracteres`;
    }

    /* ── BÚSQUEDA ───────────────────────────────────── */

    async _search({ query, type, location, maxResults = 20 } = {}) {
        if (!query) return "❌ Indicá qué buscar. Ej: 'buscá tarea.pdf'";

        const searchRoot = location
            ? this._resolvePath(location)
            : (process.env.USERPROFILE || "C:\\Users\\Tobias");

        if (!fs.existsSync(searchRoot)) {
            return `❌ La carpeta de búsqueda no existe:\n\`${searchRoot}\``;
        }

        logger.info(`DriveBot: buscando "${query}" en "${searchRoot}"`);

        const results = [];
        const queryLower = query.toLowerCase().replace(/\s+/g, "");

        this._walkSearch(searchRoot, queryLower, type, results, maxResults, 0);

        if (results.length === 0) {
            return `🔍 No encontré archivos con "${query}" en \`${searchRoot}\`.\n\nProbá con:\n• Otra ubicación: "buscá X en C:\\Users\\Tobias\\Downloads"\n• Otro nombre o parte del nombre`;
        }

        // Ordenar por score de similitud descendente
        results.sort((a, b) => (b.score || 0) - (a.score || 0));

        const lines = results.map((r, i) => {
            const icon = r.isDir ? "📁" : "📄";
            const size = r.isDir ? "" : ` (${(r.size / 1024 / 1024).toFixed(2)} MB)`;
            return `${i + 1}. ${icon} **${r.name}**${size}\n   📂 ${r.dir}`;
        }).join("\n\n");

        return `🔍 **Resultados para "${query}" (${results.length}):**\n\n${lines}\n\n💡 Para mover al Drive: "pasame [nombre] al drive"`;
    }

    /* ── LISTAR DRIVE ───────────────────────────────── */

    async _listDrive({ subfolder } = {}) {
        const driveOk = this._checkDriveFolder();
        if (driveOk !== true) return driveOk;

        const targetDir = subfolder
            ? path.join(this.driveFolder, subfolder)
            : this.driveFolder;

        if (!fs.existsSync(targetDir)) {
            return `❌ No existe la subcarpeta:\n\`${targetDir}\``;
        }

        try {
            const entries = fs.readdirSync(targetDir, { withFileTypes: true });
            if (entries.length === 0) return `📂 Drive Sync vacío:\n\`${targetDir}\``;

            const lines = entries.map(e => {
                const icon = e.isDirectory() ? "📁" : "📄";
                let size = "";
                if (!e.isDirectory()) {
                    try {
                        const s = fs.statSync(path.join(targetDir, e.name)).size;
                        size = ` (${(s / 1024 / 1024).toFixed(2)} MB)`;
                    } catch { }
                }
                return `${icon} ${e.name}${size}`;
            }).join("\n");

            return `📂 **Google Drive Sync** (${entries.length} elementos):\n\`${targetDir}\`\n\n${lines}`;
        } catch (e) {
            return `⚠ Error listando Drive: ${e.message}`;
        }
    }

    /* ══════════════════════════════════════════════════
       HELPERS INTERNOS
    ══════════════════════════════════════════════════ */

    _checkDriveFolder() {
        if (!this.driveFolder) {
            return `❌ Carpeta de Google Drive Sync no configurada.\n\nAgregá en **.env**:\n\`DRIVE_SYNC_FOLDER=C:\\Users\\Tobias\\Google Drive\`\n\nY asegurate de tener instalado **Google Drive para PC**.`;
        }
        if (!fs.existsSync(this.driveFolder)) {
            try {
                fs.mkdirSync(this.driveFolder, { recursive: true });
                logger.info(`DriveBot: creada carpeta Drive Sync: ${this.driveFolder}`);
            } catch (e) {
                return `❌ No se pudo acceder a la carpeta Drive Sync:\n\`${this.driveFolder}\`\n\nError: ${e.message}`;
            }
        }
        return true;
    }

    _resolvePath(p) {
        if (!p) return "";
        p = p.trim().replace(/^["']|["']$/g, "");
        if (path.isAbsolute(p)) return p;
        // Relativo al perfil del usuario si no es absoluto
        const userProfile = process.env.USERPROFILE || "C:\\Users\\Tobias";
        return path.resolve(userProfile, p);
    }

    _buildDestPath(sourcePath, subfolder) {
        const name = path.basename(sourcePath);
        if (subfolder) {
            return path.join(this.driveFolder, subfolder, name);
        }
        return path.join(this.driveFolder, name);
    }

    _isShortcut(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return SHORTCUT_EXTENSIONS.has(ext);
    }

    _copyDirSync(src, dest, skipShortcuts) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (skipShortcuts && this._isShortcut(srcPath)) continue;
            if (entry.isDirectory()) {
                this._copyDirSync(srcPath, destPath, skipShortcuts);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /** Buscar recursivamente, evitando carpetas del sistema */
    /* ── Calcular similitud fuzzy entre dos strings (0-1) ─── */
    _fuzzyScore(query, name) {
        const q = query.toLowerCase().replace(/\s+/g, "");
        const n = name.toLowerCase().replace(/\s+/g, "");
        const nNoExt = n.replace(/\.[^.]+$/, "");

        // Coincidencia exacta = máxima prioridad
        if (n === q || nNoExt === q) return 1.0;

        // El nombre contiene la query completa
        if (n.includes(q) || nNoExt.includes(q)) return 0.85;

        // La query contiene el nombre (sin extensión)
        if (q.includes(nNoExt) && nNoExt.length > 1) return 0.75;

        // Coincidencia por palabras individuales de la query
        const qParts = q.split(/[\s\-_()[\]]+/).filter(p => p.length > 1);
        const nParts = n.split(/[\s\-_()[\]]+/).filter(p => p.length > 1);
        if (qParts.length > 0) {
            const matchedParts = qParts.filter(qp =>
                nParts.some(np => np.includes(qp) || qp.includes(np))
            );
            if (matchedParts.length > 0) {
                return 0.5 * (matchedParts.length / qParts.length);
            }
        }

        // Coincidencia por prefijo
        if (n.startsWith(q) || nNoExt.startsWith(q)) return 0.6;
        if (q.startsWith(nNoExt) && nNoExt.length > 1) return 0.55;

        // Coincidencia parcial mínima
        if (n.includes(q.substring(0, Math.max(2, Math.floor(q.length * 0.6))))) return 0.3;

        return 0;
    }

    _walkSearch(dir, queryLower, type, results, maxResults, depth) {
        if (results.length >= maxResults || depth > 8) return;

        // Evitar carpetas del sistema
        const dirBase = path.basename(dir).toLowerCase();
        if (SYSTEM_FOLDERS.has(dirBase)) return;
        if (dirBase === "node_modules" || dirBase === ".git") return;

        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch { return; }

        for (const entry of entries) {
            if (results.length >= maxResults) break;

            const entryPath = path.join(dir, entry.name);
            const nameLower = entry.name.toLowerCase();

            // Saltar accesos directos en búsqueda
            if (this._isShortcut(entryPath)) continue;

            // Calcular score fuzzy
            const score = this._fuzzyScore(queryLower, nameLower);
            const matches = score > 0;

            if (matches) {
                // Filtrar por tipo si se especificó
                const ext = path.extname(entry.name).toLowerCase();
                const isDir = entry.isDirectory();

                if (type) {
                    const t = type.toLowerCase();
                    if (t === "folder" || t === "carpeta") {
                        if (!isDir) continue;
                    } else if (!ext.includes(t) && !entry.name.toLowerCase().includes(t)) {
                        continue;
                    }
                }

                let size = 0;
                if (!isDir) {
                    try { size = fs.statSync(entryPath).size; } catch { }
                }

                results.push({
                    name: entry.name,
                    path: entryPath,
                    dir: path.dirname(entryPath),
                    isDir,
                    size,
                    ext,
                    score,
                });
            }

            // Continuar búsqueda recursiva en subcarpetas
            if (entry.isDirectory()) {
                this._walkSearch(entryPath, queryLower, type, results, maxResults, depth + 1);
            }
        }
    }

    /**
     * Buscar UN archivo con fuzzy matching.
     * Si se pasa `location`, busca sólo dentro de esa carpeta (Desktop, Downloads, etc).
     * Devuelve el path del archivo con mayor score de similitud.
     */
    async _findFile(filename, location = null) {
        const userProfile = process.env.USERPROFILE || "C:\\Users\\Tobias";

        // Mapear nombres comunes de carpetas a rutas reales
        const FOLDER_MAP = {
            "desktop":    path.join(userProfile, "Desktop"),
            "escritorio": path.join(userProfile, "Desktop"),
            "downloads":  path.join(userProfile, "Downloads"),
            "descargas":  path.join(userProfile, "Downloads"),
            "documents":  path.join(userProfile, "Documents"),
            "documentos": path.join(userProfile, "Documents"),
            "pictures":   path.join(userProfile, "Pictures"),
            "imágenes":   path.join(userProfile, "Pictures"),
            "imagenes":   path.join(userProfile, "Pictures"),
            "videos":     path.join(userProfile, "Videos"),
            "music":      path.join(userProfile, "Music"),
            "música":     path.join(userProfile, "Music"),
            "musica":     path.join(userProfile, "Music"),
        };

        // Determinar raíz de búsqueda
        let searchRoot = userProfile;
        if (location) {
            const locKey = location.toLowerCase().trim();
            if (FOLDER_MAP[locKey]) {
                searchRoot = FOLDER_MAP[locKey];
            } else if (fs.existsSync(location)) {
                searchRoot = location;
            } else {
                // Probar como ruta relativa al perfil
                const resolved = path.join(userProfile, location);
                if (fs.existsSync(resolved)) searchRoot = resolved;
            }
        }

        // Buscar con score fuzzy, trayendo hasta 20 resultados para elegir el mejor
        const results = [];
        const queryLower = filename.toLowerCase();
        this._walkSearch(searchRoot, queryLower, null, results, 20, 0);

        if (results.length === 0) return null;

        // Ordenar por score descendente — devolver el mejor
        results.sort((a, b) => (b.score || 0) - (a.score || 0));
        return results[0].path;
    }

    /**
     * Resolver carpeta de búsqueda para _moveToDrive / _copyToDrive.
     * Extrae "location" del nombre de archivo si el usuario escribe
     * algo como "Desktop/21 (1).mp4" o "21 desde Desktop".
     */
    _parseFilenameAndLocation(raw) {
        if (!raw) return { filename: raw, location: null };

        // "archivo desde carpeta" o "archivo en carpeta"
        const fromMatch = raw.match(/^(.+?)\s+(?:desde|en|from|en el|desde el)\s+(.+)$/i);
        if (fromMatch) {
            return { filename: fromMatch[1].trim(), location: fromMatch[2].trim() };
        }

        // "carpeta/archivo"
        if (raw.includes("/") || raw.includes("\\")) {
            const parts = raw.replace(/\\/g, "/").split("/");
            if (parts.length >= 2) {
                return {
                    filename: parts[parts.length - 1].trim(),
                    location: parts.slice(0, -1).join("/").trim(),
                };
            }
        }

        return { filename: raw, location: null };
    }
}

module.exports = DriveBot;