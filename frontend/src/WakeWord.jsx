/**
 * WakeWord.jsx — v8 SISTEMA + ElevenLabs TTS
 * 
 * Fixes aplicados:
 *   BUG 5: SILENCE_MS aumentado a 4000ms. Timer se resetea con cualquier
 *          audio intermedio del SpeechRecognition, no solo con texto final.
 *   BUG 6: "enviar"/"manda eso"/"envialo" ejecuta onCommand con el buffer
 *          acumulado del transcript en lugar de ignorarlo.
 * 
 * Feature 1: speakResponse() via ElevenLabs (export nombrado).
 *   Fallback automático a Web Speech API si ElevenLabs falla.
 * 
 * Cuarto estado del orbe: "speaking" — activado desde Chat.jsx/Shell.jsx
 * cuando speakResponse está reproduciendo.
 */

import { useEffect, useRef, useState, useCallback } from "react";

const API = "http://localhost:3001";

/* ══════════════════════════════════════════════════════════════
   WAKE WORDS — "sistema" principal + legacy jarvis
══════════════════════════════════════════════════════════════ */
const WAKE_WORDS = [
    "oye sistema", "eh sistema", "hey sistema", "ok sistema",
    "oye systema", "eh systema", "hey systema",
    "el sistema",
    "sistema", "systema", "cistema", "xistema", "zistema", "sistemo",
    // legacy
    "jarvis", "jarvi", "llarvis", "yarvis", "hey jarvis", "oye jarvis",
];

const WAKE_CORE = ["sistema", "systema", "cistema", "jarvis"];

/* ══════════════════════════════════════════════════════════════
   LEVENSHTEIN
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

function detectWakeWord(transcript) {
    const t = transcript.toLowerCase().trim();
    if (WAKE_WORDS.some(w => t.includes(w))) return true;
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
   STOP WORDS — BUG 6: "enviar" solo → dispara comando acumulado
══════════════════════════════════════════════════════════════ */
const STOP_WORDS = [
    "enviar", "envíar", "envía", "envia",
    "listo", "ok enviar", "mandar", "manda eso", "envialo", "send",
];

function isSendOnly(transcript) {
    const t = transcript.toLowerCase().trim();
    return STOP_WORDS.some(sw => t === sw || t === `ok ${sw}`);
}

function hasStopWord(transcript) {
    const t = transcript.toLowerCase().trim();
    return STOP_WORDS.some(sw => t.includes(sw));
}

// BUG 5: 4s de silencio (era 3s). Suficiente para pausas naturales del habla.
const SILENCE_MS = 4000;
const MAX_MS     = 45000; // 45s máximo (era 30s)

/* ══════════════════════════════════════════════════════════════
   TTS — ElevenLabs con fallback Web Speech API
   Export nombrado para usar desde Chat.jsx y Shell.jsx
══════════════════════════════════════════════════════════════ */

function cleanTextForTTS(text) {
    if (!text) return "";
    return text
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`]*`/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[🔍📌🌐🔗❌⚠️✓✗▸◎●○⟳↗↳⊞]/gu, "")
        .replace(/\/\/.*/g, "")
        .replace(/\n+/g, ". ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 500);
}

let _currentAudio = null;

