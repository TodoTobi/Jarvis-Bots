/**
 * WakeWord.jsx — v6 PHONETIC
 * ─────────────────────────────────────────────────────────────────────────────
 * Wake word : "jarvis" — acepta TODAS las variantes fonéticas:
 *             llarvis (rioplatense ll=y), yarvis, harvis, garvis,
 *             errores de STT, con/sin activador ("hey", "oye"), etc.
 *
 * Algoritmo de detección (doble capa):
 *   1. Lista WAKE_WORDS — substring match exacto (rápido)
 *   2. Levenshtein per-palabra — atrapa variantes no listadas (≤30% diferencia)
 *
 * Strip al transcribir: stripWakeWordLocal() limpia el wake word del texto
 *   usando los mismos aliases, de mayor a menor longitud.
 *
 * Stop words: "enviar", "listo", "mandar" → terminan la grabación
 * Silencio 3s → envía automáticamente
 * Máximo 30s por seguridad
 *
 * Se monta en App.jsx (nivel raíz) — funciona en CUALQUIER vista.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from "react";

const API = "http://localhost:3001";

/* ══════════════════════════════════════════════════════════════
   DICCIONARIO FONÉTICO DE WAKE WORD
   Los más largos van primero para que el substring match no corte parciales.
   Cubre: pronunciación rioplatense (ll=y → llarvis), yeísmo (yarvis),
   errores STT (harvis, garvis), variantes con activador (hey/oye).
══════════════════════════════════════════════════════════════ */
const WAKE_WORDS = [
    // Con activador + variantes ll/y (más específicos primero)
    "hey llarvis", "oye llarvis", "hei llarvis",
    "hey yarvis",  "oye yarvis",  "ey yarvis",
    "hey jarvis",  "oye jarvis",  "hei jarvis",
    "ei jarvis",   "ay jarvis",   "ey jarvis",
    "a ver jarvis",

    // Pronunciación ll (rioplatense: ll y y suenan igual)
    "llarvis",  "llarvi",  "llarviz",  "llarbis",

    // Pronunciación y (yeísmo)
    "yarvis",   "yarvi",   "yarviz",

    // Pronunciación j (estándar)
    "jarvis",   "jarvi",   "jarviz",   "jarves",
    "jarvist",  "jarviss", "jarvys",

    // Errores comunes de STT y pronunciación
    "harvis",   "garvis",   "marvis",   "carvis",
    "jarbes",
];

// Variantes core para comparación Levenshtein
const WAKE_CORE = ["jarvis", "llarvis", "yarvis", "harvis"];

/* ══════════════════════════════════════════════════════════════
   LEVENSHTEIN — implementación mínima autónoma (sin imports)
══════════════════════════════════════════════════════════════ */
function lev(a, b) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
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

/* ══════════════════════════════════════════════════════════════
   DETECCIÓN DE WAKE WORD
   Capa 1: substring exacto en WAKE_WORDS
   Capa 2: Levenshtein contra variantes core (≤30% diferencia)
══════════════════════════════════════════════════════════════ */
function detectWakeWord(transcript) {
    const t = transcript.toLowerCase().trim();

    // Capa 1: match directo
    if (WAKE_WORDS.some(w => t.includes(w))) return true;

    // Capa 2: Levenshtein por palabra
    const words = t.split(/[\s,\.!?]+/).filter(Boolean);
    for (const word of words) {
        for (const core of WAKE_CORE) {
            const dist = lev(word, core);
            const maxLen = Math.max(word.length, core.length);
            if (maxLen > 0 && dist / maxLen <= 0.30) return true;
        }
    }
    return false;
}

/* ══════════════════════════════════════════════════════════════
   STRIP WAKE WORD
   Elimina el wake word del inicio del texto transcripto.
   Itera de mayor a menor longitud para no cortar coincidencias parciales.
══════════════════════════════════════════════════════════════ */
function stripWakeWordLocal(text) {
    if (!text) return text;
    const sorted = WAKE_WORDS.slice().sort((a, b) => b.length - a.length);
    for (const w of sorted) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("^(?:" + esc + ")[,\\.\\s!\\?]*", "i");
        const result = text.replace(re, "").trim();
        if (result !== text) return result;
    }
    return text;
}

/* ══════════════════════════════════════════════════════════════
   STOP WORDS — terminan la grabación sin incluirse en el texto
══════════════════════════════════════════════════════════════ */
const STOP_WORDS = [
    "enviar", "envíar", "envía", "envia",
    "listo", "ok enviar", "mandar", "send",
];

const SILENCE_MS = 3000;
const MAX_MS     = 30000;

