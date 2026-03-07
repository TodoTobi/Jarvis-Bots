/**
 * NLPService.js  ·  Jarvis NLP Engine v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulos:
 *   1. levenshtein(a,b)           — distancia de edición O(n·m), 1D array
 *   2. stringSimilarity(a,b)      — similitud normalizada 0.0–1.0
 *   3. ngramSimilarity(a,b,n)     — similitud por bigramas / trigramas
 *   4. scoreFile(query,name,exts) — score compuesto 5 métricas + bonus extensión
 *   5. walkAndScore(root,query)   — recorre FS recursivamente con scoring
 *   6. findBestFile(query,root)   — retorna el mejor candidato con metadata
 *   7. ContextManager             — historial conversacional + resolución anafórica
 *   8. parseFileCommand(msg)      — parser de comandos de archivo en español natural
 *
 * Fixes v3 vs v2:
 *   - Bug CRÍTICO corregido: \b falla con chars acentuados (é,á,í,ó,ú) en JS.
 *     Todas las regex de acción ahora usan (?:^|\s) / (?=\s|$) en lugar de \b.
 *   - scoreFile: desempate mejorado con longitud del nombre (nombres más cortos
 *     ganan cuando el score base es igual — "21 (1).mp4" > "21 Pilots - XXX.mp4")
 *   - scoreFile: bonus bigramas para queries de ≥3 tokens
 *   - parseFileCommand: 14 patrones de acción incluyendo 'pasame','mandame','llevá',
 *     'subilo','cargá','colgá','eliminá','borralo','tirá','quitá','listar','listá'
 *   - parseFileCommand: extracción filename con 6 patrones cubriendo edge cases
 *   - ContextManager.resolveReferences: maneja correcciones ("no, el de mkv")
 *     extrayendo extensión/tipo del mensaje de corrección
 *   - ContextManager: push() guarda también el archivo encontrado (foundPath)
 *     para que la corrección tenga el contexto correcto
 *
 * Ruta de instalación:
 *   backend/services/NLPService.js
 *   backend/services/LanguageAliases.js  ← dependencia
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const nodePath = require("path");
const fs       = require("fs");

// ── LanguageAliases: carga con fallback seguro ───────────────────────────────
let LA;
try {
    LA = require("./LanguageAliases");
} catch (_) {
    LA = {
        FILE_TYPE_MAP:         {},
        FOLDER_ALIASES:        {},
        detectFileTypeMention: () => null,
        resolveFolderAlias:    () => null,
        applyAliases:          (t) => ({ text: t, changed: false, corrections: [] }),
        stripWakeWord:         (t) => t,
    };
}

// ── Logger: usa el del proyecto o cae en console ─────────────────────────────
let logger;
try { logger = require("../logs/logger"); }
catch (_) { logger = { info: console.log, warn: console.warn, error: console.error }; }

// ── Directorios y extensiones que nunca recorrer ─────────────────────────────
const SKIP_DIRS = new Set([
    "windows","system32","syswow64","program files","program files (x86)",
    "programdata","appdata","node_modules",".git","$recycle.bin",
    "windowsapps","recovery","boot","intel","nvidia","amd","perflogs",
]);
const SKIP_EXTS = new Set([".lnk",".url",".desktop",".ini",".sys",".dll",".exe"]);


/* ══════════════════════════════════════════════════════════════════════════════
   1. LEVENSHTEIN DISTANCE  —  O(n·m) con array 1D
══════════════════════════════════════════════════════════════════════════════ */
function levenshtein(a, b) {
    if (!a) return (b || "").length;
    if (!b) return a.length;
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > Math.max(la, lb) * 0.72) return Math.max(la, lb);
    let prev = Array.from({ length: lb + 1 }, (_, i) => i);
    let curr = new Array(lb + 1);
    for (let i = 1; i <= la; i++) {
        curr[0] = i;
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[lb];
}


/* ══════════════════════════════════════════════════════════════════════════════
   2. SIMILITUD NORMALIZADA  0.0 – 1.0
══════════════════════════════════════════════════════════════════════════════ */
function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const la = a.toLowerCase().trim();
    const lb = b.toLowerCase().trim();
    if (la === lb) return 1.0;
    const maxLen = Math.max(la.length, lb.length);
    if (maxLen === 0) return 1.0;
    return 1 - levenshtein(la, lb) / maxLen;
}


