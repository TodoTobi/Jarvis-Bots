/**
 * VoiceRecorder.jsx — Grabador de voz con wake word "sistema"
 *
 * Funcionalidades:
 *  - Escucha continua del wake word "sistema" (Web Speech API)
 *  - Grabación de audio con MediaRecorder API
 *  - Envío del audio al backend (/api/stt/transcribe)
 *  - Indicador visual del estado (idle/listening/recording/processing)
 *  - Stop word: "enviar" detiene la grabación y envía
 *
 * Props:
 *  onTranscript: fn(text) → llamada cuando se transcribe el audio
 *  onError: fn(error) → llamada cuando hay un error
 *  disabled: boolean
 */

import { useState, useEffect, useRef, useCallback } from "react";

const WAKE_WORD = "sistema";
const STOP_WORDS = ["enviar", "envía", "mandar", "listo", "ya"];
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Colores de estado
const STATE_COLORS = {
    idle: "#1e3a5f",
    listening: "#10b981",
    recording: "#ef4444",
    processing: "#f59e0b",
    error: "#dc2626",
};

const STATE_LABELS = {
    idle: "Decí 'sistema' para activar",
    listening: "Escuchando...",
    recording: "🔴 Grabando — decí 'enviar' para terminar",
    processing: "⏳ Procesando...",
    error: "Error de micrófono",
};

