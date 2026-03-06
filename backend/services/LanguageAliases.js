/**
 * LanguageAliases.js — Diccionario centralizado de equivalencias lingüísticas
 * Jarvis NLP Layer — fuente única de verdad para aliases, typos, tipos de archivo.
 */
"use strict";

// 1. ALIASES DE APLICACIONES
const APP_ALIASES = [
    [/\bwhastsapp\b/gi, "whatsapp"], [/\bwhatasapp\b/gi, "whatsapp"],
    [/\bwhsatapp\b/gi, "whatsapp"],  [/\bwatssap\b/gi, "whatsapp"],
    [/\bwatshap\b/gi, "whatsapp"],   [/\bwassap\b/gi, "whatsapp"],
    [/\bwatsap\b/gi, "whatsapp"],    [/\bwtsap\b/gi, "whatsapp"],
    [/\bwasap\b/gi, "whatsapp"],     [/\bwpp\b/gi, "whatsapp"],
    [/\bwsp\b/gi, "whatsapp"],
    [/\byuotube\b/gi, "youtube"],    [/\byoutuve\b/gi, "youtube"],
    [/\byoutub\b/gi, "youtube"],     [/\byutube\b/gi, "youtube"],
    [/\byou\s*tube\b/gi, "youtube"],
    [/\bspotifay\b/gi, "spotify"],   [/\bspotfiy\b/gi, "spotify"],
    [/\bspotifi\b/gi, "spotify"],
    [/\bcrhome\b/gi, "chrome"],      [/\bchorme\b/gi, "chrome"],
    [/\bchrom\b/gi, "chrome"],
    [/\bdiscrod\b/gi, "discord"],    [/\bdiscrdo\b/gi, "discord"],
    [/\bgoogle\s+driev\b/gi, "drive"], [/\bdirve\b/gi, "drive"],
    [/\bla\s+nube\b/gi, "drive"],
    [/\bvs\s*code\b/gi, "vscode"],   [/\bvisual\s+studio\b/gi, "vscode"],
    [/\bforni\b/gi, "fortnite"],     [/\bfortni\b/gi, "fortnite"],
];

// 2. CORRECCIONES TIPOGRAFICAS
const TYPO_FIXES = [
    [/\binforamcion\b/gi, "información"], [/\bifromacion\b/gi, "información"],
    [/\binfromacion\b/gi, "información"], [/\binfomacion\b/gi, "información"],
    [/\binformacion\b/gi, "información"], [/\binfomación\b/gi, "información"],
    [/\bcuaando\b/gi, "cuando"],   [/\bciando\b/gi, "cuando"],
    [/\bcuandp\b/gi, "cuando"],    [/\bqando\b/gi, "cuando"],
    [/\bescritoroi\b/gi, "escritorio"], [/\bescritorioo\b/gi, "escritorio"],
    [/\bdesltop\b/gi, "desktop"],  [/\bdesctop\b/gi, "desktop"],
    [/\bvolumne\b/gi, "volumen"],  [/\bvoluem\b/gi, "volumen"],
    [/\bvolumn\b/gi, "volumen"],
    [/\bmusica\b/gi, "música"],    [/\bcanciones\b/gi, "canciones"],
    [/\bcancion\b/gi, "canción"],
    [/\bpantallla\b/gi, "pantalla"], [/\bpantala\b/gi, "pantalla"],
    [/\baplicacion\b/gi, "aplicación"], [/\bapicacion\b/gi, "aplicación"],
    [/\barchibo\b/gi, "archivo"],  [/\bcarpeja\b/gi, "carpeta"],
    [/\bprogama\b/gi, "programa"],
];

