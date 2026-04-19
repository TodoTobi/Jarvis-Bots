/**
 * TerminalBot.js — Ejecuta comandos de terminal, crea scripts y archivos
 *
 * Capacidades:
 *  - Ejecutar comandos en la terminal del sistema
 *  - Crear archivos/scripts en rutas específicas
 *  - Ejecutar scripts recién creados
 *  - Listar directorios
 *  - Instalar paquetes npm/pip
 *
 * Seguridad:
 *  - Requiere COMPUTER_CONTROL_ENABLED=true
 *  - Lista de comandos bloqueados
 *  - Timeout de ejecución
 */

const Bot = require("./Bot");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const logger = require("../logs/logger");

// Comandos peligrosos bloqueados
const BLOCKED_PATTERNS = [
    /^rm\s+-rf\s+\//,
    /format\s+c:/i,
    /del\s+\/[sq].*system32/i,
    /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
    /shutdown\s+\/[srf]/i,
    /rmdir\s+.*system/i,
    /dd\s+if=.*of=\/dev\/[sh]d[a-z]/,
];

class TerminalBot extends Bot {
    constructor() {
        super("TerminalBot", "Ejecuta comandos de terminal, crea scripts y archivos");
        this.enabled = process.env.COMPUTER_CONTROL_ENABLED === "true";
        this.defaultWorkdir = process.env.TERMINAL_WORKDIR ||
            process.env.USERPROFILE ||
            process.env.HOME ||
            process.cwd();
    }

    async run(parameters) {
        if (!this.enabled) {
            return "⚠ TerminalBot desactivado. Activá COMPUTER_CONTROL_ENABLED=true en .env";
        }

        const action = (parameters?.action || "exec").toLowerCase();

        switch (action) {
            case "exec":
            case "run":
                return await this._execCommand(parameters);

            case "create_file":
            case "write_file":
                return await this._createFile(parameters);

            case "create_and_run":
                return await this._createAndRun(parameters);

            case "install_npm":
                return await this._installNpm(parameters);

            case "install_pip":
                return await this._installPip(parameters);

            case "list_dir":
                return await this._listDir(parameters);

            case "read_file":
                return await this._readFile(parameters);

            default:
                // Si no hay acción explícita pero hay command, ejecutar directamente
                if (parameters?.command || parameters?.task) {
                    return await this._execCommand(parameters);
                }
                throw new Error(`TerminalBot: acción desconocida "${action}"`);
        }
    }

