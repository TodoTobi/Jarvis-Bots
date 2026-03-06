/**
 * NLPService.js — Motor NLP central de Jarvis
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. levenshtein(a,b)          — distancia de edición O(n*m)
 * 2. stringSimilarity(a,b)     — similitud normalizada 0.0–1.0
 * 3. scoreFile(query, name)    — score compuesto para un archivo candidato
 * 4. walkAndScore(root, query) — recorre FS y puntúa archivos
 * 5. findBestFile(query, root) — retorna el mejor candidato
 * 6. ContextManager            — historial conversacional con resolución de refs
 * 7. parseFileCommand(msg)     — extrae acción/filename/location/typeHint
 *
 * Instalación: backend/services/NLPService.js
 *              backend/services/LanguageAliases.js (depende de este)
 *
 * Uso en DriveBot.js:
 *   const NLP = require("../services/NLPService");
 *   const hit = NLP.findBestFile("21", "C:\\Users\\Tobias\\Desktop", { typeHint: "video" });
 *   // → { name: "21 (1).mp4", path: "...", score: 0.87, ... }
 *
 * Uso en BotManager.js:
 *   NLP.context.push({ intent, parameters, message, reply });
 *   const ctx = NLP.context.getLast();
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const nodePath = require("path");
const fs = require("fs");

let LA;
try {
    LA = require("./LanguageAliases");
} catch (_) {
    LA = { FILE_TYPE_MAP: {}, detectFileTypeMention: function() { return null; }, resolveFolderAlias: function() { return null; }, applyAliases: function(t) { return { text: t, changed: false, corrections: [] }; }, stripWakeWord: function(t) { return t; } };
}

let logger;
try { logger = require("../logs/logger"); }
catch (_) { logger = { info: console.log, warn: console.warn, error: console.error }; }

// Carpetas del sistema que nunca recorrer
const SKIP_DIRS = new Set([
    "windows", "system32", "syswow64", "program files", "program files (x86)",
    "programdata", "appdata", "node_modules", ".git", "$recycle.bin",
    "windowsapps", "recovery", "boot",
]);
const SKIP_EXTS = new Set([".lnk", ".url", ".desktop"]);

/* ══════════════════════════════════════════════════════
   1. LEVENSHTEIN DISTANCE
   Implementación O(n*m) con arrays 1D para menor memoria.
   Retorna distancia entera (0 = idéntico).
══════════════════════════════════════════════════════ */
function levenshtein(a, b) {
    if (!a) return (b || "").length;
    if (!b) return a.length;
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    // Early exit: si la diferencia de largo es >70% del máximo, imposible ser similar
    if (Math.abs(la - lb) > Math.max(la, lb) * 0.7) return Math.max(la, lb);
    let prev = new Array(lb + 1).fill(0).map(function(_, i) { return i; });
    let curr = new Array(lb + 1);
    for (let i = 1; i <= la; i++) {
        curr[0] = i;
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[lb];
}

/* ══════════════════════════════════════════════════════
   2. SIMILITUD NORMALIZADA 0.0–1.0
   1.0 = idéntico, 0.0 = completamente distinto
══════════════════════════════════════════════════════ */
function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const la = a.toLowerCase().trim();
    const lb = b.toLowerCase().trim();
    if (la === lb) return 1.0;
    const maxLen = Math.max(la.length, lb.length);
    if (maxLen === 0) return 1.0;
    return 1 - levenshtein(la, lb) / maxLen;
}