export async function speakResponse(text, onStart, onEnd) {
    // Detener audio previo si hay
    if (_currentAudio) {
        try { _currentAudio.pause(); _currentAudio = null; } catch {}
    }
    window.speechSynthesis?.cancel();

    if (!text || text.length < 2) { onEnd?.(); return; }

    onStart?.();

    // Intentar Kokoro TTS local primero
    try {
        const res = await fetch(`${API}/api/tts/speak`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (res.ok) {
            const blob  = await res.blob();
            const url   = URL.createObjectURL(blob);
            const audio = new Audio(url);
            _currentAudio = audio;

            audio.onended = () => {
                URL.revokeObjectURL(url);
                _currentAudio = null;
                onEnd?.();
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                _currentAudio = null;
                onEnd?.();
            };
            await audio.play();
            return; // éxito
        }
        console.warn(`[TTS] Kokoro ${res.status} — fallback a Web Speech`);
    } catch (err) {
        console.warn("[TTS] Kokoro no disponible (¿start_tts.bat corriendo?):", err.message);
    }

    // Fallback: Web Speech API
    try {
        const clean = cleanTextForTTS(text);
        const utter = new SpeechSynthesisUtterance(clean.substring(0, 250));
        utter.lang  = "en-US";
        utter.pitch = 0.75;
        utter.rate  = 0.92;
        const voices    = window.speechSynthesis.getVoices();
        const deepVoice = voices.find(v =>
            (v.lang.startsWith("es") || v.lang.startsWith("en")) &&
            (v.name.toLowerCase().includes("male") || v.name.toLowerCase().includes("masc"))
        ) || voices.find(v => v.lang.startsWith("es")) || voices[0];
        if (deepVoice) utter.voice = deepVoice;
        utter.onend  = () => onEnd?.();
        utter.onerror = () => onEnd?.();
        window.speechSynthesis.speak(utter);
    } catch (err) {
        console.error("[TTS] Web Speech fallback error:", err);
        onEnd?.();
    }
}

export function stopSpeaking() {
    if (_currentAudio) {
        try { _currentAudio.pause(); _currentAudio = null; } catch {}
    }
    window.speechSynthesis?.cancel();
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTE WakeWord
══════════════════════════════════════════════════════════════ */
export default function WakeWord({
    onCommand,
    onStateChange,
    onNavigateToChat,
    disabled = false,
    active   = true,
}) {
    const stateRef         = useRef("idle");
    const recognitionRef   = useRef(null);
    const recIsRunning     = useRef(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef        = useRef([]);
    const silenceTimerRef  = useRef(null);
    const maxTimerRef      = useRef(null);
    const stoppedRef       = useRef(false);
    // BUG 6: buffer del transcript acumulado durante la grabación
    const transcriptBufRef = useRef("");

    const setState = useCallback((s) => {
        stateRef.current = s;
        onStateChange?.(s);
    }, [onStateChange]);

    const clearTimers = useCallback(() => {
        clearTimeout(silenceTimerRef.current);
        clearTimeout(maxTimerRef.current);
    }, []);

    /* BUG 5 — resetSilenceTimer se llama SIEMPRE que hay audio,
       no solo cuando hay texto reconocido */
    const resetSilenceTimer = useCallback((stopFn) => {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
            console.log("[WakeWord] silencio 4s → enviar");
            stopFn();
        }, SILENCE_MS);
    }, []);

    const stopAndTranscribe = useCallback(() => {
        if (stoppedRef.current) return;
        stoppedRef.current = true;
        clearTimers();
        try { recognitionRef.current?.stop(); } catch {}
        recIsRunning.current = false;
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === "recording") mr.stop();
        else setState("idle");
    }, [clearTimers, setState]);

    const startRecording = useCallback(async () => {
        if (stateRef.current !== "idle") return;
        stoppedRef.current     = false;
        transcriptBufRef.current = ""; // limpiar buffer
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

        const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
        const mimeType  = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
        const mr        = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mr;
        chunksRef.current = [];

        mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };

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
                const fd  = new FormData();
                const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                fd.append("audio", blob, `cmd.${ext}`);
                const res  = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                const data = await res.json();

                // Backend devuelve USE_BROWSER_STT → usar el buffer acumulado
                // del SpeechRecognition que corrió en paralelo
                let text = "";
                if (data.success && data.text?.trim()) {
                    text = data.text.trim();
                } else if (transcriptBufRef.current.trim()) {
                    // BUG 6 fix: usar lo que el SpeechRecognition acumuló
                    text = transcriptBufRef.current.trim();
                    console.log("[WakeWord] usando transcript buffer:", text);
                }

                if (text) {
                    text = stripWakeWordLocal(text);
                    // Limpiar stop words del final
                    text = text.replace(
                        /\b(enviar|envíar|envía|envia|listo|ok\s+enviar|mandar|manda\s+eso|envialo|send)\b[\s.,!?]*$/i,
                        ""
                    ).trim();

                    if (text && onCommand) {
                        console.log("[WakeWord] comando:", text);
                        onCommand(text);
                    }
                }
            } catch (e) {
                console.error("[WakeWord] STT error:", e);
                // Aun así intentar con buffer acumulado
                const buf = transcriptBufRef.current.trim();
                if (buf && onCommand) {
                    const cleaned = stripWakeWordLocal(buf).replace(
                        /\b(enviar|envíar|envía|envia|listo|ok\s+enviar|mandar|manda\s+eso|envialo|send)\b[\s.,!?]*$/i, ""
                    ).trim();
                    if (cleaned) onCommand(cleaned);
                }
            }

            transcriptBufRef.current = "";
            setState("idle");
            setTimeout(startIdleListening, 800);
        };

        mr.start(200);

        /* SpeechRecognition en paralelo:
           - BUG 5: resetSilenceTimer en onresult Y en onsoundstart
           - BUG 6: acumular transcript en buffer, detectar "enviar solo" */
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
            const stopRec = new SR();
            stopRec.continuous     = true;
            stopRec.interimResults = true;
            stopRec.lang           = "es-AR";
            stopRec.maxAlternatives = 2;
            recognitionRef.current  = stopRec;
            recIsRunning.current    = true;

            // BUG 5: resetear timer cuando hay sonido, no solo texto
            stopRec.onsoundstart = () => {
                if (!stoppedRef.current) resetSilenceTimer(stopAndTranscribe);
            };

            stopRec.onresult = (event) => {
                if (stoppedRef.current) return;

                // BUG 5: resetear timer en cada resultado
                resetSilenceTimer(stopAndTranscribe);

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    for (let j = 0; j < event.results[i].length; j++) {
                        const t = event.results[i][j].transcript.toLowerCase().trim();

                        // BUG 6: acumular transcript completo
                        if (event.results[i].isFinal) {
                            transcriptBufRef.current += " " + t;
                        }

                        // BUG 6: si el transcript es SOLO "enviar" → enviar inmediato
                        if (isSendOnly(t)) {
                            console.log("[WakeWord] send word solo → enviar comando");
                            stopAndTranscribe();
                            return;
                        }

                        // Stop word al final de una oración más larga
                        if (hasStopWord(t) && t.length > 10) {
                            console.log("[WakeWord] stop word detectada:", t);
                            stopAndTranscribe();
                            return;
                        }
                    }
                }
            };

            stopRec.onerror = () => { recIsRunning.current = false; };
            stopRec.onend   = () => { recIsRunning.current = false; };
            try { stopRec.start(); } catch {}
        }

        // Iniciar timer de silencio desde el principio
        resetSilenceTimer(stopAndTranscribe);
        maxTimerRef.current = setTimeout(() => {
            console.log("[WakeWord] max time (45s) → enviar");
            stopAndTranscribe();
        }, MAX_MS);

    }, [setState, onCommand, onNavigateToChat, stopAndTranscribe, resetSilenceTimer]);

    /* ── Escucha idle ───────────────────────────────────── */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const startIdleListening = useCallback(() => {
        if (!active || disabled) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR || stateRef.current !== "idle" || recIsRunning.current) return;

        const rec = new SR();
        rec.continuous      = true;
        rec.interimResults  = true;
        rec.lang            = "es-AR";
        rec.maxAlternatives = 3;
        recognitionRef.current = rec;

        rec.onresult = (event) => {
            if (stateRef.current !== "idle") return;
            for (let i = event.resultIndex; i < event.results.length; i++) {
                for (let j = 0; j < event.results[i].length; j++) {
                    const transcript = event.results[i][j].transcript.toLowerCase().trim();
                    if (detectWakeWord(transcript)) {
                        console.log("[WakeWord] ✓ wake word:", JSON.stringify(transcript));
                        try { rec.stop(); } catch {}
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
            if (e.error === "not-allowed") { console.error("[WakeWord] mic no permitido"); return; }
            if (active && !disabled && stateRef.current === "idle") setTimeout(startIdleListening, 1500);
        };

        try { rec.start(); recIsRunning.current = true; }
        catch { recIsRunning.current = false; setTimeout(startIdleListening, 1500); }
    }, [active, disabled, startRecording]);

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { console.warn("[WakeWord] SpeechRecognition no disponible"); return; }
        if (!active || disabled) return;
        const timer = setTimeout(startIdleListening, 600);
        return () => {
            clearTimeout(timer);
            clearTimers();
            try { recognitionRef.current?.stop(); } catch {}
            recIsRunning.current = false;
            if (mediaRecorderRef.current?.state === "recording") {
                try { mediaRecorderRef.current.stop(); } catch {}
            }
        };
    }, [active, disabled, startIdleListening, clearTimers]);

    return null;
}