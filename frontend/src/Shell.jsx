/**
 * Shell.jsx — Vista principal / home de SISTEMA
 * Pantalla completa oscura con orbe central, navegación HUD inferior,
 * glow de bordes con efecto respiración, y soporte de cámara multi-modo.
 * Reemplaza Dashboard como view="shell" (default de App.jsx).
 *
 * Props:
 *   wakeWordState     — "idle" | "listening" | "processing" (viene de App.jsx)
 *   wakeWordEnabled   — boolean
 *   onToggleWakeWord  — fn(bool)
 *   setView           — fn(string) navegación global de App.jsx
 *   systemStatus      — { model, backend, time } info de estado
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import Orb from "./components/Orb";

/* ── Modos de cámara ─────────────────────────────────────────── */
const CAMERA_MODES = {
  overlay: "overlay", // cámara esquina inferior derecha (default)
  full:    "full",    // cámara pantalla completa
  split:   "split",  // split: chat izq + cámara der
};

export default function Shell({
  wakeWordState   = "idle",
  wakeWordEnabled = true,
  onToggleWakeWord,
  setView,
  systemStatus    = {},
}) {
  const [activeTab,   setActiveTab]   = useState("orb");   // orb | chat | camera | control
  const [cameraMode,  setCameraMode]  = useState(CAMERA_MODES.overlay);
  const [cameraOn,    setCameraOn]    = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [glowVisible, setGlowVisible] = useState(false);
  const [glowFading,  setGlowFading]  = useState(false);
  const glowTimerRef  = useRef(null);
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);

  /* ── Reloj ───────────────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  /* ── Glow: activar/desactivar según wakeWordState ────────── */
  useEffect(() => {
    clearTimeout(glowTimerRef.current);

    if (wakeWordState !== "idle") {
      setGlowFading(false);
      setGlowVisible(true);
    } else {
      // fade out de 600ms
      setGlowFading(true);
      glowTimerRef.current = setTimeout(() => {
        setGlowVisible(false);
        setGlowFading(false);
      }, 600);
    }
    return () => clearTimeout(glowTimerRef.current);
  }, [wakeWordState]);

  /* ── Cámara: encender/apagar stream ─────────────────────── */
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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
    if (activeTab === "camera") {
      stopCamera();
      setActiveTab("orb");
    } else {
      setActiveTab("camera");
      startCamera();
    }
  }, [activeTab, startCamera, stopCamera]);

  /* ── Cleanup al desmontar ─────────────────────────────────── */
  useEffect(() => () => stopCamera(), [stopCamera]);

  /* ── Orbe pequeño (badge): activo cuando cámara full/overlay ─ */
  const orbIsSmall = cameraOn && (cameraMode === CAMERA_MODES.full || cameraMode === CAMERA_MODES.overlay);

  /* ── Nav tabs config ─────────────────────────────────────── */
  const tabs = [
    { id: "orb",     icon: OrbIcon,     label: "Sistema" },
    { id: "chat",    icon: ChatIcon,    label: "Chat"    },
    { id: "camera",  icon: CameraIcon,  label: "Cámara"  },
    { id: "control", icon: ControlIcon, label: "Control" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;700&family=JetBrains+Mono:wght@300;400&display=swap');

        /* ══════════════════════════════════════════
           RESET / BASE
        ══════════════════════════════════════════ */
        .shell-root * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ══════════════════════════════════════════
           SHELL ROOT — pantalla completa
        ══════════════════════════════════════════ */
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

        /* ── Grilla de fondo ───────────────────── */
        .shell-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        /* ── Viñeta radial central ─────────────── */
        .shell-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse 70% 70% at 50% 50%,
            transparent 0%,
            rgba(4, 4, 10, 0.7) 100%
          );
          pointer-events: none;
          z-index: 1;
        }

        /* ══════════════════════════════════════════
           BORDES GLOW — respiración estilo Iron Man
        ══════════════════════════════════════════ */
        .shell-glow-border {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 99999;          /* encima de todo */
          border-radius: 0;
          opacity: 0;
          transition: opacity 600ms ease;
          /* Borde sólido cian + box-shadow inset — doble efecto */
          border: 2px solid transparent;
        }
        .shell-glow-border.glow-active {
          opacity: 1;
          border-color: rgba(0,212,255,0.4);
          animation: glow-breathe-slow 2s ease-in-out infinite;
        }
        .shell-glow-border.glow-active.glow-processing {
          border-color: rgba(0,212,255,0.7);
          animation: glow-breathe-fast 0.8s ease-in-out infinite;
        }
        .shell-glow-border.glow-fading {
          opacity: 0;
          border-color: transparent;
          animation: none;
        }

        @keyframes glow-breathe-slow {
          0%, 100% {
            box-shadow:
              inset 0 0 30px rgba(0,212,255,0.15),
              inset 0 0 60px rgba(0,212,255,0.06);
          }
          50% {
            box-shadow:
              inset 0 0 60px rgba(0,212,255,0.45),
              inset 0 0 120px rgba(0,212,255,0.18),
              inset 0 0 6px  rgba(0,212,255,0.8);
          }
        }
        @keyframes glow-breathe-fast {
          0%, 100% {
            box-shadow:
              inset 0 0 30px rgba(0,212,255,0.2),
              inset 0 0 80px rgba(0,212,255,0.08);
          }
          50% {
            box-shadow:
              inset 0 0 80px rgba(0,212,255,0.6),
              inset 0 0 160px rgba(0,212,255,0.25),
              inset 0 0 8px   rgba(0,212,255,0.9);
          }
        }

        /* ══════════════════════════════════════════
           STATUS BAR — top
        ══════════════════════════════════════════ */
        .shell-status {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 10;
          border-bottom: 1px solid rgba(0,212,255,0.06);
          background: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent);
        }
        .shell-status-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .shell-brand {
          font-family: 'Orbitron', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3em;
          color: rgba(0,212,255,0.9);
          text-transform: uppercase;
        }
        .shell-status-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #00d4ff;
          animation: status-pulse 3s ease-in-out infinite;
          box-shadow: 0 0 6px #00d4ff;
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .shell-status-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          color: rgba(0,212,255,0.45);
          letter-spacing: 0.08em;
        }
        .shell-clock {
          font-family: 'Orbitron', monospace;
          font-size: 13px;
          font-weight: 400;
          color: rgba(0,212,255,0.7);
          letter-spacing: 0.15em;
        }

        /* ══════════════════════════════════════════
           ÁREA CENTRAL — orbe o contenido
        ══════════════════════════════════════════ */
        .shell-center {
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          width: 100%;
          gap: 32px;
        }

        /* Estado idle: texto sugerencia debajo del orbe */
        .shell-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(0,212,255,0.3);
          letter-spacing: 0.2em;
          text-transform: uppercase;
          animation: hint-fade 6s ease-in-out infinite;
        }
        @keyframes hint-fade {
          0%, 100% { opacity: 0.3; }
          50%       { opacity: 0.7; }
        }

        /* ══════════════════════════════════════════
           CÁMARA — multi-modo
        ══════════════════════════════════════════ */
        .camera-feed-full {
          position: absolute;
          inset: 0;
          z-index: 3;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .camera-feed-full video {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.85;
        }

        .camera-feed-overlay {
          position: absolute;
          bottom: 80px; right: 24px;
          width: 260px; height: 146px;
          z-index: 20;
          border: 1px solid rgba(0,212,255,0.3);
          border-radius: 4px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 0 24px rgba(0,212,255,0.15);
          transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .camera-feed-overlay video {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.9;
        }

        /* Split: orbe izq + cámara der */
        .camera-split-layout {
          position: absolute;
          inset: 38px 0 60px 0;
          display: flex;
          z-index: 4;
        }
        .camera-split-left {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
        }
        .camera-split-right {
          width: 45%;
          border-left: 1px solid rgba(0,212,255,0.12);
          position: relative;
          background: #000;
        }
        .camera-split-right video {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.85;
        }

        /* Controles de modo de cámara */
        .camera-mode-controls {
          position: absolute;
          top: 8px; right: 8px;
          display: flex;
          gap: 6px;
          z-index: 30;
        }
        .camera-mode-btn {
          width: 24px; height: 24px;
          border-radius: 3px;
          border: 1px solid rgba(0,212,255,0.25);
          background: rgba(0,0,0,0.7);
          color: rgba(0,212,255,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 10px;
        }
        .camera-mode-btn:hover,
        .camera-mode-btn.active {
          border-color: #00d4ff;
          color: #00d4ff;
          background: rgba(0,212,255,0.1);
        }

        /* Overlay de texto de cámara */
        .camera-overlay-text {
          position: absolute;
          bottom: 8px; left: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 8px;
          color: rgba(0,212,255,0.6);
          letter-spacing: 0.1em;
          pointer-events: none;
        }

        /* Orbe badge (pequeño) cuando cámara activa */
        .orb-badge {
          position: absolute;
          bottom: 70px; right: 295px;
          z-index: 25;
          transition: all 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        .orb-badge.orb-badge-full {
          bottom: 70px;
          right: 16px;
        }

        /* ══════════════════════════════════════════
           NAV HUD — inferior
        ══════════════════════════════════════════ */
        .shell-nav {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          z-index: 10;
          background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
        }

        .shell-nav-btn {
          position: relative;
          width: 44px; height: 44px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(255,255,255,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          outline: none;
        }
        .shell-nav-btn:hover {
          color: rgba(0,212,255,0.7);
          border-color: rgba(0,212,255,0.15);
          background: rgba(0,212,255,0.05);
        }
        .shell-nav-btn.active {
          color: #00d4ff;
          border-color: rgba(0,212,255,0.35);
          background: rgba(0,212,255,0.08);
          box-shadow: 0 0 16px rgba(0,212,255,0.15);
        }

        /* Pulso sincronizado en botón voz cuando escuchando */
        .shell-nav-btn.active.voice-active {
          animation: nav-voice-pulse 2s ease-in-out infinite;
        }
        .shell-nav-btn.active.voice-processing {
          animation: nav-voice-pulse 0.8s ease-in-out infinite;
        }
        @keyframes nav-voice-pulse {
          0%, 100% { box-shadow: 0 0 8px  rgba(0,212,255,0.15); }
          50%       { box-shadow: 0 0 24px rgba(0,212,255,0.5);  }
        }

        /* Tooltip */
        .shell-nav-btn::after {
          content: attr(data-label);
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.85);
          border: 1px solid rgba(0,212,255,0.2);
          color: #00d4ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.1em;
          padding: 4px 8px;
          border-radius: 3px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s;
        }
        .shell-nav-btn:hover::after { opacity: 1; }

        /* Separador entre nav items */
        .shell-nav-sep {
          width: 1px;
          height: 20px;
          background: rgba(0,212,255,0.08);
          margin: 0 4px;
        }

        /* ══════════════════════════════════════════
           PANEL CONTROL
        ══════════════════════════════════════════ */
        .control-panel {
          position: absolute;
          inset: 38px 0 56px 0;
          z-index: 6;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 1px;
          background: rgba(0,212,255,0.06);
          overflow-y: auto;
        }
        .control-cell {
          background: rgba(4,4,10,0.95);
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .control-cell-wide {
          grid-column: 1 / -1;
        }
        .control-title {
          font-family: 'Orbitron', monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.3em;
          color: rgba(0,212,255,0.5);
          text-transform: uppercase;
          border-bottom: 1px solid rgba(0,212,255,0.08);
          padding-bottom: 8px;
          margin-bottom: 4px;
        }
        .control-btn {
          padding: 8px 14px;
          border-radius: 3px;
          border: 1px solid rgba(0,212,255,0.15);
          background: rgba(0,212,255,0.04);
          color: rgba(0,212,255,0.75);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          width: 100%;
        }
        .control-btn:hover {
          border-color: rgba(0,212,255,0.4);
          background: rgba(0,212,255,0.1);
          color: #00d4ff;
        }
        .control-link {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(0,212,255,0.5);
          letter-spacing: 0.05em;
          cursor: pointer;
          border: none;
          background: none;
          padding: 6px 0;
          text-align: left;
          transition: color 0.15s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .control-link:hover { color: #00d4ff; }
        .control-link::before {
          content: "›";
          font-size: 14px;
          color: rgba(0,212,255,0.3);
        }
      `}</style>

      {/* ── Bordes glow ─────────────────────────────────────── */}
      {(glowVisible || glowFading) && (
        <div className={`shell-glow-border${
          glowVisible && !glowFading ? " glow-active" : ""
        }${wakeWordState === "processing" ? " glow-processing" : ""
        }${glowFading ? " glow-fading" : ""}`} />
      )}

      <div className="shell-root">
        <div className="shell-grid" />
        <div className="shell-vignette" />

        {/* ── Status bar top ───────────────────────────────── */}
        <div className="shell-status">
          <div className="shell-status-left">
            <span className="shell-brand">SISTEMA</span>
            <div className="shell-status-dot" />
            <span className="shell-status-text">
              {systemStatus.model || "gemma-4-8b"} ·{" "}
              {systemStatus.backend ? "ONLINE" : "LOCAL"}
            </span>
          </div>
          <span className="shell-clock">{currentTime}</span>
        </div>

        {/* ══════════════════════════════════════════════════
            CONTENIDO SEGÚN MODO CÁMARA + TAB ACTIVO
        ══════════════════════════════════════════════════ */}

        {/* ── Modo: cámara full ──────────────────────────── */}
        {cameraOn && cameraMode === CAMERA_MODES.full && (
          <div className="camera-feed-full">
            <video ref={videoRef} autoPlay muted playsInline />
            <div className="camera-mode-controls">
              <button
                className={`camera-mode-btn${cameraMode === "overlay" ? " active" : ""}`}
                onClick={() => setCameraMode(CAMERA_MODES.overlay)}
                title="Overlay"
              >{OverlayIcon}</button>
              <button
                className={`camera-mode-btn${cameraMode === "full" ? " active" : ""}`}
                onClick={() => setCameraMode(CAMERA_MODES.full)}
                title="Full"
              >{FullIcon}</button>
              <button
                className={`camera-mode-btn${cameraMode === "split" ? " active" : ""}`}
                onClick={() => setCameraMode(CAMERA_MODES.split)}
                title="Split"
              >{SplitIcon}</button>
            </div>
            <div className="camera-overlay-text">// feed: live · sistema.cam</div>
          </div>
        )}

        {/* ── Modo: split ────────────────────────────────── */}
        {cameraOn && cameraMode === CAMERA_MODES.split && (
          <div className="camera-split-layout">
            <div className="camera-split-left">
              <Orb state={wakeWordState} />
              {wakeWordState === "idle" && (
                <span className="shell-hint">decí "sistema" para activar</span>
              )}
            </div>
            <div className="camera-split-right">
              <video ref={videoRef} autoPlay muted playsInline />
              <div className="camera-mode-controls">
                <button className={`camera-mode-btn${cameraMode==="overlay"?" active":""}`}
                  onClick={() => setCameraMode(CAMERA_MODES.overlay)} title="Overlay">{OverlayIcon}</button>
                <button className={`camera-mode-btn${cameraMode==="full"?" active":""}`}
                  onClick={() => setCameraMode(CAMERA_MODES.full)} title="Full">{FullIcon}</button>
                <button className={`camera-mode-btn${cameraMode==="split"?" active":""}`}
                  onClick={() => setCameraMode(CAMERA_MODES.split)} title="Split">{SplitIcon}</button>
              </div>
              <div className="camera-overlay-text">// feed: live · sistema.cam</div>
            </div>
          </div>
        )}

        {/* ── Centro: orbe (no split, no full) ─────────────── */}
        {!(cameraOn && (cameraMode === CAMERA_MODES.full || cameraMode === CAMERA_MODES.split)) && (
          <div className="shell-center">
            {activeTab !== "control" && (
              <>
                <Orb state={wakeWordState} small={false} />
                {wakeWordState === "idle" && activeTab === "orb" && (
                  <span className="shell-hint">decí "sistema" para activar</span>
                )}
                {wakeWordState === "listening" && (
                  <span className="shell-hint" style={{ color: "rgba(0,212,255,0.6)", animationDuration: "1s" }}>
                    escuchando...
                  </span>
                )}
                {wakeWordState === "processing" && (
                  <span className="shell-hint" style={{ color: "rgba(0,212,255,0.8)", animationDuration: "0.5s" }}>
                    procesando...
                  </span>
                )}
              </>
            )}

            {/* Panel control */}
            {activeTab === "control" && (
              <ControlPanel setView={setView} />
            )}
          </div>
        )}

        {/* ── Orbe badge (cámara overlay o full) ────────────── */}
        {cameraOn && (cameraMode === CAMERA_MODES.overlay || cameraMode === CAMERA_MODES.full) && (
          <div className={`orb-badge${cameraMode === CAMERA_MODES.full ? " orb-badge-full" : ""}`}>
            <Orb state={wakeWordState} small />
          </div>
        )}

        {/* ── Cámara overlay ────────────────────────────────── */}
        {cameraOn && cameraMode === CAMERA_MODES.overlay && (
          <div className="camera-feed-overlay">
            <video ref={videoRef} autoPlay muted playsInline />
            <div className="camera-mode-controls">
              <button className={`camera-mode-btn${cameraMode==="overlay"?" active":""}`}
                onClick={() => setCameraMode(CAMERA_MODES.overlay)} title="Overlay">{OverlayIcon}</button>
              <button className={`camera-mode-btn${cameraMode==="full"?" active":""}`}
                onClick={() => setCameraMode(CAMERA_MODES.full)} title="Full">{FullIcon}</button>
              <button className={`camera-mode-btn${cameraMode==="split"?" active":""}`}
                onClick={() => setCameraMode(CAMERA_MODES.split)} title="Split">{SplitIcon}</button>
            </div>
            <div className="camera-overlay-text">// live</div>
          </div>
        )}

        {/* ── Nav HUD inferior ──────────────────────────────── */}
        <nav className="shell-nav">
          {tabs.map((tab, i) => {
            const isActive = activeTab === tab.id;
            const isVoice  = tab.id === "orb";
            let extraClass = "";
            if (isVoice && isActive) {
              if (wakeWordState === "listening")  extraClass = " voice-active";
              if (wakeWordState === "processing") extraClass = " voice-processing";
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

/* ══════════════════════════════════════════════════════════════
   PANEL CONTROL — reemplaza Dashboard
══════════════════════════════════════════════════════════════ */
function ControlPanel({ setView }) {
  return (
    <div className="control-panel">
      <div className="control-cell">
        <div className="control-title">// Sistema</div>
        <button className="control-link" onClick={() => setView("doctor")}>DoctorBot — diagnóstico</button>
        <button className="control-link" onClick={() => setView("bots")}>Bots — gestión</button>
        <button className="control-link" onClick={() => setView("devices")}>Dispositivos — red</button>
        <button className="control-link" onClick={() => setView("dashboard")}>Dashboard clásico</button>
      </div>
      <div className="control-cell">
        <div className="control-title">// Configuración</div>
        <button className="control-link" onClick={() => setView("settings")}>Settings</button>
        <button className="control-link" onClick={() => setView("instructions")}>Instrucciones del modelo</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ICONOS SVG — HUD minimalistas
══════════════════════════════════════════════════════════════ */
function OrbIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.5 : 1.2}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="3" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="21" y2="12" />
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
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
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

/* Iconos de modo de cámara */
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
    <rect x="1" y="1" width="14" height="14" rx="1" />
    <line x1="8" y1="1" x2="8" y2="15" />
  </svg>
);