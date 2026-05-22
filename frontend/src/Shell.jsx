/**
 * Shell.jsx — v3 SISTEMA
 * BUG 8 fix: glow-border movido FUERA de shell-root (fixed anidado no cubre pantalla)
 * Feature 1: estado "speaking" en orbe + síntesis de voz integrada
 * Feature 2: conversación voz a voz en Shell con subtítulos flotantes
 *
 * Props:
 *   wakeWordState     — "idle"|"listening"|"processing"|"speaking"
 *   wakeWordEnabled   — boolean
 *   onToggleWakeWord  — fn(bool)
 *   setView           — fn(string)
 *   systemStatus      — { model, backend }
 *   onShellReady      — fn(handler) registra el handler de voz del Shell en App
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import Orb from "./components/Orb";
import { speakResponse, stopSpeaking } from "./useTTS";

const API = "http://localhost:3001";

const CAMERA_MODES = {
  overlay: "overlay",
  full:    "full",
  split:   "split",
};

/* ══════════════════════════════════════════════════════════════
   CONVERSACIÓN EN SHELL — Feature 2
   Mantiene historial corto, muestra subtítulos flotantes
══════════════════════════════════════════════════════════════ */
const MAX_SHELL_HISTORY = 10; // mensajes para contexto al backend

export default function Shell({
  wakeWordState   = "idle",
  wakeWordEnabled = true,
  onToggleWakeWord,
  setView,
  systemStatus    = {},
  onShellReady,   // registra en App.jsx el handler local del Shell
}) {
  const [activeTab,      setActiveTab]      = useState("orb");
  const [cameraMode,     setCameraMode]     = useState(CAMERA_MODES.overlay);
  const [cameraOn,       setCameraOn]       = useState(false);
  const [currentTime,    setCurrentTime]    = useState("");
  const [glowVisible,    setGlowVisible]    = useState(false);
  const [glowFading,     setGlowFading]     = useState(false);

  /* Feature 2: conversación voz en Shell */
  const [shellHistory,   setShellHistory]   = useState([]); // [{role, text, ts}]
  const [orbState,       setOrbState]       = useState("idle"); // estado local que incluye "speaking"
  const [isProcessing,   setIsProcessing]   = useState(false);

  const glowTimerRef  = useRef(null);
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const subtitleTimer = useRef(null);

  /* ── Sincronizar orbState con wakeWordState + speaking ───── */
  useEffect(() => {
    // "speaking" es un estado local del Shell; wakeWordState viene de App
    if (orbState !== "speaking") {
      setOrbState(wakeWordState);
    }
  }, [wakeWordState, orbState]);

  /* ── Reloj ───────────────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  /* ── BUG 8 FIX: glow state ─────────────────────────────── */
  /* El overlay de glow está FUERA del .shell-root para evitar
     el problema de fixed-dentro-de-fixed */
  useEffect(() => {
    clearTimeout(glowTimerRef.current);
    const active = wakeWordState !== "idle" || orbState === "speaking";
    if (active) {
      setGlowFading(false);
      setGlowVisible(true);
    } else {
      setGlowFading(true);
      glowTimerRef.current = setTimeout(() => {
        setGlowVisible(false);
        setGlowFading(false);
      }, 600);
    }
    return () => clearTimeout(glowTimerRef.current);
  }, [wakeWordState, orbState]);

  /* ── Feature 2: manejar comando de voz en el Shell ───────── */
  const handleShellVoiceCommand = useCallback(async (text) => {
    if (!text || text === "__SEND__") return;
    if (isProcessing) return;

    setIsProcessing(true);

    // Agregar mensaje del usuario a subtítulos
    setShellHistory(prev => {
      const updated = [...prev, { role: "user", text, ts: Date.now() }];
      return updated.slice(-MAX_SHELL_HISTORY);
    });

    try {
      // Construir mensajes con contexto del historial
      const contextMessages = shellHistory
        .slice(-6)
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          messages: contextMessages,
          shellMode: true, // flag para que el backend sepa que es modo shell
        }),
      });

      const data = await res.json();
      const responseText = data.response || data.message || data.text || "No entendí.";

      // Agregar respuesta al historial
      setShellHistory(prev => {
        const updated = [...prev, { role: "assistant", text: responseText, ts: Date.now() }];
        return updated.slice(-MAX_SHELL_HISTORY);
      });

      // Feature 1: hablar la respuesta
      setOrbState("speaking");
      speakResponse(
        responseText,
        () => { /* onStart */ },
        () => {
          // onEnd: volver a idle
          setOrbState("idle");
          setIsProcessing(false);
        }
      );

      // Auto-limpiar subtítulos después de 8 segundos de silencio
      clearTimeout(subtitleTimer.current);
      subtitleTimer.current = setTimeout(() => {
        setShellHistory(prev => prev.length > 4 ? prev.slice(-2) : prev);
      }, 8000);

    } catch (err) {
      console.error("[Shell] voice command error:", err);
      setOrbState("idle");
      setIsProcessing(false);
    }
  }, [isProcessing, shellHistory]);

  /* ── Exponer el handler al componente padre via prop ─────── */
  useEffect(() => {
    onShellReady?.(handleShellVoiceCommand);
  }, [onShellReady, handleShellVoiceCommand]);

  /* ── Cámara ──────────────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (e) {
      console.error("[Shell] cámara error:", e);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const handleCameraTab = useCallback(() => {
    if (activeTab === "camera") { stopCamera(); setActiveTab("orb"); }
    else { setActiveTab("camera"); startCamera(); }
  }, [activeTab, startCamera, stopCamera]);

  useEffect(() => () => { stopCamera(); stopSpeaking(); }, [stopCamera]);

  const orbIsSmall = cameraOn && (cameraMode === CAMERA_MODES.full || cameraMode === CAMERA_MODES.overlay);

  const tabs = [
    { id: "orb",     icon: OrbIcon,     label: "Sistema" },
    { id: "chat",    icon: ChatIcon,    label: "Chat"    },
    { id: "camera",  icon: CameraIcon,  label: "Cámara"  },
    { id: "control", icon: ControlIcon, label: "Control" },
  ];

  /* ── Últimos 2-3 intercambios para subtítulos ────────────── */
  const recentHistory = shellHistory.slice(-3);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;700&family=JetBrains+Mono:wght@300;400&display=swap');

        .shell-root * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ══════════════════════════════════════════
           BUG 8 FIX: glow-border en el DOM RAÍZ,
           NO dentro de .shell-root (fixed anidado)
           Este div se renderiza como hermano de .shell-root
        ══════════════════════════════════════════ */
        .shell-glow-border {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 99999;
          opacity: 0;
          transition: opacity 600ms ease;
        }
        .shell-glow-border.glow-active {
          opacity: 1;
          animation: glow-breathe-slow 2s ease-in-out infinite;
        }
        .shell-glow-border.glow-active.glow-processing {
          animation: glow-breathe-fast 0.8s ease-in-out infinite;
        }
        .shell-glow-border.glow-active.glow-speaking {
          animation: glow-breathe-speak 1.4s ease-in-out infinite;
        }
        .shell-glow-border.glow-fading {
          opacity: 0 !important;
          animation: none !important;
        }

        @keyframes glow-breathe-slow {
          0%, 100% { box-shadow: inset 0 0 30px rgba(0,212,255,0.15), inset 0 0 60px rgba(0,212,255,0.06); }
          50%       { box-shadow: inset 0 0 60px rgba(0,212,255,0.45), inset 0 0 120px rgba(0,212,255,0.18), inset 0 0 6px rgba(0,212,255,0.8); }
        }
        @keyframes glow-breathe-fast {
          0%, 100% { box-shadow: inset 0 0 30px rgba(0,212,255,0.2), inset 0 0 80px rgba(0,212,255,0.08); }
          50%       { box-shadow: inset 0 0 80px rgba(0,212,255,0.6), inset 0 0 160px rgba(0,212,255,0.25), inset 0 0 8px rgba(0,212,255,0.9); }
        }
        @keyframes glow-breathe-speak {
          0%, 100% { box-shadow: inset 0 0 40px rgba(0,255,180,0.15), inset 0 0 80px rgba(0,255,180,0.06); }
          50%       { box-shadow: inset 0 0 70px rgba(0,255,180,0.4), inset 0 0 140px rgba(0,255,180,0.15), inset 0 0 6px rgba(0,255,180,0.7); }
        }

        .shell-root {
          position: fixed;
          inset: 0;
          background: #04040a;
          font-family: 'Rajdhani', 'Orbitron', monospace;
          color: #e0e8f0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        .shell-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none; z-index: 0;
        }
        .shell-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 70% 70% at 50% 50%, transparent 0%, rgba(4,4,10,0.7) 100%);
          pointer-events: none; z-index: 1;
        }

        .shell-status {
          position: absolute; top: 0; left: 0; right: 0;
          height: 38px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 24px; z-index: 10;
          border-bottom: 1px solid rgba(0,212,255,0.06);
          background: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent);
        }
        .shell-status-left { display: flex; align-items: center; gap: 16px; }
        .shell-brand {
          font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700;
          letter-spacing: 0.3em; color: rgba(0,212,255,0.9); text-transform: uppercase;
        }
        .shell-status-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #00d4ff; animation: status-pulse 3s ease-in-out infinite;
          box-shadow: 0 0 6px #00d4ff;
        }
        @keyframes status-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .shell-status-text {
          font-family: 'JetBrains Mono', monospace; font-size: 9px;
          color: rgba(0,212,255,0.45); letter-spacing: 0.08em;
        }
        .shell-clock {
          font-family: 'Orbitron', monospace; font-size: 13px; font-weight: 400;
          color: rgba(0,212,255,0.7); letter-spacing: 0.15em;
        }

        .shell-center {
          position: relative; z-index: 5;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          flex: 1; width: 100%; gap: 32px;
        }

        /* ══════════════════════════════════════════
           SUBTÍTULOS — Feature 2
        ══════════════════════════════════════════ */
        .shell-subtitles {
          position: absolute;
          bottom: 70px; left: 50%; transform: translateX(-50%);
          width: min(680px, 90vw);
          display: flex; flex-direction: column; gap: 6px;
          z-index: 20; pointer-events: none;
          padding: 0 16px;
        }
        .shell-subtitle-line {
          display: flex; gap: 10px; align-items: flex-start;
          animation: subtitle-in 0.3s ease;
        }
        @keyframes subtitle-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .shell-subtitle-role {
          font-family: 'Orbitron', monospace; font-size: 8px;
          font-weight: 700; letter-spacing: 0.2em;
          padding-top: 2px; min-width: 60px;
          text-transform: uppercase;
        }
        .shell-subtitle-role.user { color: rgba(255,255,255,0.35); }
        .shell-subtitle-role.assistant { color: rgba(0,212,255,0.6); }
        .shell-subtitle-text {
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
          line-height: 1.5; color: rgba(255,255,255,0.75);
          flex: 1;
        }
        .shell-subtitle-text.assistant { color: rgba(0,212,255,0.9); }

        /* Indicador de processing en Shell */
        .shell-processing-line {
          display: flex; gap: 6px; align-items: center;
          padding-left: 70px;
        }
        .shell-processing-dot {
          width: 4px; height: 4px; border-radius: 50%;
          background: #00d4ff;
          animation: proc-dot 1.2s ease-in-out infinite;
        }
        .shell-processing-dot:nth-child(2) { animation-delay: 0.2s; }
        .shell-processing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes proc-dot {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }

        .shell-hint {
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          color: rgba(0,212,255,0.3); letter-spacing: 0.2em;
          text-transform: uppercase;
          animation: hint-fade 6s ease-in-out infinite;
        }
        @keyframes hint-fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }

        /* ══════════════════════════════════════════
           CÁMARA
        ══════════════════════════════════════════ */
        .camera-feed-full {
          position: absolute; inset: 0; z-index: 3;
          background: #000; display: flex;
          align-items: center; justify-content: center;
        }
        .camera-feed-full video { width: 100%; height: 100%; object-fit: cover; opacity: 0.85; }
        .camera-feed-overlay {
          position: absolute; bottom: 80px; right: 24px;
          width: 260px; height: 146px; z-index: 20;
          border: 1px solid rgba(0,212,255,0.3); border-radius: 4px;
          overflow: hidden; background: #000;
          box-shadow: 0 0 24px rgba(0,212,255,0.15);
          transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .camera-feed-overlay video { width: 100%; height: 100%; object-fit: cover; opacity: 0.9; }
        .camera-split-layout {
          position: absolute; inset: 38px 0 60px 0;
          display: flex; z-index: 4;
        }
        .camera-split-left {
          flex: 1; display: flex; align-items: center;
          justify-content: center; flex-direction: column;
          gap: 24px; padding: 24px;
        }
        .camera-split-right {
          width: 45%; border-left: 1px solid rgba(0,212,255,0.12);
          position: relative; background: #000;
        }
        .camera-split-right video { width: 100%; height: 100%; object-fit: cover; opacity: 0.85; }
        .camera-mode-controls {
          position: absolute; top: 8px; right: 8px;
          display: flex; gap: 6px; z-index: 30;
        }
        .camera-mode-btn {
          width: 24px; height: 24px; border-radius: 3px;
          border: 1px solid rgba(0,212,255,0.25);
          background: rgba(0,0,0,0.7); color: rgba(0,212,255,0.5);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s; font-size: 10px;
        }
        .camera-mode-btn:hover, .camera-mode-btn.active {
          border-color: #00d4ff; color: #00d4ff; background: rgba(0,212,255,0.1);
        }
        .camera-overlay-text {
          position: absolute; bottom: 8px; left: 8px;
          font-family: 'JetBrains Mono', monospace; font-size: 8px;
          color: rgba(0,212,255,0.6); letter-spacing: 0.1em; pointer-events: none;
        }
        .orb-badge {
          position: absolute; bottom: 70px; right: 295px; z-index: 25;
          transition: all 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        .orb-badge.orb-badge-full { bottom: 70px; right: 16px; }

        /* ══════════════════════════════════════════
           NAV HUD
        ══════════════════════════════════════════ */
        .shell-nav {
          position: absolute; bottom: 0; left: 0; right: 0;
          height: 56px; display: flex; align-items: center;
          justify-content: center; gap: 4px; z-index: 10;
          background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
        }
        .shell-nav-btn {
          position: relative; width: 44px; height: 44px;
          border-radius: 8px; border: 1px solid transparent;
          background: transparent; color: rgba(255,255,255,0.25);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s ease; outline: none;
        }
        .shell-nav-btn:hover {
          color: rgba(0,212,255,0.7); border-color: rgba(0,212,255,0.15);
          background: rgba(0,212,255,0.05);
        }
        .shell-nav-btn.active {
          color: #00d4ff; border-color: rgba(0,212,255,0.35);
          background: rgba(0,212,255,0.08);
          box-shadow: 0 0 16px rgba(0,212,255,0.15);
        }
        .shell-nav-btn.active.voice-active { animation: nav-voice-pulse 2s ease-in-out infinite; }
        .shell-nav-btn.active.voice-processing { animation: nav-voice-pulse 0.8s ease-in-out infinite; }
        .shell-nav-btn.active.voice-speaking { animation: nav-speak-pulse 1.4s ease-in-out infinite; }
        @keyframes nav-voice-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(0,212,255,0.15); }
          50%       { box-shadow: 0 0 24px rgba(0,212,255,0.5); }
        }
        @keyframes nav-speak-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(0,255,180,0.15); }
          50%       { box-shadow: 0 0 24px rgba(0,255,180,0.5); }
        }
        .shell-nav-btn::after {
          content: attr(data-label);
          position: absolute; bottom: calc(100% + 8px); left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.85);
          border: 1px solid rgba(0,212,255,0.2);
          color: #00d4ff; font-family: 'JetBrains Mono', monospace;
          font-size: 9px; letter-spacing: 0.1em; padding: 4px 8px;
          border-radius: 3px; white-space: nowrap; opacity: 0;
          pointer-events: none; transition: opacity 0.15s;
        }
        .shell-nav-btn:hover::after { opacity: 1; }
        .shell-nav-sep { width: 1px; height: 20px; background: rgba(0,212,255,0.08); margin: 0 4px; }

        /* ══════════════════════════════════════════
           PANEL CONTROL
        ══════════════════════════════════════════ */
        .control-panel {
          position: absolute; inset: 38px 0 56px 0; z-index: 6;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 1px; background: rgba(0,212,255,0.06); overflow-y: auto;
        }
        .control-cell {
          background: rgba(4,4,10,0.95); padding: 20px 24px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .control-title {
          font-family: 'Orbitron', monospace; font-size: 9px; font-weight: 700;
          letter-spacing: 0.3em; color: rgba(0,212,255,0.5); text-transform: uppercase;
          border-bottom: 1px solid rgba(0,212,255,0.08); padding-bottom: 8px; margin-bottom: 4px;
        }
        .control-link {
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          color: rgba(0,212,255,0.5); letter-spacing: 0.05em;
          cursor: pointer; border: none; background: none;
          padding: 6px 0; text-align: left; transition: color 0.15s;
          display: flex; align-items: center; gap: 8px;
        }
        .control-link:hover { color: #00d4ff; }
        .control-link::before { content: "›"; font-size: 14px; color: rgba(0,212,255,0.3); }
      `}</style>

      {/* ══════════════════════════════════════════════════════
          BUG 8 FIX: glow FUERA del shell-root
          (hermano en el DOM, no hijo)
      ══════════════════════════════════════════════════════ */}
      {(glowVisible || glowFading) && (
        <div
          className={[
            "shell-glow-border",
            glowVisible && !glowFading ? "glow-active" : "",
            orbState === "processing" ? "glow-processing" : "",
            orbState === "speaking"   ? "glow-speaking"   : "",
            glowFading ? "glow-fading" : "",
          ].filter(Boolean).join(" ")}
        />
      )}

      <div className="shell-root">
        <div className="shell-grid" />
        <div className="shell-vignette" />

        {/* Status bar */}
        <div className="shell-status">
          <div className="shell-status-left">
            <span className="shell-brand">SISTEMA</span>
            <div className="shell-status-dot" />
            <span className="shell-status-text">
              {systemStatus.model || "gemma-4-8b"} · {systemStatus.backend ? "ONLINE" : "LOCAL"}
            </span>
          </div>
          <span className="shell-clock">{currentTime}</span>
        </div>

        {/* Cámara full */}
        {cameraOn && cameraMode === CAMERA_MODES.full && (
          <div className="camera-feed-full">
            <video ref={videoRef} autoPlay muted playsInline />
            <CameraModeControls mode={cameraMode} setMode={setCameraMode} />
            <div className="camera-overlay-text">// feed: live · sistema.cam</div>
          </div>
        )}

        {/* Cámara split */}
        {cameraOn && cameraMode === CAMERA_MODES.split && (
          <div className="camera-split-layout">
            <div className="camera-split-left">
              <Orb state={orbState} />
              {orbState === "idle" && <span className="shell-hint">decí "sistema" para activar</span>}
            </div>
            <div className="camera-split-right">
              <video ref={videoRef} autoPlay muted playsInline />
              <CameraModeControls mode={cameraMode} setMode={setCameraMode} />
              <div className="camera-overlay-text">// feed: live · sistema.cam</div>
            </div>
          </div>
        )}

        {/* Centro: orbe */}
        {!(cameraOn && (cameraMode === CAMERA_MODES.full || cameraMode === CAMERA_MODES.split)) && (
          <div className="shell-center">
            {activeTab !== "control" && (
              <Orb state={orbState} small={false} />
            )}
            {activeTab === "control" && <ControlPanel setView={setView} />}
          </div>
        )}

        {/* Orbe badge */}
        {cameraOn && (cameraMode === CAMERA_MODES.overlay || cameraMode === CAMERA_MODES.full) && (
          <div className={`orb-badge${cameraMode === CAMERA_MODES.full ? " orb-badge-full" : ""}`}>
            <Orb state={orbState} small />
          </div>
        )}

        {/* Cámara overlay */}
        {cameraOn && cameraMode === CAMERA_MODES.overlay && (
          <div className="camera-feed-overlay">
            <video ref={videoRef} autoPlay muted playsInline />
            <CameraModeControls mode={cameraMode} setMode={setCameraMode} />
            <div className="camera-overlay-text">// live</div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SUBTÍTULOS — Feature 2
            Se muestran cuando hay historial de Shell
        ══════════════════════════════════════════ */}
        {recentHistory.length > 0 && activeTab !== "control" && (
          <div className="shell-subtitles">
            {recentHistory.map((item, i) => (
              <div key={item.ts || i} className="shell-subtitle-line">
                <span className={`shell-subtitle-role ${item.role}`}>
                  {item.role === "user" ? "TÚ" : "SISTEMA"}
                </span>
                <span className={`shell-subtitle-text ${item.role}`}>
                  {item.text.length > 120 ? item.text.substring(0, 120) + "…" : item.text}
                </span>
              </div>
            ))}
            {isProcessing && (
              <div className="shell-processing-line">
                <div className="shell-processing-dot" />
                <div className="shell-processing-dot" />
                <div className="shell-processing-dot" />
              </div>
            )}
          </div>
        )}

        {/* Hint cuando no hay historial */}
        {recentHistory.length === 0 && orbState === "idle" && activeTab === "orb" &&
          !(cameraOn && (cameraMode === CAMERA_MODES.full || cameraMode === CAMERA_MODES.split)) && (
          <span className="shell-hint" style={{ position: "absolute", bottom: "80px" }}>
            decí "sistema" para activar
          </span>
        )}

        {/* Nav HUD */}
        <nav className="shell-nav">
          {tabs.map((tab, i) => {
            const isActive = activeTab === tab.id;
            const isVoice  = tab.id === "orb";
            let extraClass = "";
            if (isVoice && isActive) {
              if (orbState === "listening")  extraClass = " voice-active";
              if (orbState === "processing") extraClass = " voice-processing";
              if (orbState === "speaking")   extraClass = " voice-speaking";
            }
            return (
              <React.Fragment key={tab.id}>
                {i === tabs.length - 1 && <div className="shell-nav-sep" />}
                <button
                  className={`shell-nav-btn${isActive ? " active" : ""}${extraClass}`}
                  data-label={tab.label}
                  onClick={() => {
                    if (tab.id === "camera") {
                      handleCameraTab();
                    } else if (tab.id === "orb") {
                      setActiveTab("orb");
                      if (onToggleWakeWord) onToggleWakeWord(!wakeWordEnabled);
                    } else if (tab.id === "chat") {
                      stopSpeaking();
                      setActiveTab("chat");
                      setView("chat");
                    } else {
                      setActiveTab(tab.id);
                    }
                  }}
                  aria-label={tab.label}
                >
                  <tab.icon active={isActive} />
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </>
  );
}

/* ── Panel Control ────────────────────────────────────────── */
function ControlPanel({ setView }) {
  return (
    <div className="control-panel">
      <div className="control-cell">
        <div className="control-title">// Sistema</div>
        <button className="control-link" onClick={() => setView("doctor")}>DoctorBot — diagnóstico</button>
        <button className="control-link" onClick={() => setView("bots")}>Bots — gestión</button>
        <button className="control-link" onClick={() => setView("devices")}>Dispositivos — red</button>
      </div>
      <div className="control-cell">
        <div className="control-title">// Configuración</div>
        <button className="control-link" onClick={() => setView("settings")}>Settings</button>
        <button className="control-link" onClick={() => setView("instructions")}>Instrucciones del modelo</button>
      </div>
    </div>
  );
}

/* ── Controles de modo cámara ─────────────────────────────── */
function CameraModeControls({ mode, setMode }) {
  return (
    <div className="camera-mode-controls">
      <button className={`camera-mode-btn${mode === "overlay" ? " active" : ""}`}
        onClick={() => setMode(CAMERA_MODES.overlay)} title="Overlay">{OverlayIcon}</button>
      <button className={`camera-mode-btn${mode === "full" ? " active" : ""}`}
        onClick={() => setMode(CAMERA_MODES.full)} title="Full">{FullIcon}</button>
      <button className={`camera-mode-btn${mode === "split" ? " active" : ""}`}
        onClick={() => setMode(CAMERA_MODES.split)} title="Split">{SplitIcon}</button>
    </div>
  );
}

/* ── Iconos ───────────────────────────────────────────────── */
function OrbIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.5 : 1.2}>
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
      <line x1="12" y1="3" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="21" />
      <line x1="3" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function ChatIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.5 : 1.2}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function CameraIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.5 : 1.2}>
      <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}
function ControlIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.5 : 1.2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07" />
    </svg>
  );
}
const OverlayIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1" y="1" width="14" height="14" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
  </svg>
);
const FullIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1" y="1" width="14" height="14" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);
const SplitIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1" y="1" width="14" height="14" rx="1" /><line x1="8" y1="1" x2="8" y2="15" />
  </svg>
);
