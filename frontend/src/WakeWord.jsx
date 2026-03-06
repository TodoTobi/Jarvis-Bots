/**
 * WakeWord.jsx — v5 GLOBAL
 * ─────────────────────────────────────────────────────────
 * Wake word : "jarvis" (cualquier variación)
 * Stop word : "enviar" — detiene grabación SIN incluirlo en el texto
 * Flujo     : idle → detecta "jarvis" → graba audio real
 *             → detecta "enviar" (o silencio 3s) → STT → onCommand(texto)
 *
 * Se monta en App.jsx (nivel raíz) para funcionar en CUALQUIER vista.
 * onNavigateToChat() se llama cuando Jarvis recibe un comando fuera del chat.
 * ─────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from "react";

const API = "http://localhost:3001";

// Variaciones que acepta como wake word
const WAKE_WORDS = [
    "jarvis", "jarvi", "harvis", "jarbes", "jarvist",
    "jarvis,", "jarvis.", "jarvis!", "oye jarvis", "hey jarvis",
];

// Palabras que detienen la grabación
const STOP_WORDS = [
    "enviar", "envíar", "envía", "envia",
    "listo", "ok enviar", "mandar", "send",
];

const SILENCE_MS = 3000;   // 3s sin hablar → envía automáticamente
const MAX_MS = 30000;      // 30s máximo por seguridad

export default function WakeWord({
    onCommand,
    onStateChange,
    onNavigateToChat,   // callback para llevar al usuario al chat cuando está en otra vista
    disabled = false,
    active = true,
}) {
    const [_state, _setState] = useState("idle");

    // Refs principales
    const stateRef = useRef("idle");
    const recognitionRef = useRef(null);
    const recIsRunning = useRef(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const silenceTimerRef = useRef(null);
    const maxTimerRef = useRef(null);
    const stoppedRef = useRef(false); // evita doble-stop

    // Actualizador de estado centralizado
    const setState = useCallback((s) => {
        stateRef.current = s;
        _setState(s);
        onStateChange?.(s);
    }, [onStateChange]);

    /* ─────────────────────────────────────────
       TIMERS
    ───────────────────────────────────────── */
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

    /* ─────────────────────────────────────────
       STOP RECORDING + ENVIAR AL STT
    ───────────────────────────────────────── */
    const stopAndTranscribe = useCallback(() => {
        if (stoppedRef.current) return;
        stoppedRef.current = true;
        clearTimers();

        // Parar recognition de stop words
        try { recognitionRef.current?.stop(); } catch { }
        recIsRunning.current = false;

        const mr = mediaRecorderRef.current;
        if (mr && mr.state === "recording") {
            mr.stop(); // dispara onstop → STT
        } else {
            setState("idle");
        }
    }, [clearTimers, setState]);

    /* ─────────────────────────────────────────
       GRABAR AUDIO + DETECTAR STOP WORD EN PARALELO
    ───────────────────────────────────────── */
    const startRecording = useCallback(async () => {
        if (stateRef.current !== "idle") return;
        stoppedRef.current = false;
        setState("listening");

        // Navegar al chat si estamos en otra vista
        onNavigateToChat?.();

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.error("[WakeWord] mic error:", e);
            setState("idle");
            return;
        }

        // Detectar el mejor mimeType
        const mimeTypes = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4",
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

                const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                const data = await res.json();

                if (data.success && data.text?.trim()) {
                    // Limpiar stop words del texto transcripto
                    let text = data.text.trim();
                    // Limpiar wake word del inicio si quedó
                    text = text.replace(/^(jarvis|harvis|jarvi|hey jarvis|oye jarvis)[,.\s!]*/i, "").trim();
                    // Limpiar stop words del final
                    text = text.replace(/\b(enviar|envíar|envía|envia|listo|ok\s+enviar|mandar|send)\b[\s.,!?]*$/i, "").trim();

                    if (text && onCommand) {
                        console.log("[WakeWord] comando:", text);
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

        // ── SpeechRecognition en paralelo para detectar "enviar" ──
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
            const stopRec = new SR();
            stopRec.continuous = true;
            stopRec.interimResults = true;
            stopRec.lang = "es-AR";
            stopRec.maxAlternatives = 2;
            recognitionRef.current = stopRec;
            recIsRunning.current = true;

            stopRec.onresult = (event) => {
                if (stoppedRef.current) return;

                // Resetear silence timer con cada palabra detectada
                resetSilenceTimer(stopAndTranscribe);

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    for (let j = 0; j < event.results[i].length; j++) {
                        const t = event.results[i][j].transcript.toLowerCase().trim();
                        if (STOP_WORDS.some(sw => t.includes(sw))) {
                            console.log("[WakeWord] stop word detectado:", t);
                            stopAndTranscribe();
                            return;
                        }
                    }
                }
            };

            stopRec.onerror = () => { recIsRunning.current = false; };
            stopRec.onend = () => { recIsRunning.current = false; };

            try { stopRec.start(); } catch { }
        }

        // Timers de seguridad
        resetSilenceTimer(stopAndTranscribe);
        maxTimerRef.current = setTimeout(() => {
            console.log("[WakeWord] max time → enviar");
            stopAndTranscribe();
        }, MAX_MS);

    }, [setState, onCommand, onNavigateToChat, stopAndTranscribe, resetSilenceTimer]);

    /* ─────────────────────────────────────────
       IDLE: escuchar wake word "jarvis"
    ───────────────────────────────────────── */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const startIdleListening = useCallback(() => {
        if (!active || disabled) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        if (stateRef.current !== "idle") return;
        if (recIsRunning.current) return;

        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "es-AR";
        rec.maxAlternatives = 3;
        recognitionRef.current = rec;

        rec.onresult = (event) => {
            if (stateRef.current !== "idle") return;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                for (let j = 0; j < event.results[i].length; j++) {
                    const transcript = event.results[i][j].transcript.toLowerCase().trim();
                    const detected = WAKE_WORDS.some(w => transcript.includes(w));

                    if (detected) {
                        console.log("[WakeWord] JARVIS detectado en:", transcript);
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

    /* ─────────────────────────────────────────
       EFECTO PRINCIPAL
    ───────────────────────────────────────── */
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

    // No renderiza nada — es invisible
    return null;
}