// 3. VERBOS RIOPLATENSES
const VERB_ALIASES = [
    [/\babrir\b/gi, "abrí"],       [/\babre\b/gi, "abrí"],
    [/\bcerrar\b/gi, "cerrá"],     [/\bcierra\b/gi, "cerrá"],
    [/\bpausar\b/gi, "pausá"],     [/\bpause\b/gi, "pausá"],
    [/\bsubir\b/gi, "subí"],       [/\bsube\b/gi, "subí"],
    [/\bbajar\b/gi, "bajá"],       [/\bbaja\b/gi, "bajá"],
    [/\bsilenciar\b/gi, "silenciá"], [/\bsilencia\b/gi, "silenciá"],
    [/\bmutear\b/gi, "muteá"],     [/\bmute\b/gi, "muteá"],
    [/\bmandar\b/gi, "mandá"],     [/\bmanda\b(?!\w)/gi, "mandá"],
    [/\bbuscar\b/gi, "buscá"],     [/\bbusca\b(?!\w)/gi, "buscá"],
    [/\bmover\b/gi, "mová"],       [/\bmueve\b/gi, "mové"],
    [/\bactivar\b/gi, "activá"],   [/\bactiva\b(?!\w)/gi, "activá"],
    [/\btomar\b/gi, "tomá"],       [/\btoma\b(?!\w)/gi, "tomá"],
    [/\bponele\b/gi, "poné"],      [/\bponle\b/gi, "poné"],
    [/\bpon\b(?!\w)/gi, "poné"],
    [/\bpasar\b/gi, "pasá"],       [/\bpasa\b(?!\w)/gi, "pasá"],
];

