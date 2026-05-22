/**
 * WakeWord.jsx — v8 SISTEMA
 * Fixes: BUG 5 (escucha se corta), BUG 6 ("enviar" no envía)
 * Feature 1: síntesis de voz robótica (SpeechSynthesis)
 * Wake word: "sistema" principal + legacy "jarvis"
 */

import { useEffect, useRef, useState, useCallback } from "react";

const API = "http://localhost:3001";

const WAKE_WORDS = [
  "oye sistema", "eh sistema", "hey sistema", "ok sistema",
  "oye systema", "eh systema", "hey systema",
  "el sistema",
  "sistema", "systema", "cistema", "xistema",
  "zistema", "sistemo", "sis tema",
  "jarvis", "jarvi", "llarvis", "yarvis",
  "hey jarvis", "oye jarvis",
];

const WAKE_CORE = ["sistema", "systema", "cistema", "jarvis"];

/* ── Levenshtein ─────────────────────────────────────────────── */
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

/* BUG 6 FIX: detectar "enviar solo" antes de limpiar */
const SEND_ONLY_RE = /^(enviar|envíar|envía|envia|listo|mandar|send|ok\s+enviar|envialo|envialo)[\s.,!?]*$/i;
const STOP_WORDS   = ["enviar", "envíar", "envía", "envia", "listo", "ok enviar", "mandar", "send"];

/* BUG 5 FIX: aumentar silence y max */
const SILENCE_MS = 4500;   // era 3000 — más tiempo antes de cortar
const MAX_MS     = 45000;  // era 30000