/* ══════════════════════════════════════════════════════════════════════════════
   3. N-GRAM SIMILARITY  (bigrams por defecto)
   Útil para detectar similitud cuando hay transposición de palabras o
   tokens reordenados. Complementa Levenshtein.
══════════════════════════════════════════════════════════════════════════════ */
function ngramSimilarity(a, b, n) {
    n = n || 2;
    if (!a || !b) return 0;
    const la = a.toLowerCase().replace(/[\s\-_.,()[\]{}]/g, "");
    const lb = b.toLowerCase().replace(/[\s\-_.,()[\]{}]/g, "");
    if (la === lb) return 1.0;
    if (la.length < n || lb.length < n) return stringSimilarity(la, lb);

    const buildNgrams = (s) => {
        const set = new Set();
        for (let i = 0; i <= s.length - n; i++) set.add(s.slice(i, i + n));
        return set;
    };
    const sa = buildNgrams(la);
    const sb = buildNgrams(lb);
    let intersection = 0;
    sa.forEach(g => { if (sb.has(g)) intersection++; });
    return (2 * intersection) / (sa.size + sb.size);
}


/* ══════════════════════════════════════════════════════════════════════════════
   4. SCORE COMPUESTO PARA UN ARCHIVO
   Combina 5 métricas independientes y un bonus de extensión.
   Retorna 0.0 – 1.0

   Métricas:
     A. Coincidencia exacta                          → 0.95–1.00
     B. Levenshtein query vs nombre sin extensión    → ×0.88
     C. Containment (query ⊂ nombre)                → 0.60–0.85
     D. Token overlap (palabras individuales)        → ×0.72
     E. N-gram similarity (bigramas)                 → ×0.65
     F. Nombre empieza con el query                  → 0.74 mínimo

   Desempate cuando score base es igual:
     - Penalizar nombres largos levemente (nombres más cortos son más precisos)
     - Bonificar si el query ocupa un mayor % del nombre

   Bonus:
     G. Extensión en el set de preferidas            → +0.13
══════════════════════════════════════════════════════════════════════════════ */
function scoreFile(query, filename, preferredExts) {
    const exts = preferredExts || [];
    const q    = query.toLowerCase().trim();
    const n    = filename.toLowerCase();
    const ext  = nodePath.extname(n);
    const nBase = n.slice(0, n.length - ext.length).trim();  // nombre sin extensión

    // ── A. Exacto completo ───────────────────────────────────────────────────
    if (n === q || nBase === q) {
        return Math.min(1.0, 0.955 + (exts.includes(ext) ? 0.045 : 0));
    }

    let score = 0;

    // ── B. Levenshtein query vs nombre sin extensión ─────────────────────────
    const levSim = stringSimilarity(q, nBase);
    score = Math.max(score, levSim * 0.88);

    // ── C. Containment: query está contenido en el nombre ────────────────────
    if (nBase.includes(q) || n.includes(q)) {
        // Ratio: cuánto del nombre ES el query (mayor = más preciso)
        const ratio = q.length / Math.max(nBase.length, 1);
        // Base 0.60, sube hasta 0.85 cuando el nombre es casi solo el query
        score = Math.max(score, 0.60 + ratio * 0.25);
    }

    // ── D. Token overlap ─────────────────────────────────────────────────────
    const qToks = q.split(/[\s\-_.,()[\]{}]+/).filter(t => t.length > 1);
    const nToks = nBase.split(/[\s\-_.,()[\]{}]+/).filter(t => t.length > 1);
    if (qToks.length > 0 && nToks.length > 0) {
        let matched = 0;
        for (const qt of qToks) {
            const found = nToks.some(nt =>
                nt === qt ||
                nt.includes(qt) ||
                qt.includes(nt) ||
                stringSimilarity(qt, nt) > 0.82
            );
            if (found) matched++;
        }
        const tokScore = (matched / qToks.length) * 0.72;
        score = Math.max(score, tokScore);
    }

    // ── E. N-gram similarity (bigramas) ──────────────────────────────────────
    const ngScore = ngramSimilarity(q, nBase, 2) * 0.65;
    score = Math.max(score, ngScore);

    // ── F. El nombre empieza con el query ────────────────────────────────────
    if (nBase.startsWith(q)) score = Math.max(score, 0.74);

    // ── G. Bonus extensión preferida ─────────────────────────────────────────
    if (exts.length > 0 && exts.includes(ext)) {
        score = Math.min(1.0, score + 0.13);
    }

    // ── Penalización por nombre muy largo cuando query es corto ──────────────
    // Previene que "21 Pilots - Stressed Out.mp4" empate con "21 (1).mp4"
    // cuando el query es simplemente "21"
    if (q.length <= 4 && nBase.length > 20) {
        score = Math.max(0, score - 0.04);
    }

    return Math.max(0, Math.min(1, score));
}


