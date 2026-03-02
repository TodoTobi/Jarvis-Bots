/**
 * WakeWord.jsx — Detector de palabra clave "sistema"
 *
 * FIXES:
 * - Agrega prop onStateChange(state) para notificar al Chat del estado
 * - El estado se propaga al Chat para animar el input
 * - onCommand envía directamente a sendMessage (ya va a /api/chat)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";

const API = "http://localhost:3001";

const WAKE_WORDS = ["sistema", "systema", "system", "sistema!", "sistema,"];

const MAX_RECORDING_MS = 10000;
const SILENCE_TIMEOUT_MS = 1800;

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

    // Sync stateRef + notificar al padre
    const updateState = useCallback((newState) => {
        stateRef.current = newState;
        setState(newState);
        onStateChange?.(newState);
    }, [onStateChange]);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    /* ── Start MediaRecorder for command ── */
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
                    if (blob.size < 800) {
                        updateState("idle");
                        return;
                    }

                    const fd = new FormData();
                    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                    fd.append("audio", blob, `cmd.${ext}`);

                    const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                    const data = await res.json();

                    if (data.success && data.text?.trim()) {
                        const cmdText = data.text.trim();
                        // CRÍTICO: enviar al chat como si fuera mensaje normal → va a /api/chat
                        onCommand(cmdText);
                    }
                } catch (e) {
                    console.error("WakeWord STT error:", e);
                } finally {
                    updateState("idle");
                    setTimeout(() => restartRecognition(), 800);
                }
            };

            mr.start(100);

            // Silence detection
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
            updateState("idle");
        }
    }, [onCommand, updateState]);

    /* ── Setup Speech Recognition ── */
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
                        console.log("WakeWord DETECTADO:", transcript);
                        setLastWakeWord(new Date().toLocaleTimeString());

                        try { rec.stop(); } catch { }
                        isRecognitionRunning.current = false;

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

    // Componente invisible — la UI se maneja en Chat.jsx
    if (!isSupported || !active) return null;

    return null;
}