/* ══════════════════════════════════════════════════════
   3. SCORE COMPUESTO PARA UN ARCHIVO CANDIDATO
   Combina Levenshtein, containment, token overlap y bonus de extensión.
   Retorna 0.0–1.0
══════════════════════════════════════════════════════ */
function scoreFile(query, filename, preferredExts) {
    const exts = preferredExts || [];
    const q = query.toLowerCase().trim();
    const n = filename.toLowerCase();
    const ext = nodePath.extname(n);
    const nNoExt = n.slice(0, n.length - ext.length).trim();

    let score = 0;

    // A. Exacto completo
    if (n === q || nNoExt === q) {
        return Math.min(1.0, 0.95 + (exts.includes(ext) ? 0.05 : 0));
    }

    // B. Levenshtein query vs nombre sin extensión
    const levSim = stringSimilarity(q, nNoExt);
    score = Math.max(score, levSim * 0.88);

    // C. Containment: ¿el query está dentro del nombre?
    if (nNoExt.includes(q) || n.includes(q)) {
        const ratio = q.length / Math.max(nNoExt.length, 1);
        score = Math.max(score, 0.60 + ratio * 0.25);
    }

    // D. El nombre empieza con el query
    if (nNoExt.startsWith(q)) score = Math.max(score, 0.72);

    // E. Token overlap (palabras individuales)
    const qToks = q.split(/[\s\-_.,()[\]{}]+/).filter(function(t) { return t.length > 1; });
    const nToks = nNoExt.split(/[\s\-_.,()[\]{}]+/).filter(function(t) { return t.length > 1; });
    if (qToks.length > 0 && nToks.length > 0) {
        let matched = 0;
        for (const qt of qToks) {
            const found = nToks.some(function(nt) {
                return nt === qt || nt.includes(qt) || qt.includes(nt) || stringSimilarity(qt, nt) > 0.80;
            });
            if (found) matched++;
        }
        score = Math.max(score, (matched / qToks.length) * 0.68);
    }

    // F. Levenshtein query vs nombre completo
    score = Math.max(score, stringSimilarity(q, n) * 0.65);

    // G. Bonus extensión preferida +12%
    if (exts.length > 0 && exts.includes(ext)) {
        score = Math.min(1.0, score + 0.12);
    }

    return Math.max(0, Math.min(1, score));
}

/* ══════════════════════════════════════════════════════
   4. RECORRIDO FS CON SCORING
   Recorre rootDir recursivamente y retorna candidatos
   ordenados por score descendente.
══════════════════════════════════════════════════════ */
function walkAndScore(rootDir, query, options) {
    const opts = options || {};
    const typeHint     = opts.typeHint     || null;
    const maxResults   = opts.maxResults   || 30;
    const maxDepth     = opts.maxDepth     || 6;
    const minScore     = opts.minScore     !== undefined ? opts.minScore : 0.22;

    // Resolver extensiones preferidas
    let preferredExts = opts.extensions || [];
    if (preferredExts.length === 0 && typeHint) {
        preferredExts = (LA.FILE_TYPE_MAP[typeHint.toLowerCase()] || []);
    }

    const results = [];

    function walk(dir, depth) {
        if (depth > maxDepth || results.length >= maxResults * 2) return;
        const base = nodePath.basename(dir).toLowerCase();
        if (SKIP_DIRS.has(base)) return;

        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (_) { return; }

        for (const entry of entries) {
            const ep = nodePath.join(dir, entry.name);
            const ext = nodePath.extname(entry.name).toLowerCase();
            if (SKIP_EXTS.has(ext)) continue;

            if (entry.isFile()) {
                const score = scoreFile(query, entry.name, preferredExts);
                if (score >= minScore) {
                    let size = 0;
                    try { size = fs.statSync(ep).size; } catch (_) { }
                    results.push({
                        name: entry.name,
                        path: ep,
                        dir: dir,
                        ext: ext,
                        score: Math.round(score * 1000) / 1000,
                        size: size,
                        isDir: false,
                    });
                }
            } else if (entry.isDirectory()) {
                // Puntuar la carpeta también
                const score = scoreFile(query, entry.name, []);
                if (score >= minScore) {
                    results.push({ name: entry.name, path: ep, dir: dir, ext: "", score: Math.round(score * 1000) / 1000, size: 0, isDir: true });
                }
                walk(ep, depth + 1);
            }
        }
    }

    walk(rootDir, 0);

    results.sort(function(a, b) {
        const ds = b.score - a.score;
        if (Math.abs(ds) > 0.01) return ds;
        return b.size - a.size; // desempate: archivo más grande
    });

    return results.slice(0, maxResults);
}

