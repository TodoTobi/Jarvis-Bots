/**
 * LanguageAliases.js  ·  Jarvis NLP Engine v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Fuente única de verdad para equivalencias lingüísticas del sistema Jarvis.
 *
 * Módulos:
 *   APP_ALIASES              — wassap→whatsapp, youtuve→youtube, etc.
 *   TYPO_FIXES               — ifromacion→información, ciando→cuando, etc.
 *   VERB_ALIASES             — verbos rioplatenses informales (sin tilde)
 *   FILE_TYPE_MAP            — "video"→[".mp4",".mkv",...], "imagen"→[...], etc.
 *   FOLDER_ALIASES           — "escritorio"→"Desktop", "descargas"→"Downloads"
 *   WAKE_WORD_PHONETIC_ALIASES — llarvis/yarvis/harvis → jarvis (para STT)
 *
 *   applyAliases(text)       — aplica los tres primeros grupos
 *   detectFileTypeMention(m) — detecta tipo semántico en el mensaje
 *   resolveFolderAlias(name) — alias de carpeta → ruta real
 *   stripWakeWord(text)      — elimina wake word del inicio de una transcripción
 *
 * IMPORTANTE — Fix v3:
 *   \b falla con chars acentuados en JS. Todos los patrones de VERB_ALIASES
 *   que terminan en vocal acentuada (abrí, cerrá, pausá…) usan (?!\w) en lugar
 *   de \b como anchor de fin, y (?:^|\s) como anchor de inicio.
 *
 * Ruta de instalación: backend/services/LanguageAliases.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";


/* ══════════════════════════════════════════════════════════════════════════════
   1. ALIASES DE APLICACIONES Y SERVICIOS
   Formato: [ /regex/gi , "corrección" ]
   Orden: de más específico/largo a más genérico para evitar solapamientos.
══════════════════════════════════════════════════════════════════════════════ */
const APP_ALIASES = [
    // ── WhatsApp ─────────────────────────────────────────────────────────────
    [/\bwhastsapp\b/gi,       "whatsapp"],
    [/\bwhatasapp\b/gi,       "whatsapp"],
    [/\bwhsatapp\b/gi,        "whatsapp"],
    [/\bwatssap\b/gi,         "whatsapp"],
    [/\bwatshap\b/gi,         "whatsapp"],
    [/\bwassap\b/gi,          "whatsapp"],
    [/\bwatsap\b/gi,          "whatsapp"],
    [/\bwtsap\b/gi,           "whatsapp"],
    [/\bwasap\b/gi,           "whatsapp"],
    [/\bwpp\b/gi,             "whatsapp"],
    [/\bwsp\b/gi,             "whatsapp"],

    // ── YouTube ──────────────────────────────────────────────────────────────
    [/\byuotube\b/gi,         "youtube"],
    [/\byoutuve\b/gi,         "youtube"],
    [/\byoutub\b/gi,          "youtube"],
    [/\byutube\b/gi,          "youtube"],
    [/\byou\s*tube\b/gi,      "youtube"],

    // ── Spotify ──────────────────────────────────────────────────────────────
    [/\bspotifay\b/gi,        "spotify"],
    [/\bspotfiy\b/gi,         "spotify"],
    [/\bspotifi\b/gi,         "spotify"],

    // ── Chrome ───────────────────────────────────────────────────────────────
    [/\bcrhome\b/gi,          "chrome"],
    [/\bchorme\b/gi,          "chrome"],
    [/\bchrom\b/gi,           "chrome"],

    // ── Discord ──────────────────────────────────────────────────────────────
    [/\bdiscrod\b/gi,         "discord"],
    [/\bdiscrdo\b/gi,         "discord"],

    // ── Google Drive ─────────────────────────────────────────────────────────
    [/\bgoogle\s+driev\b/gi,  "drive"],
    [/\bdirve\b/gi,           "drive"],
    [/\bla\s+nube\b/gi,       "drive"],

    // ── VS Code ──────────────────────────────────────────────────────────────
    [/\bvs\s*code\b/gi,       "vscode"],
    [/\bvisual\s+studio\b/gi, "vscode"],

    // ── Otros ────────────────────────────────────────────────────────────────
    [/\bforni\b/gi,           "fortnite"],
    [/\bfortni\b/gi,          "fortnite"],
    [/\bsteamer\b/gi,         "steam"],
    [/\btwitche?r?\b/gi,      "twitch"],
];


