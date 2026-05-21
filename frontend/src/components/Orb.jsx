/**
 * Orb.jsx — Orbe central animado de SISTEMA
 * Tres estados: idle (giro lento), listening (pulso medio), processing (rotación rápida)
 * CSS puro, sin librerías de animación externas.
 * Recibe `state` prop directo desde wakeWordState de App.jsx
 * Recibe `small` prop para modo badge (esquina inferior derecha cuando cámara activa)
 */

import React from "react";

export default function Orb({ state = "idle", small = false, onClick }) {
  return (
    <>
      <style>{`
        /* ── Variables del orbe ─────────────────────────── */
        .orb-root {
          --orb-cyan:    #00d4ff;
          --orb-cyan2:   #0099cc;
          --orb-glow:    rgba(0, 212, 255, 0.35);
          --orb-glow-lg: rgba(0, 212, 255, 0.12);
          --orb-size:    220px;
          --orb-ring:    3px;
        }
        .orb-root.orb-small {
          --orb-size:  64px;
          --orb-ring:  2px;
        }

        /* ── Contenedor posicionado ──────────────────────── */
        .orb-root {
          position: relative;
          width:  var(--orb-size);
          height: var(--orb-size);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: ${onClick ? "pointer" : "default"};
          flex-shrink: 0;
        }

        /* ── Halo exterior (más grande, muy difuso) ──────── */
        .orb-halo {
          position: absolute;
          inset: -30%;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            var(--orb-glow-lg) 0%,
            transparent 70%
          );
          animation: orb-halo-idle 4s ease-in-out infinite;
          pointer-events: none;
        }
        .orb-root.orb-listening .orb-halo {
          animation: orb-halo-listen 2s ease-in-out infinite;
        }
        .orb-root.orb-processing .orb-halo {
          animation: orb-halo-process 0.8s ease-in-out infinite;
        }
        .orb-root.orb-small .orb-halo { display: none; }

        /* ── Anillo exterior giratorio ───────────────────── */
        .orb-ring-outer {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: var(--orb-ring) solid transparent;
          border-top-color:  var(--orb-cyan);
          border-right-color: var(--orb-cyan2);
          animation: orb-spin-slow 8s linear infinite;
          opacity: 0.6;
        }
        .orb-root.orb-listening .orb-ring-outer {
          animation: orb-spin-slow 3s linear infinite;
          opacity: 0.85;
        }
        .orb-root.orb-processing .orb-ring-outer {
          animation: orb-spin-slow 0.7s linear infinite;
          opacity: 1;
          border-top-color:  var(--orb-cyan);
          border-right-color: var(--orb-cyan);
          border-bottom-color: var(--orb-cyan2);
        }

        /* ── Anillo interior (gira al revés) ─────────────── */
        .orb-ring-inner {
          position: absolute;
          inset: 14%;
          border-radius: 50%;
          border: var(--orb-ring) solid transparent;
          border-bottom-color: var(--orb-cyan);
          border-left-color:   var(--orb-cyan2);
          animation: orb-spin-rev 12s linear infinite;
          opacity: 0.45;
        }
        .orb-root.orb-listening .orb-ring-inner {
          animation: orb-spin-rev 4s linear infinite;
          opacity: 0.7;
        }
        .orb-root.orb-processing .orb-ring-inner {
          animation: orb-spin-rev 1s linear infinite;
          opacity: 0.9;
        }
        .orb-root.orb-small .orb-ring-inner { display: none; }

        /* ── Esfera central ──────────────────────────────── */
        .orb-sphere {
          position: absolute;
          inset: 18%;
          border-radius: 50%;
          background: radial-gradient(
            circle at 38% 35%,
            rgba(0, 212, 255, 0.22) 0%,
            rgba(0, 20, 40,  0.85)  55%,
            rgba(0, 0,  10,  0.95)  100%
          );
          border: 1px solid rgba(0, 212, 255, 0.18);
          box-shadow:
            0 0 20px rgba(0, 212, 255, 0.08),
            inset 0 0 30px rgba(0, 0, 0, 0.6);
          animation: orb-sphere-idle 5s ease-in-out infinite;
        }
        .orb-root.orb-listening .orb-sphere {
          animation: orb-sphere-listen 2s ease-in-out infinite;
          border-color: rgba(0, 212, 255, 0.4);
          box-shadow:
            0 0 30px rgba(0, 212, 255, 0.25),
            inset 0 0 20px rgba(0, 212, 255, 0.08);
        }
        .orb-root.orb-processing .orb-sphere {
          animation: orb-sphere-process 0.9s ease-in-out infinite;
          border-color: rgba(0, 212, 255, 0.6);
          box-shadow:
            0 0 40px rgba(0, 212, 255, 0.4),
            inset 0 0 20px rgba(0, 212, 255, 0.15);
        }

        /* ── Label SISTEMA ───────────────────────────────── */
        .orb-label {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          font-family: 'Rajdhani', 'Orbitron', monospace;
          font-size: clamp(8px, 1.8vw, 13px);
          font-weight: 600;
          letter-spacing: 0.25em;
          color: var(--orb-cyan);
          opacity: 0.7;
          text-transform: uppercase;
          white-space: nowrap;
          pointer-events: none;
          text-shadow: 0 0 10px var(--orb-cyan);
        }
        .orb-root.orb-small .orb-label { display: none; }

        /* ── Punto central pulsante ──────────────────────── */
        .orb-core {
          position: absolute;
          width:  28%;
          height: 28%;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(0, 212, 255, 0.9) 0%,
            rgba(0, 212, 255, 0.2) 60%,
            transparent 100%
          );
          animation: orb-core-idle 4s ease-in-out infinite;
        }
        .orb-root.orb-listening .orb-core {
          animation: orb-core-listen 1.5s ease-in-out infinite;
        }
        .orb-root.orb-processing .orb-core {
          animation: orb-core-process 0.5s ease-in-out infinite;
        }
        .orb-root.orb-small .orb-core {
          width: 50%;
          height: 50%;
        }

        /* ── Partículas orbitando (solo idle y listening) ── */
        .orb-particle {
          position: absolute;
          width:  3px;
          height: 3px;
          border-radius: 50%;
          background: var(--orb-cyan);
          box-shadow: 0 0 6px var(--orb-cyan);
          pointer-events: none;
        }
        .orb-particle-1 {
          animation: orb-orbit-1 6s linear infinite;
          opacity: 0.8;
        }
        .orb-particle-2 {
          animation: orb-orbit-2 9s linear infinite;
          opacity: 0.5;
        }
        .orb-particle-3 {
          animation: orb-orbit-3 4.5s linear infinite;
          opacity: 0.6;
        }
        .orb-root.orb-processing .orb-particle-1 { animation-duration: 1.5s; }
        .orb-root.orb-processing .orb-particle-2 { animation-duration: 2s;   }
        .orb-root.orb-processing .orb-particle-3 { animation-duration: 1.2s; }
        .orb-root.orb-small .orb-particle { display: none; }

        /* ════════ KEYFRAMES ════════════════════════════════ */

        @keyframes orb-spin-slow {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        @keyframes orb-spin-rev {
          from { transform: rotate(0deg);    }
          to   { transform: rotate(-360deg); }
        }

        @keyframes orb-halo-idle {
          0%, 100% { opacity: 0.4; transform: scale(1);    }
          50%       { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes orb-halo-listen {
          0%, 100% { opacity: 0.5; transform: scale(1);    }
          50%       { opacity: 1;   transform: scale(1.12); }
        }
        @keyframes orb-halo-process {
          0%, 100% { opacity: 0.6; transform: scale(1);    }
          50%       { opacity: 1;   transform: scale(1.18); }
        }

        @keyframes orb-sphere-idle {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 1;   }
        }
        @keyframes orb-sphere-listen {
          0%, 100% { opacity: 0.85; transform: scale(1);    }
          50%       { opacity: 1;   transform: scale(1.04); }
        }
        @keyframes orb-sphere-process {
          0%, 100% { opacity: 0.9; transform: scale(1);    }
          50%       { opacity: 1;   transform: scale(1.08); }
        }

        @keyframes orb-core-idle {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50%       { opacity: 0.9; transform: scale(1.1); }
        }
        @keyframes orb-core-listen {
          0%, 100% { opacity: 0.7; transform: scale(1);   }
          50%       { opacity: 1;   transform: scale(1.3); }
        }
        @keyframes orb-core-process {
          0%, 100% { opacity: 0.8; transform: scale(1);   }
          50%       { opacity: 1;   transform: scale(1.5); }
        }

        /* Partículas orbitando en el plano XY */
        @keyframes orb-orbit-1 {
          0%   { transform: rotate(0deg)   translateX(38%) scale(1);   }
          50%  { transform: rotate(180deg) translateX(38%) scale(1.3); }
          100% { transform: rotate(360deg) translateX(38%) scale(1);   }
        }
        @keyframes orb-orbit-2 {
          0%   { transform: rotate(120deg) translateX(32%) scale(0.8); }
          50%  { transform: rotate(300deg) translateX(32%) scale(1.2); }
          100% { transform: rotate(480deg) translateX(32%) scale(0.8); }
        }
        @keyframes orb-orbit-3 {
          0%   { transform: rotate(240deg) translateX(44%) scale(1);   }
          50%  { transform: rotate(420deg) translateX(44%) scale(0.7); }
          100% { transform: rotate(600deg) translateX(44%) scale(1);   }
        }
      `}</style>

      <div
        className={`orb-root orb-${state}${small ? " orb-small" : ""}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        aria-label={onClick ? `SISTEMA — estado: ${state}` : undefined}
      >
        <div className="orb-halo" />
        <div className="orb-ring-outer" />
        <div className="orb-ring-inner" />
        <div className="orb-sphere" />
        {!small && (
          <>
            <div className="orb-particle orb-particle-1" />
            <div className="orb-particle orb-particle-2" />
            <div className="orb-particle orb-particle-3" />
            <div className="orb-label">SISTEMA</div>
          </>
        )}
        <div className="orb-core" />
      </div>
    </>
  );
}