/* ══════════════════════════════════════════════════════════════
   SÍNTESIS DE VOZ — Feature 1
   Robótica: pitch bajo, rate medio, voz grave masculina
══════════════════════════════════════════════════════════════ */
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")        // code blocks
    .replace(/`[^`]*`/g, "")              // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
    .replace(/\*([^*]+)\*/g, "$1")       // italic
    .replace(/#{1,6}\s/g, "")            // headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/https?:\/\/\S+/g, "")      // URLs
    .replace(/[🔍📌🌐🔗❌⚠️]/gu, "")    // emojis
    .replace(/\n{2,}/g, ". ")            // párrafos
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

let voiceCache = null;

function getRoboticVoice() {
  if (voiceCache) return voiceCache;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Preferir voces en inglés masculinas (suenan más robóticas)
  const preferred = voices.find(v =>
    v.lang.startsWith("en") && /male|david|mark|google uk english male/i.test(v.name)
  ) || voices.find(v => v.lang.startsWith("en")) || voices[0];

  voiceCache = preferred;
  return preferred;
}

export function speakResponse(text, onStart, onEnd) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const clean = stripMarkdown(text);
  if (!clean || clean.length < 2) { onEnd?.(); return; }

  // Truncar si es muy largo para no hablar 2 minutos
  const truncated = clean.length > 400 ? clean.substring(0, 400) + "." : clean;

  const utter = new SpeechSynthesisUtterance(truncated);
  utter.lang  = "en-US";   // inglés suena más robótico
  utter.pitch = 0.75;      // grave
  utter.rate  = 0.92;      // ligeramente lento
  utter.volume = 1;

  // Intentar asignar voz robótica
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    const v = getRoboticVoice();
    if (v) utter.voice = v;
  } else {
    // Las voces pueden no estar listas: esperar
    window.speechSynthesis.onvoiceschanged = () => {
      const v = getRoboticVoice();
      if (v) utter.voice = v;
    };
  }

  utter.onstart = () => onStart?.();
  utter.onend   = () => onEnd?.();
  utter.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTE
══════════════════════════════════════════════════════════════ */
export default function WakeWord({
  onCommand,
  onStateChange,
  onNavigateToChat,
  disabled = false,
  active   = true,
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
  const sendFlagRef      = useRef(false); // BUG 6: flag para "enviar solo"

  const setState = useCallback((s) => {
    stateRef.current = s;
    _setState(s);
    onStateChange?.(s);
  }, [onStateChange]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startIdleListening = useCallback(() => {
    if (!active || disabled) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || stateRef.current !== "idle" || recIsRunning.current) return;

    const rec = new SR();
    rec.continuous = true; rec.interimResults = true;
    rec.lang = "es-AR"; rec.maxAlternatives = 3;
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
      if (active && !disabled && stateRef.current === "idle") setTimeout(startIdleListening, 400);
    };
    rec.onerror = (e) => {
      recIsRunning.current = false;
      if (e.error === "not-allowed") { console.error("[WakeWord] mic no permitido"); return; }
      if (active && !disabled && stateRef.current === "idle") setTimeout(startIdleListening, 1500);
    };

    try { rec.start(); recIsRunning.current = true; }
    catch { recIsRunning.current = false; setTimeout(startIdleListening, 1500); }
  }, [active, disabled]); // startRecording se agrega abajo

  const startRecording = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    stoppedRef.current = false;
    sendFlagRef.current = false;
    setState("listening");

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
      if (blob.size < 800) { setState("idle"); setTimeout(startIdleListening, 800); return; }

      try {
        const fd  = new FormData();
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
        fd.append("audio", blob, `cmd.${ext}`);
        const res  = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
        const data = await res.json();

        if (data.success && data.text?.trim()) {
          let text = data.text.trim();

          /* BUG 6 FIX: "enviar" solo → flag de envío, no comando */
          if (SEND_ONLY_RE.test(text) || sendFlagRef.current) {
            console.log("[WakeWord] 'enviar' detectado → onCommand con buffer vacío");
            onCommand?.("__SEND__");
            setState("idle");
            setTimeout(startIdleListening, 800);
            return;
          }

          text = stripWakeWordLocal(text);
          // limpiar stop words al final pero solo si no es el único contenido
          const cleaned = text.replace(/\b(enviar|envíar|envía|envia|listo|ok\s+enviar|mandar|send)\b[\s.,!?]*$/i, "").trim();
          const final = cleaned || text;

          if (final && onCommand) {
            console.log("[WakeWord] comando:", final);
            onCommand(final);
          }
        }
      } catch (e) { console.error("[WakeWord] STT error:", e); }

      setState("idle");
      setTimeout(startIdleListening, 800);
    };

    mr.start(200);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const stopRec = new SR();
      stopRec.continuous = true; stopRec.interimResults = true;
      stopRec.lang = "es-AR"; stopRec.maxAlternatives = 2;
      recognitionRef.current = stopRec; recIsRunning.current = true;

      stopRec.onresult = (event) => {
        if (stoppedRef.current) return;
        resetSilenceTimer(stopAndTranscribe); // BUG 5: resetear con cualquier resultado
        for (let i = event.resultIndex; i < event.results.length; i++) {
          for (let j = 0; j < event.results[i].length; j++) {
            const t = event.results[i][j].transcript.toLowerCase().trim();
            /* BUG 6: detectar "enviar solo" en tiempo real */
            if (SEND_ONLY_RE.test(t)) {
              sendFlagRef.current = true;
              stopAndTranscribe();
              return;
            }
            if (STOP_WORDS.some(sw => t.endsWith(sw))) {
              stopAndTranscribe();
              return;
            }
          }
        }
      };

      /* BUG 5 FIX: si el STT se corta solo, reiniciarlo mientras siga en listening */
      stopRec.onend = () => {
        recIsRunning.current = false;
        if (!stoppedRef.current && stateRef.current === "listening") {
          // Reiniciar STT de detección de stop words
          try { stopRec.start(); recIsRunning.current = true; } catch {}
        }
      };
      stopRec.onerror = () => { recIsRunning.current = false; };
      try { stopRec.start(); } catch {}
    }

    resetSilenceTimer(stopAndTranscribe);
    maxTimerRef.current = setTimeout(() => { stopAndTranscribe(); }, MAX_MS);

  }, [setState, onCommand, stopAndTranscribe, resetSilenceTimer, startIdleListening]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn("[WakeWord] SpeechRecognition no disponible"); return; }
    if (!active || disabled) return;
    const timer = setTimeout(startIdleListening, 600);
    return () => {
      clearTimeout(timer); clearTimers();
      try { recognitionRef.current?.stop(); } catch {}
      recIsRunning.current = false;
      if (mediaRecorderRef.current?.state === "recording") { try { mediaRecorderRef.current.stop(); } catch {} }
    };
  }, [active, disabled, startIdleListening, clearTimers]);

  return null;
}