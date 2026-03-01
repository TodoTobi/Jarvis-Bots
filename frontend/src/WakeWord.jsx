/**
 * WakeWord.jsx — Detector de palabra clave "sistema"
 *
 * Escucha constantemente con la Web Speech API (bajo consumo de recursos).
 * Cuando detecta "sistema" en el audio, activa la grabación de audio completa
 * y procesa el comando igual que el botón de micrófono manual.
 *
 * Estados:
 *  idle      → escuchando en background (casi sin recursos)
 *  listening → detectó "sistema", grabando el comando
 *  processing → transcribiendo con Whisper
 *
 * Props:
 *  onCommand(text)  — callback cuando se detecta un comando completo
 *  disabled         — deshabilita todo
 *  active           — si el modo wake word está habilitado
 */

import React, { useState, useRef, useEffect, useCallback } from "react";

const API = "http://localhost:3001";

// Palabras clave que activan el modo escucha
const WAKE_WORDS = ["sistema", "systema", "system", "sistema!", "sistema,"];

// Tiempo máximo de grabación del comando (ms)
const MAX_RECORDING_MS = 10000;

// Tiempo de silencio antes de procesar (ms) 
const SILENCE_TIMEOUT_MS = 1800;

export default function WakeWord({ onCommand, disabled = false, active = true }) {
    const [state, setState] = useState("idle"); // idle | listening | processing
    const [lastWakeWord, setLastWakeWord] = useState(null);
    const [transcript, setTranscript] = useState("");
    const [error, setError] = useState(null);
    const [pulseColor, setPulseColor] = useState("#10a37f");

    // Speech recognition (para wake word detection — muy bajo consumo)
    const recognitionRef = useRef(null);
    const isRecognitionRunning = useRef(false);

    // MediaRecorder (para grabar el comando completo con calidad)
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const silenceTimerRef = useRef(null);
    const maxTimerRef = useRef(null);
    const stateRef = useRef("idle");

    // Sync stateRef with state
    useEffect(() => { stateRef.current = state; }, [state]);

    /* ── Check browser support ── */
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    /* ── Start MediaRecorder for command ── */
    const startCommandRecording = useCallback(async () => {
        if (stateRef.current !== "idle") return;
        setState("listening");
        setPulseColor("#ef4444");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
            const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";

            const mr = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mr;
            chunksRef.current = [];

            mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };

            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                clearTimeout(silenceTimerRef.current);
                clearTimeout(maxTimerRef.current);

                setState("processing");
                setPulseColor("#f59e0b");

                try {
                    const blob = new Blob(chunksRef.current, { type: mimeType });
                    if (blob.size < 800) {
                        setState("idle");
                        setPulseColor("#10a37f");
                        return;
                    }

                    const fd = new FormData();
                    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                    fd.append("audio", blob, `cmd.${ext}`);

                    const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                    const data = await res.json();

                    if (data.success && data.text?.trim()) {
                        const cmdText = data.text.trim();
                        setTranscript(cmdText);
                        onCommand(cmdText);
                    }
                } catch (e) {
                    console.error("WakeWord STT error:", e);
                } finally {
                    setState("idle");
                    setPulseColor("#10a37f");
                    setTranscript("");
                    // Restart wake word detection after brief pause
                    setTimeout(() => restartRecognition(), 800);
                }
            };

            mr.start(100);

            // Silence detection: stop after SILENCE_TIMEOUT_MS with no new chunks
            const resetSilenceTimer = () => {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                    if (mediaRecorderRef.current?.state === "recording") {
                        mediaRecorderRef.current.stop();
                    }
                }, SILENCE_TIMEOUT_MS);
            };

            mr.addEventListener("dataavailable", resetSilenceTimer);
            resetSilenceTimer();

            // Max recording time
            maxTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === "recording") {
                    mediaRecorderRef.current.stop();
                }
            }, MAX_RECORDING_MS);

        } catch (e) {
            console.error("WakeWord: mic error:", e);
            setState("idle");
            setPulseColor("#10a37f");
        }
    }, [onCommand]);

    /* ── Setup Speech Recognition for wake word ── */
    const setupRecognition = useCallback(() => {
        if (!SpeechRecognition || !active) return;

        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "es-AR";
        rec.maxAlternatives = 3;

        rec.onresult = (event) => {
            if (stateRef.current !== "idle") return;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const alternatives = Array.from({ length: event.results[i].length }, (_, j) => event.results[i][j]);

                for (const alt of alternatives) {
                    const transcript = alt.transcript.toLowerCase().trim();

                    const detected = WAKE_WORDS.some(w => transcript.includes(w));
                    if (detected) {
                        console.log("WakeWord: DETECTED in:", transcript);
                        setLastWakeWord(new Date().toLocaleTimeString());

                        // Stop recognition temporarily
                        try { rec.stop(); } catch { }
                        isRecognitionRunning.current = false;

                        // Start command recording
                        startCommandRecording();
                        return;
                    }
                }
            }
        };

        rec.onerror = (e) => {
            if (e.error === "not-allowed") {
                setError("Micrófono no permitido");
                return;
            }
            // Ignorar errores transitorios y reiniciar
            isRecognitionRunning.current = false;
            if (active && stateRef.current === "idle") {
                setTimeout(() => restartRecognition(), 1000);
            }
        };

        rec.onend = () => {
            isRecognitionRunning.current = false;
            // Auto-restart if still in idle mode and wake word is active
            if (active && stateRef.current === "idle") {
                setTimeout(() => restartRecognition(), 300);
            }
        };

        recognitionRef.current = rec;
    }, [SpeechRecognition, active, startCommandRecording]);

    const restartRecognition = useCallback(() => {
        if (!active || stateRef.current !== "idle") return;
        if (isRecognitionRunning.current) return;

        try {
            if (!recognitionRef.current) setupRecognition();
            recognitionRef.current?.start();
            isRecognitionRunning.current = true;
        } catch (e) {
            isRecognitionRunning.current = false;
            setTimeout(() => restartRecognition(), 1500);
        }
    }, [active, setupRecognition]);

    /* ── Lifecycle ── */
    useEffect(() => {
        if (!active || disabled || !isSupported) return;

        setupRecognition();
        const timer = setTimeout(() => restartRecognition(), 500);

        return () => {
            clearTimeout(timer);
            clearTimeout(silenceTimerRef.current);
            clearTimeout(maxTimerRef.current);
            try { recognitionRef.current?.stop(); } catch { }
            isRecognitionRunning.current = false;
        };
    }, [active, disabled, isSupported, setupRecognition, restartRecognition]);

    if (!isSupported) return null;
    if (!active) return null;

    /* ── UI ── */
    const stateConfig = {
        idle: { label: "Wake word activo", icon: "🎙️", color: "#10a37f", opacity: 0.7 },
        listening: { label: "Escuchando comando...", icon: "🔴", color: "#ef4444", opacity: 1 },
        processing: { label: "Procesando...", icon: "⟳", color: "#f59e0b", opacity: 1 },
    };

    const cfg = stateConfig[state];

    return (
        <div style={{ position: "relative" }} title={`Wake word: di "Sistema" para activar`}>
            {/* Ripple animation cuando está activo */}
            {state === "idle" && (
                <div style={{
                    position: "absolute",
                    inset: -6,
                    borderRadius: "50%",
                    border: `1.5px solid rgba(16,163,127,0.3)`,
                    animation: "wakeRipple 2.5s ease-out infinite",
                    pointerEvents: "none",
                }} />
            )}

            {state === "listening" && (
                <>
                    <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "2px solid rgba(239,68,68,0.5)", animation: "ringPulse 1s ease-in-out infinite", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "1px solid rgba(239,68,68,0.2)", animation: "ringPulse 1s ease-in-out 0.3s infinite", pointerEvents: "none" }} />
                </>
            )}

            <button
                disabled={disabled}
                title={`"Sistema" para activar | Estado: ${state}`}
                style={{
                    width: 32, height: 32, borderRadius: "50%",
                    border: `1.5px solid ${cfg.color}40`,
                    background: state === "idle" ? "transparent" : `${cfg.color}20`,
                    color: cfg.color,
                    cursor: "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: state === "processing" ? 14 : 15,
                    opacity: cfg.opacity,
                    transition: "all 0.3s ease",
                    animation: state === "processing" ? "spin 1s linear infinite" : "none",
                    flexShrink: 0,
                    userSelect: "none",
                }}
            >
                {state === "processing"
                    ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                    : cfg.icon
                }
            </button>

            {/* Tooltip con estado + último trigger */}
            {(state !== "idle" || lastWakeWord) && (
                <div style={{
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(0,0,0,0.85)",
                    backdropFilter: "blur(8px)",
                    color: "#fff",
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                    zIndex: 200,
                    pointerEvents: "none",
                    border: `1px solid ${cfg.color}30`,
                }}>
                    {state === "listening" && "🔴 Grabando... (silencio para enviar)"}
                    {state === "processing" && "⟳ Procesando audio..."}
                    {state === "idle" && lastWakeWord && `✓ Último: ${lastWakeWord}`}
                </div>
            )}

            {/* Transcript en tiempo real */}
            {transcript && state === "idle" && (
                <div style={{
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(16,163,127,0.15)",
                    border: "1px solid rgba(16,163,127,0.3)",
                    color: "#19c37d",
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                    zIndex: 200,
                    pointerEvents: "none",
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}>
                    "{transcript}"
                </div>
            )}

            <style>{`
                @keyframes wakeRipple {
                    0% { opacity: 0.6; transform: scale(1); }
                    100% { opacity: 0; transform: scale(2.2); }
                }
                @keyframes ringPulse {
                    0%,100% { opacity: 0.8; transform: scale(1); }
                    50% { opacity: 0.3; transform: scale(1.15); }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}