// 4. CLASIFICACION SEMANTICA DE TIPOS DE ARCHIVO
const FILE_TYPE_MAP = {
    video:        [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv", ".m4v", ".ts"],
    videos:       [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv", ".m4v", ".ts"],
    película:     [".mp4", ".mkv", ".avi", ".mov"],
    pelicula:     [".mp4", ".mkv", ".avi", ".mov"],
    serie:        [".mp4", ".mkv", ".avi"],
    clip:         [".mp4", ".mov", ".webm", ".avi"],
    grabacion:    [".mp4", ".mkv", ".avi", ".mov", ".webm"],
    grabación:    [".mp4", ".mkv", ".avi", ".mov", ".webm"],
    imagen:       [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".avif"],
    imágen:       [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic"],
    foto:         [".jpg", ".jpeg", ".png", ".heic", ".webp", ".avif"],
    fotos:        [".jpg", ".jpeg", ".png", ".heic", ".webp", ".avif"],
    screenshot:   [".png", ".jpg", ".jpeg"],
    captura:      [".png", ".jpg", ".jpeg"],
    fondo:        [".jpg", ".jpeg", ".png", ".webp"],
    audio:        [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus"],
    música:       [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
    musica:       [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
    canción:      [".mp3", ".wav", ".flac", ".aac"],
    cancion:      [".mp3", ".wav", ".flac", ".aac"],
    pista:        [".mp3", ".wav", ".flac", ".aac", ".ogg"],
    documento:    [".pdf", ".docx", ".doc", ".odt", ".rtf", ".txt"],
    doc:          [".pdf", ".docx", ".doc", ".odt"],
    pdf:          [".pdf"],
    word:         [".docx", ".doc", ".odt"],
    texto:        [".txt", ".md", ".rtf"],
    nota:         [".txt", ".md", ".rtf", ".docx"],
    planilla:     [".xlsx", ".xls", ".csv", ".ods"],
    excel:        [".xlsx", ".xls", ".csv"],
    hoja:         [".xlsx", ".xls", ".csv", ".ods"],
    tabla:        [".xlsx", ".xls", ".csv"],
    csv:          [".csv"],
    presentacion: [".pptx", ".ppt", ".odp"],
    presentación: [".pptx", ".ppt", ".odp"],
    slides:       [".pptx", ".ppt", ".odp"],
    diapositivas: [".pptx", ".ppt", ".odp"],
    codigo:       [".js", ".ts", ".py", ".java", ".cpp", ".c", ".cs", ".php", ".rb", ".go", ".rs", ".jsx", ".tsx", ".html", ".css", ".sh"],
    código:       [".js", ".ts", ".py", ".java", ".cpp", ".c", ".cs", ".php", ".rb", ".go", ".rs", ".jsx", ".tsx", ".html", ".css", ".sh"],
    script:       [".js", ".py", ".sh", ".bat", ".ps1", ".rb"],
    programa:     [".exe", ".msi", ".app", ".dmg"],
    instalador:   [".exe", ".msi", ".dmg", ".pkg"],
    zip:          [".zip", ".rar", ".7z", ".tar", ".gz"],
    comprimido:   [".zip", ".rar", ".7z", ".tar", ".gz"],
    archivo:      [],
    carpeta:      [],
};

// 5. ALIASES DE CARPETAS
const FOLDER_ALIASES = {
    "desktop":                 "Desktop",
    "escritorio":              "Desktop",
    "el escritorio":           "Desktop",
    "el desktop":              "Desktop",
    "mi escritorio":           "Desktop",
    "downloads":               "Downloads",
    "descargas":               "Downloads",
    "las descargas":           "Downloads",
    "la carpeta de descargas": "Downloads",
    "documents":               "Documents",
    "documentos":              "Documents",
    "mis documentos":          "Documents",
    "pictures":                "Pictures",
    "imágenes":                "Pictures",
    "imagenes":                "Pictures",
    "mis fotos":               "Pictures",
    "fotos":                   "Pictures",
    "videos":                  "Videos",
    "mis videos":              "Videos",
    "películas":               "Videos",
    "peliculas":               "Videos",
    "music":                   "Music",
    "música":                  "Music",
    "musica":                  "Music",
    "c:":                      "C:\\",
    "raiz":                    "C:\\",
    "raíz":                    "C:\\",
};

// 6. ALIASES FONETICOS WAKE WORD
// Mas largos primero para que el matching no corte coincidencias parciales.
const WAKE_WORD_PHONETIC_ALIASES = [
    "hey llarvis", "oye llarvis", "hei llarvis",
    "hey yarvis",  "oye yarvis",  "ey yarvis",
    "hey jarvis",  "oye jarvis",  "hei jarvis",
    "ei jarvis",   "ay jarvis",   "ey jarvis",
    "a ver jarvis",
    "llarvis",  "llarvi",   "llarviz",  "llarbis",
    "yarvis",   "yarvi",    "yarviz",
    "jarvis",   "jarvi",    "jarviz",   "jarves",
    "jarvist",  "jarviss",  "jarvys",
    "harvis",   "garvis",   "marvis",   "carvis",
    "jarbes",
];

// ── FUNCIONES ────────────────────────────────────────────────────────────────

function applyAliases(text, options) {
    const opts = options || {};
    const doApps  = opts.applyApps  !== false;
    const doTypos = opts.applyTypos !== false;
    const doVerbs = opts.applyVerbs !== false;
    if (!text) return { text: "", changed: false, corrections: [] };
    let result = text;
    const corrections = [];
    const run = (rules) => {
        for (const pair of rules) {
            const before = result;
            try { result = result.replace(pair[0], pair[1]); } catch (_) { }
            if (result !== before) corrections.push({ from: before, to: result });
        }
    };
    if (doApps)  run(APP_ALIASES);
    if (doTypos) run(TYPO_FIXES);
    if (doVerbs) run(VERB_ALIASES);
    return { text: result, changed: result !== text, corrections: corrections };
}

function detectFileTypeMention(message) {
    if (!message) return null;
    const entries = Object.entries(FILE_TYPE_MAP).sort(function(a, b) { return b[0].length - a[0].length; });
    for (const entry of entries) {
        const keyword = entry[0];
        const extensions = entry[1];
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("\\b" + escaped + "\\b", "i");
        if (re.test(message)) return { keyword: keyword, extensions: extensions };
    }
    return null;
}

function resolveFolderAlias(name, userProfile) {
    if (!name) return null;
    const key = name.toLowerCase().trim();
    const mapped = FOLDER_ALIASES[key];
    if (!mapped) return null;
    const nodePath = require("path");
    const base = userProfile || process.env.USERPROFILE || "C:\\Users\\Tobias";
    if (/^[A-Za-z]:\\/.test(mapped) || mapped.startsWith("\\\\")) return mapped;
    return nodePath.join(base, mapped);
}

function stripWakeWord(text) {
    if (!text) return text;
    const escaped = WAKE_WORD_PHONETIC_ALIASES
        .slice()
        .sort(function(a, b) { return b.length - a.length; })
        .map(function(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    const pattern = new RegExp("^(?:" + escaped.join("|") + ")[,\\.\\s!\\?]*", "i");
    return text.replace(pattern, "").trim();
}

module.exports = {
    APP_ALIASES: APP_ALIASES,
    TYPO_FIXES: TYPO_FIXES,
    VERB_ALIASES: VERB_ALIASES,
    FILE_TYPE_MAP: FILE_TYPE_MAP,
    FOLDER_ALIASES: FOLDER_ALIASES,
    WAKE_WORD_PHONETIC_ALIASES: WAKE_WORD_PHONETIC_ALIASES,
    applyAliases: applyAliases,
    detectFileTypeMention: detectFileTypeMention,
    resolveFolderAlias: resolveFolderAlias,
    stripWakeWord: stripWakeWord,
};