/* ══════════════════════════════════════════════════════════════════════════════
   5. RECORRIDO FS CON SCORING
   Recorre rootDir recursivamente, puntúa cada archivo/carpeta y retorna
   candidatos ordenados por score desc, desempatados por tamaño de archivo.
══════════════════════════════════════════════════════════════════════════════ */
function walkAndScore(rootDir, query, options) {
    const opts         = options    || {};
    const typeHint     = opts.typeHint    || null;
    const maxResults   = opts.maxResults  || 30;
    const maxDepth     = opts.maxDepth    || 6;
    const minScore     = opts.minScore    !== undefined ? opts.minScore : 0.22;

    let preferredExts = opts.extensions || [];
    if (preferredExts.length === 0 && typeHint) {
        preferredExts = LA.FILE_TYPE_MAP[typeHint.toLowerCase()] || [];
    }

    const results = [];

    const walk = (dir, depth) => {
        if (depth > maxDepth || results.length >= maxResults * 3) return;
        const base = nodePath.basename(dir).toLowerCase();
        if (SKIP_DIRS.has(base)) return;

        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (_) { return; }

        for (const entry of entries) {
            const ep  = nodePath.join(dir, entry.name);
            const ext = nodePath.extname(entry.name).toLowerCase();
            if (SKIP_EXTS.has(ext)) continue;

            if (entry.isFile()) {
                // Si hay extensiones preferidas y el archivo no las tiene,
                // reducir score mínimo requerido para seguir incluyendo
                const effectiveMin = (preferredExts.length > 0 && !preferredExts.includes(ext))
                    ? minScore + 0.10
                    : minScore;
                const s = scoreFile(query, entry.name, preferredExts);
                if (s >= effectiveMin) {
                    let size = 0;
                    try { size = fs.statSync(ep).size; } catch (_) { }
                    results.push({ name: entry.name, path: ep, dir, ext, score: Math.round(s * 1000) / 1000, size, isDir: false });
                }
            } else if (entry.isDirectory()) {
                const s = scoreFile(query, entry.name, []);
                if (s >= minScore) {
                    results.push({ name: entry.name, path: ep, dir, ext: "", score: Math.round(s * 1000) / 1000, size: 0, isDir: true });
                }
                walk(ep, depth + 1);
            }
        }
    };

    walk(rootDir, 0);

    results.sort((a, b) => {
        const ds = b.score - a.score;
        if (Math.abs(ds) > 0.015) return ds;
        // Desempate 1: nombre más corto gana (más preciso)
        const lenDiff = a.name.length - b.name.length;
        if (Math.abs(lenDiff) > 3) return lenDiff;
        // Desempate 2: archivo más grande gana
        return b.size - a.size;
    });

    return results.slice(0, maxResults);
}


