const fs = require("fs");
const path = require("path");

class Logger {
    constructor() {
        this.logDir = path.resolve(__dirname);
        this.appLogPath = path.join(this.logDir, "app.log");
        this.errorLogPath = path.join(this.logDir, "error.log");

        this.ensureLogFiles();
    }

    ensureLogFiles() {
        if (!fs.existsSync(this.appLogPath)) {
            fs.writeFileSync(this.appLogPath, "", "utf-8");
        }

        if (!fs.existsSync(this.errorLogPath)) {
            fs.writeFileSync(this.errorLogPath, "", "utf-8");
        }
    }

    timestamp() {
        return new Date().toISOString();
    }

    format(level, message) {
        return `[${this.timestamp()}] [${level.toUpperCase()}] ${message}\n`;
    }

    write(file, content) {
        try {
            fs.appendFileSync(file, content, "utf-8");
        } catch (err) {
            console.error("Logger write failure:", err.message);
        }
    }

    info(message) {
        const formatted = this.format("info", message);
        console.log(formatted.trim());
        this.write(this.appLogPath, formatted);
    }

    warn(message) {
        const formatted = this.format("warn", message);
        console.warn(formatted.trim());
        this.write(this.appLogPath, formatted);
    }

    error(message) {
        const formatted = this.format("error", message);
        console.error(formatted.trim());
        this.write(this.errorLogPath, formatted);
    }
}

module.exports = new Logger();