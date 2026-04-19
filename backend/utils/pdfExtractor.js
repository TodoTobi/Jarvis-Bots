/**
 * pdfExtractor.js — Extrae texto de PDFs para enviarlo a Gemma como texto plano
 *
 * Estrategia en orden de prioridad:
 *   1. pdf-parse (npm) — el más rápido, texto puro
 *   2. pdftotext (poppler CLI) — si pdf-parse no está instalado
 *   3. Fallback: devuelve null → el caller puede renderizar páginas como imagen
 *
 * Instalación recomendada:
 *   npm install pdf-parse
 *
 * En Linux/Mac (para fallback pdftotext):
 *   sudo apt install poppler-utils   # Ubuntu/Debian
 *   brew install poppler             # Mac
 */

"use strict";

const { exec } = require("child_process");
const fs       = require("fs");
const path     = require("path");

let logger;
try { logger = require("../logs/logger"); }
catch { logger = { info: console.log, warn: console.warn, error: console.error }; }

/**
 * extractPDFText(filePath) → Promise<string | null>
 *
 * Retorna el texto extraído del PDF, o null si ningún método funcionó.
 * El texto se trunca a MAX_CHARS para no explotar el contexto del modelo.
 */
const MAX_CHARS = 8000;

async function extractPDFText(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;

    // ── Método 1: pdf-parse (npm) ────────────────────────────────────────────
    try {
        const pdfParse = require("pdf-parse");
        const buffer   = fs.readFileSync(filePath);
        const data     = await pdfParse(buffer);
        const text     = (data.text || "").trim();
        if (text.length > 20) {
            logger.info(`pdfExtractor: pdf-parse → ${text.length} chars`);
            return text.substring(0, MAX_CHARS);
        }
    } catch (err) {
        // pdf-parse no instalado o PDF corrupto → siguiente método
        if (!err.message.includes("Cannot find module")) {
            logger.warn(`pdfExtractor: pdf-parse error: ${err.message}`);
        }
    }

    // ── Método 2: pdftotext (poppler CLI) ────────────────────────────────────
    const tmpOut = filePath + "_extracted.txt";
    try {
        await new Promise((resolve, reject) => {
            exec(`pdftotext "${filePath}" "${tmpOut}"`, { timeout: 15000 }, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        if (fs.existsSync(tmpOut)) {
            const text = fs.readFileSync(tmpOut, "utf-8").trim();
            try { fs.unlinkSync(tmpOut); } catch {}
            if (text.length > 20) {
                logger.info(`pdfExtractor: pdftotext → ${text.length} chars`);
                return text.substring(0, MAX_CHARS);
            }
        }
    } catch {
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }

    // ── Método 3: Python pdfminer ────────────────────────────────────────────
    try {
        const text = await new Promise((resolve, reject) => {
            const script = `
from pdfminer.high_level import extract_text
import sys
try:
    t = extract_text(sys.argv[1])
    print(t[:8000] if t else "")
except Exception as e:
    print("")
`.trim();
            const tmpPy = filePath + "_ext.py";
            fs.writeFileSync(tmpPy, script, "utf-8");
            exec(`python "${tmpPy}" "${filePath}"`, { timeout: 20000 }, (err, stdout) => {
                try { fs.unlinkSync(tmpPy); } catch {}
                if (err) reject(err);
                else resolve((stdout || "").trim());
            });
        });
        if (text.length > 20) {
            logger.info(`pdfExtractor: pdfminer → ${text.length} chars`);
            return text.substring(0, MAX_CHARS);
        }
    } catch {}

    logger.warn("pdfExtractor: ningún método pudo extraer texto del PDF");
    return null;
}

/**
 * buildPDFPrompt(extractedText, userQuery) → string
 *
 * Construye el prompt que se le envía a Gemma con el texto del PDF.
 */
function buildPDFPrompt(extractedText, userQuery) {
    const query = userQuery || "Resumí y analizá este documento detalladamente. Extraé los puntos clave, estructura y datos importantes.";
    return `${query}

---
CONTENIDO DEL PDF:
${extractedText}
---

Respondé en español. Sé detallado y estructurado.`;
}

module.exports = { extractPDFText, buildPDFPrompt };