/* ══════════════════════════════════════════════════════════════════════════════
   6. BUSCAR MEJOR ARCHIVO  —  punto de entrada principal
   Limpia el query (quita artículos, palabras de tipo) antes de buscar.
   Retorna el candidato con mayor score o null si no hay nada ≥ minScore.
══════════════════════════════════════════════════════════════════════════════ */
function findBestFile(query, rootDir, options) {
    if (!query || !rootDir) return null;
    const opts = options || {};

    // Detectar tipo de archivo mencionado en el query
    const typeDetected = LA.detectFileTypeMention(query);
    const typeHint     = opts.typeHint || (typeDetected ? typeDetected.keyword : null);

    // Limpiar query: quitar artículos, preposiciones y palabras de tipo
    let cleanQuery = query
        .toLowerCase()
        .replace(/\b(el|la|los|las|un|una|unos|unas|de|del|en|al|a|llamado|llamada|que|se|llama|archivo|carpeta)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (typeDetected) {
        const esc = typeDetected.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        cleanQuery = cleanQuery.replace(new RegExp("\\b" + esc + "\\b", "gi"), " ").replace(/\s+/g, " ").trim();
    }
    if (!cleanQuery || cleanQuery.length < 1) cleanQuery = query.toLowerCase().trim();

    logger.info(`NLPService.findBestFile: query="${cleanQuery}" root="${rootDir}" type=${typeHint || "any"}`);

    const results = walkAndScore(rootDir, cleanQuery, {
        typeHint,
        maxResults: 20,
        maxDepth:   opts.maxDepth || 6,
        minScore:   opts.minScore || 0.20,
    });

    if (results.length === 0) return null;
    logger.info(`NLPService.findBestFile: winner="${results[0].name}" score=${results[0].score}`);
    return results[0];
}


/* ══════════════════════════════════════════════════════════════════════════════
   7. CONTEXT MANAGER
   Historial conversacional con resolución de referencias anafóricas.

   API:
     push({ intent, parameters, message, reply, foundPath? })
     getLast()  →  último turno
     getLastN(n) → últimos n turnos
     resolveReferences(message) → { resolved, contextUsed, hint, correctionExt? }
     isCorrectionOf(message)    → boolean
     clear()
══════════════════════════════════════════════════════════════════════════════ */
function ContextManager(maxHistory) {
    this._max     = maxHistory || 14;
    this._history = [];
}

ContextManager.prototype.push = function(turn) {
    this._history.push({
        intent:     turn.intent      || "",
        parameters: turn.parameters  || {},
        message:    turn.message     || "",
        reply:      turn.reply       || "",
        bot:        turn.bot         || null,
        foundPath:  turn.foundPath   || null,   // ruta real del archivo encontrado
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

ContextManager.prototype.clear    = function() { this._history = []; };
ContextManager.prototype.getAll   = function() { return this._history.slice(); };

/**
 * Resuelve referencias anafóricas en el mensaje nuevo usando el historial.
 *
 * Casos manejados:
 *   a) Referencia directa:  "mueve ese al drive"      → sustituye "ese" por filename
 *   b) Corrección de tipo:  "no, quería el de mkv"    → extrae extensión/tipo
 *   c) Corrección location: "mejor buscalo en desktop" → extrae nueva ubicación
 *   d) Confirmación:        "sí, ese"                  → confirma el archivo previo
 *
 * Retorna: { resolved, contextUsed, hint, correctionExt, correctionLocation }
 */
ContextManager.prototype.resolveReferences = function(message) {
    const last = this.getLast();
    if (!last) return { resolved: message, contextUsed: false, hint: null };

    let resolved         = message;
    let contextUsed      = false;
    let hint             = null;
    let correctionExt    = null;
    let correctionLocation = null;

    const lower = message.toLowerCase().trim();

    // ── a) Patrones anafóricos directos ────────────────────────────────────
    const ANAFORIC_PATTERNS = [
        /(?:^|\s)(ese archivo|esa carpeta|ese video|esa imagen|ese doc|esa foto)(?:\s|$)/gi,
        /(?:^|\s)(el mismo|la misma|lo mismo|el anterior|la anterior|el de antes)(?:\s|$)/gi,
        /(?:^|\s)(ese|esa|este|esta|esto|eso)(?:\s|$)/gi,
        /(?:^|\s)(ese que te dije|eso que mencioné|lo que te dije antes)(?:\s|$)/gi,
    ];
    const hasAnaforic = ANAFORIC_PATTERNS.some(p => { p.lastIndex = 0; return p.test(lower); });

    if (hasAnaforic) {
        const prevFile = last.parameters?.filename ||
                         last.parameters?.source   ||
                         last.parameters?.query    ||
                         (last.foundPath ? nodePath.basename(last.foundPath) : null);
        if (prevFile) {
            let r = message;
            ANAFORIC_PATTERNS.forEach(p => {
                p.lastIndex = 0;
                r = r.replace(p, (match, ref) => match.replace(ref, prevFile));
            });
            resolved    = r;
            contextUsed = true;
            hint        = `Resolví "${message}" → "${resolved}" (contexto: ${prevFile})`;
        }
    }

    // ── b) Corrección de tipo/extensión: "no, el de mkv" / "quería el mp4" ─
    const extMatch = lower.match(/\b(mp4|mkv|avi|mov|mp3|flac|wav|pdf|docx|xlsx|pptx|zip|rar|jpg|jpeg|png|gif|py|js|ts|txt|csv|ogg|aac|m4a|webm)\b/i);
    if (extMatch && this.isCorrectionOf(message)) {
        correctionExt = "." + (extMatch[1] || extMatch[0].trim().replace(/^\./, "")).toLowerCase();
        contextUsed   = true;
        hint          = hint || `Corrección de tipo: extensión detectada "${correctionExt}"`;
    }

    // ── c) Refinamiento de ubicación ────────────────────────────────────────
    const locMatch = lower.match(/(?:^|\b)(?:en|desde|en el|desde el|de la?)\s+(desktop|escritorio|downloads?|descargas?|documents?|documentos?|pictures?|imágenes?|imagenes?|videos?|music|música|musica|[\w\s\\\/]{3,30})(?:\s|$)/i);
    if (locMatch && (this.isCorrectionOf(message) || lower.split(/\s+/).length <= 5)) {
        correctionLocation = locMatch[1].trim();
        contextUsed        = true;
        hint               = hint || `Refinamiento de ubicación: "${correctionLocation}"`;
    }

    return { resolved, contextUsed, hint, correctionExt, correctionLocation };
};

/**
 * Detecta si el nuevo mensaje es una corrección/refinamiento del anterior.
 * Cubre español informal rioplatense.
 */
ContextManager.prototype.isCorrectionOf = function(message) {
    const lower = message.toLowerCase().trim();
    return /^(no[,\s!]|mejor\b|en realidad|quería\b|quiero\b|me refería|el otro\b|la otra\b|ese no\b|esa no\b|un de\b|era el\b|era la\b|perdón|perdon\b|dale\b|igual\b|pero\b)/.test(lower);
};


/* ══════════════════════════════════════════════════════════════════════════════
   8. PARSER DE COMANDOS DE ARCHIVO
   Extrae { action, filename, location, typeHint, preferredExts, raw }
   del mensaje en lenguaje natural (español rioplatense informal).

   IMPORTANTE — Fix v3:
   \b falla con caracteres acentuados (é, á, ó, ú, í) en regex JavaScript.
   Todos los patrones de acción usan (?:^|\s)VERBO(?=\s|$) en su lugar.
══════════════════════════════════════════════════════════════════════════════ */
function parseFileCommand(message) {
    // Normalizar: quitar puntuación al final, colapsar espacios
    const m     = message.trim().replace(/[!¡¿?]+$/, "");
    const lower = m.toLowerCase();

    // ── Detección de acción ──────────────────────────────────────────────────
    // NOTA: usamos (?:^|\s) y (?=\s|$|,) en lugar de \b para soportar tildes
    const isDriveTarget = /(?:^|\s)(?:al?\s+)?(?:drive|nube|google\s*drive)(?:\s|$)/.test(lower);

    let action = "search";

    // Acción: mover → drive
    if (/(?:^|\s)(?:mové|movelo|mover|mueve|muévelo|subí|subilo|subir|sube|llevá|llevalo|mandale|mandá|mandalo|pasame|pasá|pasalo|pasar|cargá|cargalo|cargar|ponelo|poné\s+en)(?:\s|$)/.test(lower)) {
        action = isDriveTarget ? "move_to_drive" : "move";
    }
    // Acción: copiar → drive
    else if (/(?:^|\s)(?:copiá|copialo|copiar|copia|hacé\s+una\s+copia)(?:\s|$)/.test(lower)) {
        action = isDriveTarget ? "copy_to_drive" : "copy";
    }
    // Acción: eliminar
    else if (/(?:^|\s)(?:eliminá|eliminalo|eliminar|borrá|borralo|borrar|tirá|tiralo|tirar|quitá|quitalo|quitar|remové|remove|delete)(?:\s|$)/.test(lower)) {
        action = "delete";
    }
    // Acción: listar / ver contenido
    else if (/(?:^|\s)(?:listá|listar|lista|mostrame|mostrá|ver\s+(?:el\s+)?contenido|qué\s+hay|que\s+hay|listar)(?:\s|$)/.test(lower)) {
        action = "list";
    }
    // Acción: buscar / encontrar
    else if (/(?:^|\s)(?:buscá|buscar|busca|encontrá|encontrar|dónde\s+está|donde\s+esta|hallá|hallar)(?:\s|$)/.test(lower)) {
        action = "search";
    }
    // Acción: crear
    else if (/(?:^|\s)(?:creá|crear|crea|hacé|hacer\s+(?:una?\s+)?(?:carpeta|archivo)|new\s+folder)(?:\s|$)/.test(lower)) {
        action = "create";
    }

    // Si no detectó acción explícita pero hay target drive → inferir move_to_drive
    if (action === "search" && isDriveTarget) {
        action = "move_to_drive";
    }

    // ── Detección de ubicación (desde / en) ──────────────────────────────────
    let location = null;
    const locPatterns = [
        // "desde el desktop" / "desde descargas"
        /(?:desde\s+(?:el\s+|la\s+)?)([a-záéíóúüñ][a-záéíóúüñ\s\\\/]{1,40}?)(?:\s+(?:al?|a\s+la|hacia|para)\s|$)/i,
        // "en el escritorio" / "en downloads"
        /(?:en\s+(?:el\s+|la\s+)?)([a-záéíóúüñ][a-záéíóúüñ\s\\\/]{1,40}?)(?:\s+(?:al?|a\s+la|hacia|para|y)\s|$)/i,
        // "del escritorio" / "de descargas"
        /(?:del?\s+|de\s+la\s+)([a-záéíóúüñ][a-záéíóúüñ\s\\\/]{1,30}?)(?:\s+(?:al?|hacia|para)\s|$)/i,
    ];
    for (const p of locPatterns) {
        const lm = m.match(p);
        if (lm) { location = lm[1].trim(); break; }
    }

    // ── Extracción de nombre de archivo ──────────────────────────────────────
    let filename = null;
    const filePatterns = [
        // "mové/subí/pasame [el/la] NOMBRE desde/al/hacia"
        /(?:mové|movelo|mueve|subí|subilo|llevá|mandá|pasame|pasalo|pasá|copiá|eliminá|borrá|tirá|quitá)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+|desde\s+|hacia\s+|para\s+|en\s+)/i,
        // "NOMBRE al drive" / "NOMBRE a la nube"
        /^(.+?)\s+(?:al?\s+(?:drive|nube|google\s*drive)|a\s+la\s+nube)/i,
        // "buscá [el/la] [tipo] NOMBRE [en...]"
        /(?:buscá|busca|encontrá)\s+(?:el\s+|la\s+)?((?:foto|video|imagen|doc|archivo)\s+.+?|.+?)(?:\s+en\s+.+)?$/i,
        // Con extensión explícita: "el archivo tarea.pdf"
        /(?:archivo\s+|fichero\s+|el\s+|la\s+)([^\s]+\.\w{1,5})/i,
        // "eliminá/borrá NOMBRE"
        /(?:eliminá|eliminar|borrá|borrar|tirá|tirar|quitá)\s+(?:el\s+|la\s+)?(.+?)(?:\s+del?\s+.+)?$/i,
        // Fallback: todo lo que no sea preposición al final
        /^(?:\w+\s+)?(.+?)(?:\s+(?:al?|desde|en|hacia|para|del?)\s+\w|\s*$)/i,
    ];

    for (const p of filePatterns) {
        const fm = m.match(p);
        if (fm && fm[1]) {
            let candidate = fm[1].trim()
                // Quitar artículos al inicio
                .replace(/^(el|la|los|las|un|una)\s+/i, "")
                // Quitar palabras de acción que hayan quedado
                .replace(/^(mové|movelo|pasame|subí|buscá|borrá|eliminá|copiá|llevá)\s+/i, "")
                .trim();
            if (candidate.length >= 2 && candidate.length <= 120) {
                filename = candidate;
                break;
            }
        }
    }

    const typeDetected = LA.detectFileTypeMention(message);

    return {
        action,
        filename,
        location,
        typeHint:      typeDetected ? typeDetected.keyword   : null,
        preferredExts: typeDetected ? typeDetected.extensions : [],
        raw:           m,
    };
}


/* ══════════════════════════════════════════════════════════════════════════════
   SINGLETON: contexto global compartido entre módulos
══════════════════════════════════════════════════════════════════════════════ */
const globalContext = new ContextManager(14);


/* ══════════════════════════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════════════════════════ */
module.exports = {
    // Métricas de similitud
    levenshtein,
    stringSimilarity,
    ngramSimilarity,
    scoreFile,

    // Búsqueda en sistema de archivos
    walkAndScore,
    findBestFile,

    // Contexto conversacional
    ContextManager,
    context: globalContext,

    // Parser de comandos
    parseFileCommand,

    // Re-exports de LanguageAliases (acceso unificado)
    applyAliases:          LA.applyAliases,
    detectFileTypeMention: LA.detectFileTypeMention,
    resolveFolderAlias:    LA.resolveFolderAlias,
    stripWakeWord:         LA.stripWakeWord,
    FILE_TYPE_MAP:         LA.FILE_TYPE_MAP,
    FOLDER_ALIASES:        LA.FOLDER_ALIASES,
};