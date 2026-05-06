"use strict";

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

let logger;
try { logger = require("../logs/logger"); }
catch { logger = { info: console.log, warn: console.warn, error: console.error }; }

const MAX_CHARS = 12000;

async function extractPDFText(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        logger.warn(`pdfExtractor: archivo no existe: ${filePath}`);
        return null;
    }

    const fileSize = fs.statSync(filePath).size;
    logger.info(`pdfExtractor: procesando ${path.basename(filePath)} (${(fileSize/1024).toFixed(0)}KB)`);

    // ── Método 1: pdf-parse ──────────────────────────────────────────────────
    try {
        // Import dinámico para evitar el bug de pdf-parse con require en algunos entornos
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer, { max: 0 });
        const text = (data.text || "").trim();
        if (text.length > 30) {
            logger.info(`pdfExtractor: pdf-parse OK → ${text.length} chars, ${data.numpages} páginas`);
            return text.substring(0, MAX_CHARS);
        }
        logger.warn("pdfExtractor: pdf-parse devolvió texto vacío");
    } catch (err) {
        logger.warn(`pdfExtractor: pdf-parse falló: ${err.message}`);
    }

    // ── Método 2: pdftotext (poppler) ────────────────────────────────────────
    try {
        const text = await new Promise((resolve, reject) => {
            exec(`pdftotext -enc UTF-8 "${filePath}" -`, { timeout: 15000, maxBuffer: 5*1024*1024 }, 
                (err, stdout) => {
                    if (err) return reject(err);
                    resolve((stdout || "").trim());
                });
        });
        if (text.length > 30) {
            logger.info(`pdfExtractor: pdftotext OK → ${text.length} chars`);
            return text.substring(0, MAX_CHARS);
        }
    } catch (err) {
        logger.warn(`pdfExtractor: pdftotext falló: ${err.message}`);
    }

    // ── Método 3: Python pdfminer ────────────────────────────────────────────
    try {
        const text = await new Promise((resolve, reject) => {
            const cmd = `python -c "
from pdfminer.high_level import extract_text
import sys
t = extract_text('${filePath.replace(/\\/g, "/")}')
print(t[:12000] if t else '')
"`;
            exec(cmd, { timeout: 20000 }, (err, stdout) => {
                if (err) return reject(err);
                resolve((stdout || "").trim());
            });
        });
        if (text.length > 30) {
            logger.info(`pdfExtractor: pdfminer OK → ${text.length} chars`);
            return text.substring(0, MAX_CHARS);
        }
    } catch (err) {
        logger.warn(`pdfExtractor: pdfminer falló: ${err.message}`);
    }

    logger.error("pdfExtractor: todos los métodos fallaron");
    return null;
}

function buildPDFPrompt(extractedText, userQuery) {
    const query = userQuery || "Resumí y analizá este documento. Extraé los puntos clave.";
    const truncated = extractedText.length >= 12000;
    return [
        query,
        "",
        truncated ? "⚠ Documento truncado a los primeros 12000 caracteres." : "",
        "---",
        "CONTENIDO DEL DOCUMENTO:",
        extractedText,
        "---",
        "Respondé en español. Sé detallado y estructurado."
    ].filter(s => s !== undefined).join("\n");
}

module.exports = { extractPDFText, buildPDFPrompt };