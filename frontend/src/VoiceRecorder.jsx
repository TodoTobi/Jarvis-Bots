/**
 * VoiceRecorder.jsx — v3
 *
 * Grabación manual de audio para transcripción.
 * No escucha wake words localmente: eso lo hace WakeWord en App.jsx.
 *
 * FIX crítico de audio:
 *  - Usa MediaRecorder correctamente: acumula chunks en ondataavailable
 *  - Al parar, crea Blob con todos los chunks → FormData → POST /api/stt/transcribe
 *  - Si el backend responde con errorCode "TRANSCRIPTION_FAILED", muestra mensaje útil
 *
 * Props:
 *  onTranscript(text)  → callback cuando se recibe la transcripción
 *  onError(msg)        → callback para errores
 *  disabled            → deshabilitar el componente
 */

import { useState, useEffect, useRef, useCallback } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const WAKE_WORD = "sistema";
const STOP_WORD = "enviar";

// Fonéticas alternativas del wake word que el STT puede generar
const WAKE_WORD_VARIANTS = [
    "sistema", "cist ema", "cistema", "sis tema", "xistema",
];

// ── Reconocimiento de voz continuo para wake word ────────────────────────────
function useWakeWordDetector({ onWake, onStop, disabled }) {
    const recognitionRef = useRef(null);
    const activeRef = useRef(false);

    const start = useCallback(() => {
        if (!window.SpeechRecognition && !window.webkitSpeechRecognition) return;
        if (recognitionRef.current) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "es-AR";
        recognition.maxAlternatives = 3;

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.toLowerCase().trim();

                if (!activeRef.current) {
                    const isWake = WAKE_WORD_VARIANTS.some(v => transcript.includes(v));
                    if (isWake) {
                        activeRef.current = true;
                        onWake?.();
                    }
                } else {
                    if (transcript.includes(STOP_WORD) || transcript.includes("enviar") || transcript.includes("send")) {
                        activeRef.current = false;
                        onStop?.();
                    }
                }
            }
        };

        recognition.onerror = (e) => {
            if (e.error === "aborted" || e.error === "no-speech") return;
            console.warn("[WakeWord] Recognition error:", e.error);
        };

        recognition.onend = () => {
            if (recognitionRef.current) {
                try { recognition.start(); } catch (_) {}
            }
        };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch (_) {}
    }, [onWake, onStop]);

    const stop = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null;
        }
        activeRef.current = false;
    }, []);

    useEffect(() => {
        if (!disabled) start(); else stop();
        return () => stop();
    }, [disabled, start, stop]);

    return { isListeningForWake: !activeRef.current };
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function VoiceRecorder({ onTranscript, onError, disabled = false }) {
    const [state, setState] = useState("idle"); // idle | listening | processing | error
    const [statusText, setStatusText] = useState("Click para grabar o decí 'sistema'");
    const [audioLevel, setAudioLevel] = useState(0);

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const animFrameRef = useRef(null);
    const stateRef = useRef("idle");

    // Mantener stateRef sincronizado
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    /* ── Analizar nivel de audio ────────────────────────── */
    const startAudioAnalysis = useCallback((stream) => {
        try {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            const source = audioContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);

            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            const update = () => {
                if (stateRef.current !== "listening") return;
                analyserRef.current.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setAudioLevel(Math.min(100, avg * 2));
                animFrameRef.current = requestAnimationFrame(update);
            };
            update();
        } catch (_) {}
    }, []);

    /* ── Detener grabación ──────────────────────────────── */
    const stopRecording = useCallback(() => {
        if (stateRef.current !== "listening") return;

        cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
    }, []);

    /* ── Enviar audio al backend ────────────────────────── */
    const sendAudio = useCallback(async (audioBlob) => {
        if (!audioBlob || audioBlob.size < 500) {
            setState("idle");
            setStatusText("Click para grabar o decí 'sistema'");
            return;
        }

        setState("processing");
        setStatusText("Procesando audio...");

        const formData = new FormData();
        // Usar extensión correcta según el tipo MIME
        const ext = audioBlob.type.includes("ogg") ? "ogg"
            : audioBlob.type.includes("webm") ? "webm"
            : audioBlob.type.includes("mp4") ? "mp4"
            : "webm";
        formData.append("audio", audioBlob, `recording.${ext}`);
        formData.append("language", "es");

        try {
            const response = await fetch(`${BACKEND_URL}/api/stt/transcribe`, {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                const errMsg = data.error || `Error HTTP ${response.status}`;
                const hint = data.errorCode === "TOO_SHORT"
                    ? "El audio fue muy corto. Hablá un poco más."
                    : data.errorCode === "TRANSCRIPTION_FAILED"
                    ? "Gemma no pudo transcribir. Verificá que el modelo esté cargado en LM Studio."
                    : errMsg;
                throw new Error(hint);
            }

            const text = (data.text || "").trim();
            if (!text) {
                setState("idle");
                setStatusText("No se detectó voz. Click para grabar o decí 'sistema' de nuevo.");
                return;
            }

            setState("idle");
            setStatusText("Click para grabar o decí 'sistema'");
            onTranscript?.(text);

        } catch (err) {
            console.error("[VoiceRecorder] Error al transcribir:", err);
            setState("error");
            setStatusText(`Error: ${err.message}`);
            onError?.(err.message);
            setTimeout(() => {
                setState("idle");
                setStatusText("Click para grabar o decí 'sistema'");
            }, 4000);
        }
    }, [onTranscript, onError]);

    /* ── Empezar grabación ──────────────────────────────── */
    const startRecording = useCallback(async () => {
        if (stateRef.current !== "idle") return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                }
            });
            streamRef.current = stream;
            chunksRef.current = [];

            // Detectar el mejor formato soportado
            const mimeTypes = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/ogg;codecs=opus",
                "audio/mp4",
            ];
            const supportedMime = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "";

            const recorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : {});
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const mimeType = recorder.mimeType || supportedMime || "audio/webm";
                const audioBlob = new Blob(chunksRef.current, { type: mimeType });
                sendAudio(audioBlob);
            };

            recorder.onerror = (e) => {
                console.error("[VoiceRecorder] Recorder error:", e.error);
                setState("error");
                setStatusText("Error de grabación");
            };

            // Pedir chunks cada 250ms para no perder datos
            recorder.start(250);
            startAudioAnalysis(stream);

            setState("listening");
            setStatusText("Grabando... click para detener");

        } catch (err) {
            console.error("[VoiceRecorder] Mic error:", err);
            setState("error");
            setStatusText("Sin acceso al micrófono");
            onError?.("Sin acceso al micrófono: " + err.message);
        }
    }, [startAudioAnalysis, sendAudio, onError]);

    /* ── Hook de wake word ──────────────────────────────── */
    /* ── Hook de wake word local ────────────────────────── */
    useWakeWordDetector({
        onWake: startRecording,
        onStop: stopRecording,
        disabled,
    });

    /* ── Click manual ───────────────────────────────────── */
    const handleClick = () => {
        if (state === "idle") {
            startRecording();
        } else if (state === "listening") {
            stopRecording();
        }
    };

    /* ── Render ─────────────────────────────────────────── */
    const isListening = state === "listening";
    const isProcessing = state === "processing";
    const isError = state === "error";

    return (
        <div className="voice-recorder" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Botón principal */}
            <button
                onClick={handleClick}
                disabled={disabled || isProcessing}
                title={isListening ? "Click para detener" : "Click para grabar o decí 'sistema'"}
                style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    border: "none",
                    cursor: disabled || isProcessing ? "not-allowed" : "pointer",
                    background: isListening
                        ? `radial-gradient(circle, #ef4444 ${audioLevel}%, #dc2626 100%)`
                        : isProcessing
                        ? "#f59e0b"
                        : isError
                        ? "#6b7280"
                        : "#3b82f6",
                    transition: "background 0.1s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    boxShadow: isListening
                        ? `0 0 ${8 + audioLevel / 5}px rgba(239, 68, 68, 0.6)`
                        : "none",
                }}
            >
                {isProcessing ? "⏳" : isListening ? "⏹" : "🎤"}
            </button>

            {/* Estado */}
            <span style={{
                fontSize: "13px",
                color: isListening ? "#ef4444" : isError ? "#ef4444" : "#9ca3af",
                maxWidth: "200px",
            }}>
                {statusText}
                {isListening && (
                    <span style={{ marginLeft: "6px" }}>
                        {"●".repeat(Math.ceil(audioLevel / 33) + 1)}
                    </span>
                )}
            </span>

            {/* Indicador de nivel de audio */}
            {isListening && (
                <div style={{
                    width: "60px",
                    height: "6px",
                    background: "#1f2937",
                    borderRadius: "3px",
                    overflow: "hidden",
                }}>
                    <div style={{
                        height: "100%",
                        width: `${audioLevel}%`,
                        background: audioLevel > 70 ? "#ef4444" : audioLevel > 40 ? "#f59e0b" : "#22c55e",
                        transition: "width 0.05s",
                        borderRadius: "3px",
                    }} />
                </div>
            )}
        </div>
    );
}