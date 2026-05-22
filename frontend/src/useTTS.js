/**
 * useTTS.js — Hook de Text to Speech via ElevenLabs backend
 * 
 * Reemplaza speakResponse() en WakeWord.jsx y Shell.jsx
 * 
 * Uso:
 *   import { useTTS } from "./useTTS";
 *   const { speak, stop, speaking } = useTTS();
 *   speak("Hola, soy Sistema", onStart, onEnd);
 */

import { useRef, useState, useCallback } from "react";

const API = "http://localhost:3001";

export function useTTS() {
    const audioRef   = useRef(null);
    const [speaking, setSpeaking] = useState(false);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            audioRef.current = null;
        }
        setSpeaking(false);
    }, []);

    const speak = useCallback(async (text, onStart, onEnd) => {
        if (!text || text.trim().length < 2) { onEnd?.(); return; }

        stop(); // cancelar cualquier audio previo

        try {
            const res = await fetch(`${API}/api/tts/speak`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });

            if (!res.ok) {
                console.error("[TTS] error:", res.status);
                onEnd?.();
                return;
            }

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onplay  = () => { setSpeaking(true);  onStart?.(); };
            audio.onended = () => {
                setSpeaking(false);
                URL.revokeObjectURL(url);
                audioRef.current = null;
                onEnd?.();
            };
            audio.onerror = () => {
                setSpeaking(false);
                URL.revokeObjectURL(url);
                audioRef.current = null;
                onEnd?.();
            };

            await audio.play();

        } catch (err) {
            console.error("[TTS] fetch error:", err);
            setSpeaking(false);
            onEnd?.();
        }
    }, [stop]);

    return { speak, stop, speaking };
}

/* ── Versión standalone (sin hook) para WakeWord.jsx ─────── */
let currentAudio = null;

export async function speakResponse(text, onStart, onEnd) {
    if (!text || text.trim().length < 2) { onEnd?.(); return; }

    stopSpeaking();

    try {
        const res = await fetch(`${API}/api/tts/speak`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!res.ok) { onEnd?.(); return; }

        const blob  = await res.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;

        audio.onplay  = () => onStart?.();
        audio.onended = () => {
            URL.revokeObjectURL(url);
            currentAudio = null;
            onEnd?.();
        };
        audio.onerror = () => {
            URL.revokeObjectURL(url);
            currentAudio = null;
            onEnd?.();
        };

        await audio.play();

    } catch (err) {
        console.error("[TTS] error:", err);
        onEnd?.();
    }
}

export function stopSpeaking() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
        currentAudio = null;
    }
}