/* ══════════════════════════════════════════════════════════════════════════════
   2. CORRECCIONES TIPOGRÁFICAS
   Palabras comunes mal escritas o sin tilde.
══════════════════════════════════════════════════════════════════════════════ */
const TYPO_FIXES = [
    // Información
    [/\binforamcion\b/gi,   "información"],
    [/\bifromacion\b/gi,    "información"],
    [/\binfromacion\b/gi,   "información"],
    [/\binfomacion\b/gi,    "información"],
    [/\binformacion\b/gi,   "información"],
    [/\binfomación\b/gi,    "información"],

    // Cuando
    [/\bcuaando\b/gi,       "cuando"],
    [/\bciando\b/gi,        "cuando"],
    [/\bcuandp\b/gi,        "cuando"],
    [/\bqando\b/gi,         "cuando"],

    // Desktop / Escritorio
    [/\bescritoroi\b/gi,    "escritorio"],
    [/\bescritorioo\b/gi,   "escritorio"],
    [/\bdesltop\b/gi,       "desktop"],
    [/\bdesctop\b/gi,       "desktop"],

    // Volumen
    [/\bvolumne\b/gi,       "volumen"],
    [/\bvoluem\b/gi,        "volumen"],
    [/\bvolumn\b/gi,        "volumen"],

    // Música / Canción
    [/\bmusica\b/gi,        "música"],
    [/\bcanciones\b/gi,     "canciones"],
    [/\bcancion\b/gi,       "canción"],

    // General
    [/\bpantallla\b/gi,     "pantalla"],
    [/\bpantala\b/gi,       "pantalla"],
    [/\baplicacion\b/gi,    "aplicación"],
    [/\bapicacion\b/gi,     "aplicación"],
    [/\barchibo\b/gi,       "archivo"],
    [/\bcarpeja\b/gi,       "carpeta"],
    [/\bprogama\b/gi,       "programa"],
    [/\bcontrasena\b/gi,    "contraseña"],
    [/\bcontrasenia\b/gi,   "contraseña"],
];


/* ══════════════════════════════════════════════════════════════════════════════
   3. VERBOS RIOPLATENSES INFORMALES
   Fix v3: \b falla con chars acentuados en JS.
   Usar (?:^|\s) y (?!\w) para anchors con tildes.
   Se aplican ANTES del procesamiento NLP para normalizar el mensaje.
══════════════════════════════════════════════════════════════════════════════ */
const VERB_ALIASES = [
    // abrí
    [/(^|\s)abrir(\s|$)/gi,    "$1abrí$2"],
    [/(^|\s)abre(\s|$)/gi,     "$1abrí$2"],
    // cerrá
    [/(^|\s)cerrar(\s|$)/gi,   "$1cerrá$2"],
    [/(^|\s)cierra(\s|$)/gi,   "$1cerrá$2"],
    // pausá
    [/(^|\s)pausar(\s|$)/gi,   "$1pausá$2"],
    [/(^|\s)pause(\s|$)/gi,    "$1pausá$2"],
    // subí
    [/(^|\s)subir(\s|$)/gi,    "$1subí$2"],
    [/(^|\s)sube(\s|$)/gi,     "$1subí$2"],
    // bajá
    [/(^|\s)bajar(\s|$)/gi,    "$1bajá$2"],
    [/(^|\s)baja(\s|$)/gi,     "$1bajá$2"],
    // silenciá
    [/(^|\s)silenciar(\s|$)/gi,"$1silenciá$2"],
    [/(^|\s)silencia(\s|$)/gi, "$1silenciá$2"],
    // muteá
    [/(^|\s)mutear(\s|$)/gi,   "$1muteá$2"],
    [/(^|\s)mute(\s|$)/gi,     "$1muteá$2"],
    // mandá
    [/(^|\s)mandar(\s|$)/gi,   "$1mandá$2"],
    [/(^|\s)manda(\s|$)/gi,    "$1mandá$2"],
    // buscá
    [/(^|\s)buscar(\s|$)/gi,   "$1buscá$2"],
    [/(^|\s)busca(\s|$)/gi,    "$1buscá$2"],
    // mová / mové
    [/(^|\s)mover(\s|$)/gi,    "$1mová$2"],
    [/(^|\s)mueve(\s|$)/gi,    "$1mové$2"],
    // activá
    [/(^|\s)activar(\s|$)/gi,  "$1activá$2"],
    [/(^|\s)activa(\s|$)/gi,   "$1activá$2"],
    // tomá
    [/(^|\s)tomar(\s|$)/gi,    "$1tomá$2"],
    [/(^|\s)toma(\s|$)/gi,     "$1tomá$2"],
    // poné
    [/(^|\s)ponele(\s|$)/gi,   "$1poné$2"],
    [/(^|\s)ponle(\s|$)/gi,    "$1poné$2"],
    [/(^|\s)pon(\s|$)/gi,      "$1poné$2"],
    // pasá
    [/(^|\s)pasar(\s|$)/gi,    "$1pasá$2"],
    [/(^|\s)pasa(\s|$)/gi,     "$1pasá$2"],
    // reiniciá
    [/(^|\s)reiniciar(\s|$)/gi,"$1reiniciá$2"],
    [/(^|\s)reinicia(\s|$)/gi, "$1reiniciá$2"],
];