/* ══════════════════════════════════════════════════════════════
   COMPONENTE
══════════════════════════════════════════════════════════════ */
export default function WakeWord({
    onCommand,
    onStateChange,
    onNavigateToChat,
    disabled = false,
    active = true,
}) {
    const [_state, _setState] = useState("idle");

    const stateRef         = useRef("idle");
    const recognitionRef   = useRef(null);
    const recIsRunning     = useRef(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef        = useRef([]);
    const silenceTimerRef  = useRef(null);
    const maxTimerRef      = useRef(null);
    const stoppedRef       = useRef(false);

    const setState = useCallback((s) => {
        stateRef.current = s;
        _setState(s);
        onStateChange?.(s);
    }, [onStateChange]);

    /* ── Timers ──────────────────────────────────────── */
    const clearTimers = useCallback(() => {
        clearTimeout(silenceTimerRef.current);
        clearTimeout(maxTimerRef.current);
    }, []);

    const resetSilenceTimer = useCallback((stopFn) => {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
            console.log("[WakeWord] silencio → enviar");
            stopFn();
        }, SILENCE_MS);
    }, []);

    /* ── Stop + transcribir ──────────────────────────── */
    const stopAndTranscribe = useCallback(() => {
        if (stoppedRef.current) return;
        stoppedRef.current = true;
        clearTimers();
        try { recognitionRef.current?.stop(); } catch { }
        recIsRunning.current = false;
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === "recording") {
            mr.stop();
        } else {
            setState("idle");
        }
    }, [clearTimers, setState]);

    /* ── Grabar audio ────────────────────────────────── */
    const startRecording = useCallback(async () => {
        if (stateRef.current !== "idle") return;
        stoppedRef.current = false;
        setState("listening");
        onNavigateToChat?.();

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.error("[WakeWord] mic error:", e);
            setState("idle");
            return;
        }

        const mimeTypes = [
            "audio/webm;codecs=opus", "audio/webm",
            "audio/ogg;codecs=opus", "audio/mp4",
        ];
        const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";

        const mr = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mr;
        chunksRef.current = [];

        mr.ondataavailable = (e) => {
            if (e.data?.size > 0) chunksRef.current.push(e.data);
        };

        mr.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            setState("processing");

            const blob = new Blob(chunksRef.current, { type: mimeType });
            if (blob.size < 800) {
                setState("idle");
                setTimeout(startIdleListening, 800);
                return;
            }

            try {
                const fd = new FormData();
                const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                fd.append("audio", blob, `cmd.${ext}`);

                const res  = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                const data = await res.json();

                if (data.success && data.text?.trim()) {
                    let text = data.text.trim();

                    // Limpiar wake word del inicio (cubre llarvis, yarvis, etc.)
                    text = stripWakeWordLocal(text);

                    // Limpiar stop words del final
                    text = text.replace(/\b(enviar|envíar|envía|envia|listo|ok\s+enviar|mandar|send)\b[\s.,!?]*$/i, "").trim();

                    if (text && onCommand) {
                        console.log("[WakeWord] comando detectado:", text);
                        onCommand(text);
                    }
                }
            } catch (e) {
                console.error("[WakeWord] STT error:", e);
            }

            setState("idle");
            setTimeout(startIdleListening, 800);
        };

        mr.start(200);

        // SpeechRecognition en paralelo para stop words + silence timer
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
            const stopRec = new SR();
            stopRec.continuous      = true;
            stopRec.interimResults  = true;
            stopRec.lang            = "es-AR";
            stopRec.maxAlternatives = 2;
            recognitionRef.current  = stopRec;
            recIsRunning.current    = true;

            stopRec.onresult = (event) => {
                if (stoppedRef.current) return;
                resetSilenceTimer(stopAndTranscribe);
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    for (let j = 0; j < event.results[i].length; j++) {
                        const t = event.results[i][j].transcript.toLowerCase().trim();
                        if (STOP_WORDS.some(sw => t.includes(sw))) {
                            console.log("[WakeWord] stop word:", t);
                            stopAndTranscribe();
                            return;
                        }
                    }
                }
            };

            stopRec.onerror = () => { recIsRunning.current = false; };
            stopRec.onend   = () => { recIsRunning.current = false; };
            try { stopRec.start(); } catch { }
        }

        resetSilenceTimer(stopAndTranscribe);
        maxTimerRef.current = setTimeout(() => {
            console.log("[WakeWord] max time → enviar");
            stopAndTranscribe();
        }, MAX_MS);

    }, [setState, onCommand, onNavigateToChat, stopAndTranscribe, resetSilenceTimer]);

    /* ── Idle: escuchar wake word ────────────────────── */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const startIdleListening = useCallback(() => {
        if (!active || disabled) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR || stateRef.current !== "idle" || recIsRunning.current) return;

        const rec = new SR();
        rec.continuous      = true;
        rec.interimResults  = true;
        rec.lang            = "es-AR";
        rec.maxAlternatives = 3;   // más alternativas = más chances de detectar llarvis
        recognitionRef.current = rec;

        rec.onresult = (event) => {
            if (stateRef.current !== "idle") return;
            for (let i = event.resultIndex; i < event.results.length; i++) {
                for (let j = 0; j < event.results[i].length; j++) {
                    const transcript = event.results[i][j].transcript.toLowerCase().trim();

                    if (detectWakeWord(transcript)) {
                        console.log("[WakeWord] ✓ wake word detectado en:", JSON.stringify(transcript));
                        try { rec.stop(); } catch { }
                        recIsRunning.current = false;
                        startRecording();
                        return;
                    }
                }
            }
        };

        rec.onend = () => {
            recIsRunning.current = false;
            if (active && !disabled && stateRef.current === "idle") {
                setTimeout(startIdleListening, 400);
            }
        };

        rec.onerror = (e) => {
            recIsRunning.current = false;
            if (e.error === "not-allowed") {
                console.error("[WakeWord] micrófono no permitido");
                return;
            }
            if (active && !disabled && stateRef.current === "idle") {
                setTimeout(startIdleListening, 1500);
            }
        };

        try {
            rec.start();
            recIsRunning.current = true;
        } catch {
            recIsRunning.current = false;
            setTimeout(startIdleListening, 1500);
        }
    }, [active, disabled, startRecording]);

    /* ── Efecto principal ────────────────────────────── */
    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn("[WakeWord] SpeechRecognition no disponible en este navegador");
            return;
        }
        if (!active || disabled) return;

        const timer = setTimeout(startIdleListening, 600);

        return () => {
            clearTimeout(timer);
            clearTimers();
            try { recognitionRef.current?.stop(); } catch { }
            recIsRunning.current = false;
            if (mediaRecorderRef.current?.state === "recording") {
                try { mediaRecorderRef.current.stop(); } catch { }
            }
        };
    }, [active, disabled, startIdleListening, clearTimers]);

    return null; // componente invisible
}