/* ══════════════════════════════════════════════════════
   5. BUSCAR MEJOR ARCHIVO — punto de entrada principal
══════════════════════════════════════════════════════ */
function findBestFile(query, rootDir, options) {
    if (!query || !rootDir) return null;
    const opts = options || {};

    // Detectar tipo de archivo mencionado en el query completo
    const typeDetected = LA.detectFileTypeMention(query);
    const typeHint = opts.typeHint || (typeDetected ? typeDetected.keyword : null);

    // Limpiar el query: quitar palabras de tipo y artículos para buscar por nombre puro
    let cleanQuery = query.toLowerCase()
        .replace(/\b(el|la|los|las|un|una|unos|unas|de|del|en|al|a|llamado|llamada|que|se|llama|archivo|carpeta)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (typeDetected) {
        const esc = typeDetected.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        cleanQuery = cleanQuery.replace(new RegExp("\\b" + esc + "\\b", "gi"), " ").replace(/\s+/g, " ").trim();
    }
    if (!cleanQuery || cleanQuery.length < 1) cleanQuery = query;

    logger.info("NLPService.findBestFile: query=\"" + cleanQuery + "\" root=\"" + rootDir + "\" type=" + (typeHint || "any"));

    const results = walkAndScore(rootDir, cleanQuery, {
        typeHint: typeHint,
        maxResults: 20,
        maxDepth: opts.maxDepth || 6,
        minScore: opts.minScore || 0.20,
    });

    if (results.length === 0) return null;
    logger.info("NLPService.findBestFile: mejor=\"" + results[0].name + "\" score=" + results[0].score);
    return results[0];
}

/* ══════════════════════════════════════════════════════
   6. CONTEXT MANAGER
   Guarda los últimos N turnos para permitir refinamiento
   y resolución de referencias anafóricas.

   Uso:
     NLP.context.push({ intent, parameters, message, reply });
     const last = NLP.context.getLast();
     const { resolved, contextUsed } = NLP.context.resolveReferences("mueve ese al drive");
══════════════════════════════════════════════════════ */
function ContextManager(maxHistory) {
    this._max = maxHistory || 12;
    this._history = [];
}

ContextManager.prototype.push = function(turn) {
    this._history.push({
        intent:     turn.intent     || "",
        parameters: turn.parameters || {},
        message:    turn.message    || "",
        reply:      turn.reply      || "",
        bot:        turn.bot        || null,
        ts:         Date.now(),
    });
    if (this._history.length > this._max) this._history.shift();
};

ContextManager.prototype.getLast = function() {
    return this._history[this._history.length - 1] || null;
};

ContextManager.prototype.getLastN = function(n) {
    return this._history.slice(-(n || 3));
};

ContextManager.prototype.clear = function() { this._history = []; };
ContextManager.prototype.getAll = function() { return this._history.slice(); };

/**
 * Resuelve referencias anafóricas en el nuevo mensaje usando el contexto previo.
 * Ejemplos que resuelve:
 *   "mueve ese al drive"         → "mueve 21 (1).mp4 al drive"  (si el turno anterior tenía ese archivo)
 *   "no, desde downloads"        → añade ubicación al intent anterior
 *   "el mismo pero en carpeta X" → reutiliza el filename anterior
 *
 * Retorna: { resolved, contextUsed, hint }
 */
ContextManager.prototype.resolveReferences = function(message) {
    const last = this.getLast();
    if (!last) return { resolved: message, contextUsed: false, hint: null };

    let resolved = message;
    let contextUsed = false;
    let hint = null;
    const lower = message.toLowerCase();

    // Patrones anafóricos en español rioplatense
    const ANAFORIC = [
        /\b(ese|esa|este|esta|esto|eso)\b/gi,
        /\b(ese archivo|esa carpeta|ese video|esa imagen|ese doc)\b/gi,
        /\b(el mismo|la misma|lo mismo)\b/gi,
        /\b(el anterior|la anterior|el de antes|lo anterior)\b/gi,
        /\b(ese que te dije|eso que mencioné)\b/gi,
    ];

    const hasRef = ANAFORIC.some(function(p) { return p.test(lower); });

    if (hasRef) {
        const prevFile = (last.parameters.filename) ||
                         (last.parameters.source)   ||
                         (last.parameters.query)    || null;
        if (prevFile) {
            ANAFORIC.forEach(function(p) {
                resolved = resolved.replace(p, prevFile);
            });
            contextUsed = true;
            hint = "Resolví \"" + message + "\" → \"" + resolved + "\" (contexto previo: " + prevFile + ")";
        }
    }

    // Refinamiento de ubicación: "en el desktop" / "desde downloads" como añadido
    const locAddition = message.match(/^(?:en|desde|en el|desde el|de la?)\s+([\w\s\\\/]+)$/i);
    if (locAddition && last.intent) {
        hint = "Añadí ubicación \"" + locAddition[1] + "\" al intent anterior";
        contextUsed = true;
    }

    return { resolved: resolved, contextUsed: contextUsed, hint: hint };
};

/**
 * Detecta si el nuevo mensaje es una corrección del anterior.
 * Ej: "no, quería el de mp4" / "mejor desde downloads"
 */
ContextManager.prototype.isCorrectionOf = function(message) {
    const lower = message.toLowerCase();
    return /^(no[,\s]|mejor[,\s]|en realidad|quería decir|me refería|el otro|la otra|ese no|esa no)/.test(lower);
};

/* ══════════════════════════════════════════════════════
   7. PARSER DE COMANDOS DE ARCHIVO
   Extrae: { action, filename, location, typeHint, preferredExts, raw }
══════════════════════════════════════════════════════ */
function parseFileCommand(message) {
    const m = message.trim();
    const lower = m.toLowerCase();

    let action = "search";
    if (/\bmov[eé]\b|\bpas[aá]\b|\bmand[aá]\b|\bsub[ií]\b|\bupload\b/.test(lower)) {
        action = /\bdrive\b|\bnube\b|\bgoogle drive\b/.test(lower) ? "move_to_drive" : "move";
    } else if (/\bcopi[aá]\b/.test(lower)) {
        action = /\bdrive\b|\bnube\b/.test(lower) ? "copy_to_drive" : "copy";
    } else if (/\bbuscá\b|\bbuscar\b|\bencontrá\b|\bdónde\b|\bdonde\b/.test(lower)) {
        action = "search";
    } else if (/\belimin[aá]\b|\bborrá\b/.test(lower)) {
        action = "delete";
    } else if (/\blistá\b|\blistar\b|\bver\b|\bmostrá\b/.test(lower)) {
        action = "list";
    }

    // Extraer ubicación "desde/en [carpeta]"
    let location = null;
    const locMatch = m.match(/(?:desde|en|from|en el|desde el|de la?)\s+([\w\s\\\/]+?)(?:\s+(?:al?|a la|hacia)\s|$)/i);
    if (locMatch) location = locMatch[1].trim();

    // Extraer filename
    let filename = null;
    const pats = [
        /(?:mov[eé]|pas[aá]|mand[aá]|sub[ií]|copi[aá])\s+(?:el\s+|la\s+)?(.+?)\s+(?:al?|hacia|desde|en)\s/i,
        /(?:buscá|encontrá)\s+(?:el\s+|la\s+)?(?:archivo\s+|video\s+|imagen\s+)?(.+?)(?:\s+en\s+.+)?$/i,
        /(.+?)\s+al?\s+(?:drive|nube|google drive)/i,
    ];
    for (const p of pats) {
        const match = m.match(p);
        if (match) {
            filename = match[1].trim().replace(/^(el|la|los|las|un|una)\s+/i, "").trim();
            if (filename.length > 0) break;
        }
    }

    const typeDetected = LA.detectFileTypeMention(message);

    return {
        action:        action,
        filename:      filename,
        location:      location,
        typeHint:      typeDetected ? typeDetected.keyword : null,
        preferredExts: typeDetected ? typeDetected.extensions : [],
        raw:           m,
    };
}

/* ══════════════════════════════════════════════════════
   SINGLETON: contexto global compartido
══════════════════════════════════════════════════════ */
const globalContext = new ContextManager(15);

/* ══════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════ */
module.exports = {
    // Primitivos
    levenshtein:          levenshtein,
    stringSimilarity:     stringSimilarity,
    scoreFile:            scoreFile,
    // Búsqueda FS
    walkAndScore:         walkAndScore,
    findBestFile:         findBestFile,
    // Contexto
    ContextManager:       ContextManager,
    context:              globalContext,
    // Parser
    parseFileCommand:     parseFileCommand,
    // Re-exports de LanguageAliases
    applyAliases:         LA.applyAliases,
    detectFileTypeMention: LA.detectFileTypeMention,
    resolveFolderAlias:   LA.resolveFolderAlias,
    stripWakeWord:        LA.stripWakeWord,
    FILE_TYPE_MAP:        LA.FILE_TYPE_MAP,
    FOLDER_ALIASES:       LA.FOLDER_ALIASES,
};