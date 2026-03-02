import React, { useState, useRef, useEffect, useCallback } from "react";

const API = "http://localhost:3001";
const WAKE_WORDS = ["sistema", "systema", "system", "sistema!", "sistema,"];
const STOP_WORDS = ["enviar", "envíar", "envía", "envia", "listo", "ok enviar"];
const MAX_RECORDING_MS = 30000; // 30s máximo para acumular el comando
const SILENCE_TIMEOUT_MS = 2500; // pausa más larga porque acumula

export default function WakeWord({ onCommand, disabled = false, active = true, onStateChange }) {
    const [state, setState] = useState("idle");
    const [lastWakeWord, setLastWakeWord] = useState(null);
    const [error, setError] = useState(null);

    const recognitionRef = useRef(null);
    const isRecognitionRunning = useRef(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const silenceTimerRef = useRef(null);
    const maxTimerRef = useRef(null);
    const stateRef = useRef("idle");

    const updateState = useCallback((newState) => {
        stateRef.current = newState;
        setState(newState);
        onStateChange?.(newState);
    }, [onStateChange]);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    /* ── Grabar el comando completo hasta "enviar" ── */
    const startCommandRecording = useCallback(async () => {
        if (stateRef.current !== "idle") return;
        updateState("listening");

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

                updateState("processing");

                try {
                    const blob = new Blob(chunksRef.current, { type: mimeType });
                    if (blob.size < 800) { updateState("idle"); return; }

                    const fd = new FormData();
                    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                    fd.append("audio", blob, `cmd.${ext}`);

                    const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                    const data = await res.json();

                    if (data.success && data.text?.trim()) {
                        // Quitar la palabra "enviar" del final del texto transcripto
                        let cmdText = data.text.trim();
                        const stopPattern = /\b(enviar|envíar|envía|envia|listo|ok enviar)\b\s*$/i;
                        cmdText = cmdText.replace(stopPattern, "").trim();

                        if (cmdText) onCommand(cmdText);
                    }
                } catch (e) {
                    console.error("WakeWord STT error:", e);
                } finally {
                    updateState("idle");
                    setTimeout(() => restartRecognition(), 800);
                }
            };

            mr.start(100);

            // Silence timer — se resetea con cada chunk de audio
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

            // Max tiempo
            maxTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === "recording") {
                    mediaRecorderRef.current.stop();
                }
            }, MAX_RECORDING_MS);

        } catch (e) {
            console.error("WakeWord: mic error:", e);
            updateState("idle");
        }
    }, [onCommand, updateState]);

    /* ── Parar grabación manualmente cuando se detecta "enviar" vía SpeechRecognition interim ── */
    const stopRecordingNow = useCallback(() => {
        if (mediaRecorderRef.current?.state === "recording") {
            clearTimeout(silenceTimerRef.current);
            clearTimeout(maxTimerRef.current);
            mediaRecorderRef.current.stop();
        }
    }, []);

    /* ── Recognition para wake word Y para detectar "enviar" mientras graba ── */
    const setupRecognition = useCallback(() => {
        if (!SpeechRecognition || !active) return;

        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "es-AR";
        rec.maxAlternatives = 3;

        rec.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const alternatives = Array.from(
                    { length: event.results[i].length }, (_, j) => event.results[i][j]
                );

                for (const alt of alternatives) {
                    const transcript = alt.transcript.toLowerCase().trim();

                    // Si está grabando, detectar "enviar" para detener
                    if (stateRef.current === "listening") {
                        const hasStopWord = STOP_WORDS.some(w => transcript.includes(w));
                        if (hasStopWord) {
                            console.log("WakeWord: STOP WORD detectado:", transcript);
                            stopRecordingNow();
                            return;
                        }
                        continue; // no buscar wake word mientras graba
                    }

                    // Estado idle: buscar wake word
                    if (stateRef.current === "idle") {
                        const detected = WAKE_WORDS.some(w => transcript.includes(w));
                        if (detected) {
                            console.log("WakeWord DETECTADO:", transcript);
                            setLastWakeWord(new Date().toLocaleTimeString());
                            try { rec.stop(); } catch { }
                            isRecognitionRunning.current = false;
                            startCommandRecording();
                            return;
                        }
                    }
                }
            }
        };

        rec.onerror = (e) => {
            if (e.error === "not-allowed") { setError("Micrófono no permitido"); return; }
            isRecognitionRunning.current = false;
            if (active && stateRef.current === "idle") {
                setTimeout(() => restartRecognition(), 1000);
            }
        };

        rec.onend = () => {
            isRecognitionRunning.current = false;
            if (active && stateRef.current === "idle") {
                setTimeout(() => restartRecognition(), 300);
            }
        };

        recognitionRef.current = rec;
    }, [SpeechRecognition, active, startCommandRecording, stopRecordingNow]);

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

    if (!isSupported || !active) return null;
    return null;
}