    /* ── Ejecutar comando ────────────────────────────────── */
    async _execCommand({ command, task, workdir, timeout = 30000 } = {}) {
        const cmd = command || task || "";
        if (!cmd) throw new Error("TerminalBot: 'command' es requerido");

        // Verificar comandos bloqueados
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(cmd)) {
                return `🚫 Comando bloqueado por seguridad: \`${cmd}\``;
            }
        }

        const cwd = workdir
            ? this._resolvePath(workdir)
            : this.defaultWorkdir;

        logger.info(`TerminalBot exec: "${cmd}" en "${cwd}"`);

        return new Promise((resolve) => {
            exec(cmd, { cwd, shell: true, timeout }, (err, stdout, stderr) => {
                const out = stdout?.trim() || "";
                const errOut = stderr?.trim() || "";

                if (err && !out) {
                    resolve(
                        `❌ Error ejecutando \`${cmd}\`:\n\`\`\`\n${err.message}\n${errOut}\n\`\`\``
                    );
                } else {
                    const result = out || errOut || "✅ Comando ejecutado (sin salida)";
                    const warning = errOut && out ? `\n⚠ stderr: ${errOut.substring(0, 200)}` : "";
                    resolve(`✅ \`${cmd}\`\n\`\`\`\n${result.substring(0, 2000)}${warning}\n\`\`\``);
                }
            });
        });
    }

    /* ── Crear archivo ───────────────────────────────────── */
    async _createFile({ filepath, content, filename, destination } = {}) {
        let targetPath = filepath || destination;
        if (!targetPath && filename) {
            targetPath = path.join(this.defaultWorkdir, filename);
        }
        if (!targetPath) throw new Error("TerminalBot: 'filepath' o 'filename' requerido");

        targetPath = this._resolvePath(targetPath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content || "", "utf-8");

        logger.info(`TerminalBot created file: ${targetPath}`);
        return `✅ Archivo creado:\n📄 \`${targetPath}\`\n${content ? `📝 ${content.length} caracteres` : ""}`;
    }

    /* ── Crear y ejecutar ────────────────────────────────── */
    async _createAndRun({ filepath, content, filename, destination, command, workdir } = {}) {
        // 1. Crear el archivo
        const createResult = await this._createFile({ filepath, content, filename, destination });
        const filePath = filepath || destination || path.join(this.defaultWorkdir, filename || "script");
        const resolvedPath = this._resolvePath(filePath);

        // 2. Determinar cómo ejecutar según extensión
        const ext = path.extname(resolvedPath).toLowerCase();
        let runCmd = command;

        if (!runCmd) {
            switch (ext) {
                case ".py":   runCmd = `python "${resolvedPath}"`; break;
                case ".js":   runCmd = `node "${resolvedPath}"`; break;
                case ".bat":  runCmd = `"${resolvedPath}"`; break;
                case ".sh":   runCmd = `bash "${resolvedPath}"`; break;
                case ".ps1":  runCmd = `powershell -ExecutionPolicy Bypass -File "${resolvedPath}"`; break;
                default:      runCmd = `"${resolvedPath}"`; break;
            }
        }

        // 3. Ejecutar
        logger.info(`TerminalBot create_and_run: ${runCmd}`);
        const runResult = await this._execCommand({
            command: runCmd,
            workdir: workdir || path.dirname(resolvedPath),
        });

        return `${createResult}\n\n🚀 **Ejecutado:**\n${runResult}`;
    }

    /* ── Instalar paquete npm ────────────────────────────── */
    async _installNpm({ package: pkg, workdir, global: isGlobal = false } = {}) {
        if (!pkg) throw new Error("TerminalBot: 'package' requerido para install_npm");
        const flag = isGlobal ? "-g" : "";
        return await this._execCommand({
            command: `npm install ${flag} ${pkg}`,
            workdir: workdir || process.cwd(),
            timeout: 120000,
        });
    }

    /* ── Instalar paquete pip ────────────────────────────── */
    async _installPip({ package: pkg } = {}) {
        if (!pkg) throw new Error("TerminalBot: 'package' requerido para install_pip");
        return await this._execCommand({
            command: `pip install ${pkg}`,
            timeout: 120000,
        });
    }

    /* ── Listar directorio ───────────────────────────────── */
    async _listDir({ directory, dir, path: dirPath } = {}) {
        const target = this._resolvePath(directory || dir || dirPath || this.defaultWorkdir);
        if (!fs.existsSync(target)) return `❌ Directorio no encontrado: \`${target}\``;

        try {
            const entries = fs.readdirSync(target, { withFileTypes: true });
            const lines = entries.slice(0, 50).map(e =>
                `${e.isDirectory() ? "📁" : "📄"} ${e.name}`
            ).join("\n");
            const extra = entries.length > 50 ? `\n... y ${entries.length - 50} más` : "";
            return `📂 **${target}** (${entries.length} elementos)\n\n${lines}${extra}`;
        } catch (e) {
            return `⚠ Error listando: ${e.message}`;
        }
    }

    /* ── Leer archivo ────────────────────────────────────── */
    async _readFile({ filepath, filename } = {}) {
        const target = this._resolvePath(filepath || filename || "");
        if (!target) return "❌ Indicá el archivo a leer.";
        if (!fs.existsSync(target)) return `❌ No encontrado: \`${target}\``;

        try {
            const content = fs.readFileSync(target, "utf-8");
            const preview = content.substring(0, 3000);
            const truncated = content.length > 3000;
            return `📄 **${path.basename(target)}**\n\`\`\`\n${preview}${truncated ? "\n... [truncado]" : ""}\n\`\`\``;
        } catch (e) {
            return `⚠ Error leyendo: ${e.message}`;
        }
    }

    /* ── Helpers ─────────────────────────────────────────── */
    _resolvePath(p) {
        if (!p) return this.defaultWorkdir;
        p = String(p).trim().replace(/^["']|["']$/g, "");
        if (path.isAbsolute(p)) return p;
        return path.resolve(this.defaultWorkdir, p);
    }
}

module.exports = TerminalBot;