/* ══════════════════════════════════════════════════════════════════════════════
   4. CLASIFICACIÓN SEMÁNTICA DE TIPOS DE ARCHIVO
   Cuando el usuario menciona un concepto ("video", "imagen", "código"…),
   el motor de búsqueda prioriza estas extensiones (+13% en el score).
══════════════════════════════════════════════════════════════════════════════ */
const FILE_TYPE_MAP = {
    // ── Video ────────────────────────────────────────────────────────────────
    video:        [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv", ".m4v", ".ts", ".3gp"],
    videos:       [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv", ".m4v", ".ts"],
    película:     [".mp4", ".mkv", ".avi", ".mov"],
    pelicula:     [".mp4", ".mkv", ".avi", ".mov"],
    serie:        [".mp4", ".mkv", ".avi"],
    clip:         [".mp4", ".mov", ".webm", ".avi"],
    grabacion:    [".mp4", ".mkv", ".avi", ".mov", ".webm"],
    grabación:    [".mp4", ".mkv", ".avi", ".mov", ".webm"],

    // ── Imagen ───────────────────────────────────────────────────────────────
    imagen:       [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".avif", ".tiff"],
    imágen:       [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic"],
    foto:         [".jpg", ".jpeg", ".png", ".heic", ".webp", ".avif"],
    fotos:        [".jpg", ".jpeg", ".png", ".heic", ".webp", ".avif"],
    screenshot:   [".png", ".jpg", ".jpeg"],
    captura:      [".png", ".jpg", ".jpeg"],
    fondo:        [".jpg", ".jpeg", ".png", ".webp"],
    wallpaper:    [".jpg", ".jpeg", ".png", ".webp"],

    // ── Audio ─────────────────────────────────────────────────────────────────
    audio:        [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus"],
    música:       [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
    musica:       [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
    canción:      [".mp3", ".wav", ".flac", ".aac"],
    cancion:      [".mp3", ".wav", ".flac", ".aac"],
    pista:        [".mp3", ".wav", ".flac", ".aac", ".ogg"],

    // ── Documento ────────────────────────────────────────────────────────────
    documento:    [".pdf", ".docx", ".doc", ".odt", ".rtf", ".txt"],
    doc:          [".pdf", ".docx", ".doc", ".odt"],
    pdf:          [".pdf"],
    word:         [".docx", ".doc", ".odt"],
    texto:        [".txt", ".md", ".rtf"],
    nota:         [".txt", ".md", ".rtf", ".docx"],

    // ── Planilla ─────────────────────────────────────────────────────────────
    planilla:     [".xlsx", ".xls", ".csv", ".ods"],
    excel:        [".xlsx", ".xls", ".csv"],
    hoja:         [".xlsx", ".xls", ".csv", ".ods"],
    tabla:        [".xlsx", ".xls", ".csv"],
    csv:          [".csv"],

    // ── Presentación ─────────────────────────────────────────────────────────
    presentacion: [".pptx", ".ppt", ".odp"],
    presentación: [".pptx", ".ppt", ".odp"],
    slides:       [".pptx", ".ppt", ".odp"],
    diapositivas: [".pptx", ".ppt", ".odp"],

    // ── Código ───────────────────────────────────────────────────────────────
    codigo:       [".js", ".ts", ".py", ".java", ".cpp", ".c", ".cs", ".php", ".rb", ".go", ".rs", ".jsx", ".tsx", ".html", ".css", ".sh", ".ps1"],
    código:       [".js", ".ts", ".py", ".java", ".cpp", ".c", ".cs", ".php", ".rb", ".go", ".rs", ".jsx", ".tsx", ".html", ".css", ".sh"],
    script:       [".js", ".py", ".sh", ".bat", ".ps1", ".rb", ".ts"],
    programa:     [".exe", ".msi", ".app", ".dmg"],
    instalador:   [".exe", ".msi", ".dmg", ".pkg"],

    // ── Comprimido ───────────────────────────────────────────────────────────
    zip:          [".zip", ".rar", ".7z", ".tar", ".gz", ".tar.gz"],
    comprimido:   [".zip", ".rar", ".7z", ".tar", ".gz"],

    // ── Genérico (sin filtro de extensión) ───────────────────────────────────
    archivo:      [],
    carpeta:      [],
};


/* ══════════════════════════════════════════════════════════════════════════════
   5. ALIASES DE CARPETAS DEL SISTEMA
   Nombre informal → nombre relativo al USERPROFILE
══════════════════════════════════════════════════════════════════════════════ */
const FOLDER_ALIASES = {
    "desktop":                    "Desktop",
    "escritorio":                 "Desktop",
    "el escritorio":              "Desktop",
    "el desktop":                 "Desktop",
    "mi escritorio":              "Desktop",

    "downloads":                  "Downloads",
    "descargas":                  "Downloads",
    "las descargas":              "Downloads",
    "la carpeta de descargas":    "Downloads",

    "documents":                  "Documents",
    "documentos":                 "Documents",
    "mis documentos":             "Documents",

    "pictures":                   "Pictures",
    "imágenes":                   "Pictures",
    "imagenes":                   "Pictures",
    "mis fotos":                  "Pictures",
    "fotos":                      "Pictures",

    "videos":                     "Videos",
    "mis videos":                 "Videos",
    "películas":                  "Videos",
    "peliculas":                  "Videos",

    "music":                      "Music",
    "música":                     "Music",
    "musica":                     "Music",

    "c:":                         "C:\\",
    "raiz":                       "C:\\",
    "raíz":                       "C:\\",
    "disco c":                    "C:\\",
};


/* ══════════════════════════════════════════════════════════════════════════════
   6. ALIASES FONÉTICOS PARA WAKE WORD
   Transcripciones alternativas que el STT puede generar en lugar de "jarvis".
   Más largos primero — el matching usa este orden para evitar cortes parciales.
══════════════════════════════════════════════════════════════════════════════ */
const WAKE_WORD_PHONETIC_ALIASES = [
    // Con activador + variantes ll/y  (los más específicos primero)
    "hey llarvis", "oye llarvis", "hei llarvis",
    "hey yarvis",  "oye yarvis",  "ey yarvis",
    "hey jarvis",  "oye jarvis",  "hei jarvis",
    "ei jarvis",   "ay jarvis",   "ey jarvis",
    "a ver jarvis",

    // Pronunciación ll (rioplatense: ll y y suenan igual)
    "llarvis",  "llarvi",  "llarviz",  "llarbis",

    // Pronunciación y (yeísmo)
    "yarvis",   "yarvi",   "yarviz",

    // Pronunciación j estándar + variantes STT
    "jarvis",   "jarvi",   "jarviz",   "jarves",
    "jarvist",  "jarviss", "jarvys",

    // Errores comunes de STT y pronunciación
    "harvis",   "garvis",   "marvis",   "carvis",
    "jarbes",   "jarbis",
];


/* ══════════════════════════════════════════════════════════════════════════════
   FUNCIÓN: applyAliases
   Aplica APP_ALIASES + TYPO_FIXES + VERB_ALIASES al texto en orden.
   Retorna: { text, changed, corrections[] }
══════════════════════════════════════════════════════════════════════════════ */
function applyAliases(text, options) {
    const opts = options || {};
    if (!text) return { text: "", changed: false, corrections: [] };

    const doApps  = opts.applyApps  !== false;
    const doTypos = opts.applyTypos !== false;
    const doVerbs = opts.applyVerbs !== false;

    let result = text;
    const corrections = [];

    const run = (rules) => {
        for (const pair of rules) {
            const before = result;
            try { result = result.replace(pair[0], pair[1]); } catch (_) { /* skip */ }
            if (result !== before) corrections.push({ from: before, to: result });
        }
    };

    if (doApps)  run(APP_ALIASES);
    if (doTypos) run(TYPO_FIXES);
    if (doVerbs) run(VERB_ALIASES);

    return { text: result, changed: result !== text, corrections };
}


/* ══════════════════════════════════════════════════════════════════════════════
   FUNCIÓN: detectFileTypeMention
   Detecta si el mensaje menciona un tipo semántico de archivo.
   Retorna { keyword, extensions } o null.
   Itera de mayor longitud a menor para evitar matches parciales.
══════════════════════════════════════════════════════════════════════════════ */
function detectFileTypeMention(message) {
    if (!message) return null;
    const entries = Object.entries(FILE_TYPE_MAP)
        .sort((a, b) => b[0].length - a[0].length);
    for (const [keyword, extensions] of entries) {
        const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re  = new RegExp("\\b" + esc + "\\b", "i");
        if (re.test(message)) return { keyword, extensions };
    }
    return null;
}


/* ══════════════════════════════════════════════════════════════════════════════
   FUNCIÓN: resolveFolderAlias
   Convierte un nombre informal de carpeta en su ruta real en Windows.
══════════════════════════════════════════════════════════════════════════════ */
function resolveFolderAlias(name, userProfile) {
    if (!name) return null;
    const key    = name.toLowerCase().trim();
    const mapped = FOLDER_ALIASES[key];
    if (!mapped) return null;

    const nodePath = require("path");
    const base     = userProfile || process.env.USERPROFILE || "C:\\Users\\Tobias";

    if (/^[A-Za-z]:\\/.test(mapped) || mapped.startsWith("\\\\")) return mapped;
    return nodePath.join(base, mapped);
}


/* ══════════════════════════════════════════════════════════════════════════════
   FUNCIÓN: stripWakeWord
   Elimina el wake word del inicio de un texto transcripto.
   Usa los aliases fonéticos, de mayor a menor longitud.
══════════════════════════════════════════════════════════════════════════════ */
function stripWakeWord(text) {
    if (!text) return text;
    const escaped = WAKE_WORD_PHONETIC_ALIASES
        .slice()
        .sort((a, b) => b.length - a.length)
        .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp("^(?:" + escaped.join("|") + ")[,\\.\\s!\\?]*", "i");
    return text.replace(pattern, "").trim();
}


/* ══════════════════════════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════════════════════════ */
module.exports = {
    APP_ALIASES,
    TYPO_FIXES,
    VERB_ALIASES,
    FILE_TYPE_MAP,
    FOLDER_ALIASES,
    WAKE_WORD_PHONETIC_ALIASES,
    applyAliases,
    detectFileTypeMention,
    resolveFolderAlias,
    stripWakeWord,
};