export default function VoiceRecorder({ onTranscript, onError, disabled }) {
    const [state, setState] = useState("idle"); // idle | listening | recording | processing | error
    const [volume, setVolume] = useState(0);
    const [lastWords, setLastWords] = useState("");
    const [manualMode, setManualMode] = useState(false); // modo manual sin wake word

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const recognitionRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);
    const stateRef = useRef("idle"); // ref para acceder en callbacks

    // Sincronizar stateRef con state
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    /* ══════════════════════════════════════════════════
       VOLUME METER
    ══════════════════════════════════════════════════ */
    const startVolumeMeter = useCallback((stream) => {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
            if (stateRef.current !== "recording") return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setVolume(Math.min(100, avg * 1.5));
            animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
    }, []);

    /* ══════════════════════════════════════════════════
       STOP RECORDING & SEND
    ══════════════════════════════════════════════════ */
    const stopAndSend = useCallback(async () => {
        if (stateRef.current !== "recording") return;

        setState("processing");
        setVolume(0);

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

        // Detener MediaRecorder
        await new Promise((resolve) => {
            if (!mediaRecorderRef.current) { resolve(); return; }
            mediaRecorderRef.current.addEventListener("stop", resolve, { once: true });
            mediaRecorderRef.current.stop();
        });

        // Detener stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];

        if (chunks.length === 0) {
            setState("idle");
            return;
        }

        // Crear Blob del audio
        const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
        const audioBlob = new Blob(chunks, { type: mimeType });

        // Verificar tamaño mínimo
        if (audioBlob.size < 1000) {
            setState("idle");
            onError?.("Audio demasiado corto, intentá de nuevo");
            return;
        }

        // Enviar al backend
        try {
            const formData = new FormData();
            const ext = mimeType.includes("ogg") ? ".ogg"
                : mimeType.includes("mp4") ? ".mp4"
                : ".webm";
            formData.append("audio", audioBlob, `recording${ext}`);

            const response = await fetch(`${API_URL}/api/stt/transcribe`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.text) {
                onTranscript?.(data.text);
            } else {
                throw new Error(data.error || "Sin texto transcrito");
            }

            setState("idle");

        } catch (err) {
            console.error("STT error:", err);
            onError?.(err.message);
            setState("error");
            setTimeout(() => setState("idle"), 3000);
        }
    }, [onTranscript, onError]);

    /* ══════════════════════════════════════════════════
       START RECORDING
    ══════════════════════════════════════════════════ */
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100,
                }
            });
            streamRef.current = stream;

            // Seleccionar el mejor codec disponible
            const mimeTypes = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/ogg;codecs=opus",
                "audio/mp4",
            ];
            const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || "";

            const recorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : {});
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.addEventListener("dataavailable", (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            });

            recorder.start(100); // recolectar chunks cada 100ms
            setState("recording");
            startVolumeMeter(stream);

        } catch (err) {
            console.error("Mic error:", err);
            onError?.("No se pudo acceder al micrófono: " + err.message);
            setState("error");
            setTimeout(() => setState("idle"), 3000);
        }
    }, [startVolumeMeter, onError]);

    /* ══════════════════════════════════════════════════
       WEB SPEECH API — Wake word detection
    ══════════════════════════════════════════════════ */
    useEffect(() => {
        if (disabled) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Web Speech API no disponible — usando solo modo manual");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "es-AR";
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
            let interim = "";
            let final = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.toLowerCase().trim();
                if (event.results[i].isFinal) final += transcript + " ";
                else interim += transcript;
            }

            const combined = (final + interim).toLowerCase().trim();
            setLastWords(combined.slice(-50));

            // WAKE WORD: activar grabación
            if (stateRef.current === "idle" || stateRef.current === "listening") {
                const wakeWords = [WAKE_WORD, "sistema", "sis tema", "el sistema"];
                if (wakeWords.some(w => combined.includes(w))) {
                    setState("listening");
                    setTimeout(() => {
                        if (stateRef.current === "listening" || stateRef.current === "idle") {
                            startRecording();
                        }
                    }, 300);
                }
            }

            // STOP WORD: detener grabación
            if (stateRef.current === "recording") {
                if (STOP_WORDS.some(w => combined.includes(w))) {
                    stopAndSend();
                }
            }
        };

        recognition.onerror = (event) => {
            if (event.error === "not-allowed") {
                onError?.("Permiso de micrófono denegado");
                return;
            }
            // Reiniciar si hay error de red o similar
            if (event.error !== "no-speech" && stateRef.current !== "recording") {
                setTimeout(() => {
                    try { recognition.start(); } catch { }
                }, 1000);
            }
        };

        recognition.onend = () => {
            // Reiniciar automáticamente para escucha continua
            if (stateRef.current !== "recording" && stateRef.current !== "processing") {
                setTimeout(() => {
                    try { recognition.start(); } catch { }
                }, 500);
            }
        };

        try {
            recognition.start();
            setState("idle");
        } catch (err) {
            console.warn("Speech recognition start error:", err);
        }

        return () => {
            try { recognition.stop(); recognition.abort(); } catch { }
        };
    }, [disabled, startRecording, stopAndSend, onError]);

    /* ══════════════════════════════════════════════════
       MANUAL MODE (botón)
    ══════════════════════════════════════════════════ */
    const handleButtonClick = useCallback(() => {
        if (state === "idle" || state === "error") {
            startRecording();
        } else if (state === "recording") {
            stopAndSend();
        }
    }, [state, startRecording, stopAndSend]);

    /* ══════════════════════════════════════════════════
       RENDER
    ══════════════════════════════════════════════════ */
    const isActive = state !== "idle" && state !== "error";
    const color = STATE_COLORS[state] || STATE_COLORS.idle;

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "8px",
        }}>
            {/* Botón principal */}
            <button
                onClick={handleButtonClick}
                disabled={disabled || state === "processing"}
                title={state === "recording" ? "Click para enviar" : "Click para grabar"}
                style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    border: `2px solid ${color}`,
                    background: state === "recording" ? `${color}22` : "transparent",
                    cursor: disabled ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                    position: "relative",
                    boxShadow: isActive ? `0 0 12px ${color}66` : "none",
                }}
            >
                {/* Ícono */}
                <span style={{ fontSize: "1.2rem" }}>
                    {state === "processing" ? "⏳"
                        : state === "recording" ? "⏹️"
                        : state === "error" ? "❌"
                        : "🎙️"}
                </span>

                {/* Anillo de volumen */}
                {state === "recording" && volume > 5 && (
                    <div style={{
                        position: "absolute",
                        inset: `-${volume / 8}px`,
                        borderRadius: "50%",
                        border: `1px solid ${color}44`,
                        animation: "pulse 0.5s ease-in-out",
                        pointerEvents: "none",
                    }} />
                )}
            </button>

            {/* Indicador de estado */}
            <div style={{
                fontSize: "0.65rem",
                color: color,
                textAlign: "center",
                maxWidth: "120px",
                lineHeight: 1.3,
            }}>
                {STATE_LABELS[state]}
            </div>

            {/* Palabras detectadas (debug) */}
            {lastWords && (state === "idle" || state === "listening") && (
                <div style={{
                    fontSize: "0.6rem",
                    color: "#64748b",
                    maxWidth: "200px",
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>
                    {lastWords}
                </div>
            )}

            {/* CSS animations */}
            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0; transform: scale(1.3); }
                }
            `}</style>
        </div>
    );
}