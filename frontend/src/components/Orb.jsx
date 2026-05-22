/**
 * Orb.jsx — v2 SISTEMA
 * Cuarto estado: "speaking" — pulso irregular verde-cian mientras Sistema habla
 * Estados: idle | listening | processing | speaking
 */

import React from "react";

export default function Orb({ state = "idle", small = false }) {
  const size = small ? 52 : 180;
  const r    = small ? 20 : 72;
  const cx   = size / 2;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');

        .orb-wrap {
          position: relative;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* ── SVG ring ──────────────────────────────────────── */
        .orb-ring {
          position: absolute; inset: 0;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .orb-ring.idle       { animation: orb-spin-slow 8s linear infinite; }
        .orb-ring.listening  { animation: orb-spin-med  2s linear infinite; }
        .orb-ring.processing { animation: orb-spin-fast 0.6s linear infinite; }
        .orb-ring.speaking   { animation: orb-spin-speak 1.4s linear infinite; }

        @keyframes orb-spin-slow  { to { transform: rotate(360deg);  } }
        @keyframes orb-spin-med   { to { transform: rotate(360deg);  } }
        @keyframes orb-spin-fast  { to { transform: rotate(360deg);  } }
        @keyframes orb-spin-speak { to { transform: rotate(-360deg); } } /* inverso al hablar */

        /* ── Núcleo pulsante ───────────────────────────────── */
        .orb-core {
          border-radius: 50%;
          background: radial-gradient(circle at 40% 35%, rgba(0,212,255,0.25) 0%, rgba(0,212,255,0.04) 100%);
          border: 1px solid rgba(0,212,255,0.15);
          display: flex; align-items: center; justify-content: center;
          position: relative; z-index: 2;
          transition: box-shadow 0.4s ease, border-color 0.4s ease;
        }

        .orb-core.idle {
          box-shadow: 0 0 20px rgba(0,212,255,0.08), inset 0 0 20px rgba(0,212,255,0.04);
          animation: core-idle 4s ease-in-out infinite;
        }
        .orb-core.listening {
          border-color: rgba(0,212,255,0.4);
          box-shadow: 0 0 40px rgba(0,212,255,0.2), inset 0 0 20px rgba(0,212,255,0.1);
          animation: core-listen 1.5s ease-in-out infinite;
        }
        .orb-core.processing {
          border-color: rgba(0,212,255,0.6);
          box-shadow: 0 0 60px rgba(0,212,255,0.35), inset 0 0 30px rgba(0,212,255,0.15);
          animation: core-process 0.6s ease-in-out infinite;
        }
        .orb-core.speaking {
          border-color: rgba(0,255,180,0.5);
          box-shadow: 0 0 50px rgba(0,255,180,0.25), inset 0 0 25px rgba(0,255,180,0.1);
          animation: core-speak 0.9s ease-in-out infinite;
        }

        @keyframes core-idle {
          0%, 100% { transform: scale(1);    opacity: 0.8; }
          50%       { transform: scale(1.02); opacity: 1;   }
        }
        @keyframes core-listen {
          0%, 100% { transform: scale(1);    }
          50%       { transform: scale(1.06); }
        }
        @keyframes core-process {
          0%, 100% { transform: scale(1);    }
          50%       { transform: scale(1.12); }
        }
        @keyframes core-speak {
          0%        { transform: scale(1);    }
          25%       { transform: scale(1.08); }
          50%       { transform: scale(1.03); }
          75%       { transform: scale(1.10); }
          100%      { transform: scale(1);    }
        }

        /* ── Label ─────────────────────────────────────────── */
        .orb-label {
          font-family: 'Orbitron', monospace;
          font-weight: 700; letter-spacing: 0.25em;
          color: rgba(0,212,255,0.85); text-transform: uppercase;
          text-align: center; user-select: none;
        }
        .orb-label.speaking { color: rgba(0,255,180,0.85); }

        /* ── Partículas orbitales (solo en listening/processing/speaking) ── */
        .orb-particle {
          position: absolute; border-radius: 50%;
          background: #00d4ff;
          animation: particle-orbit linear infinite;
        }
        .orb-particle.speaking { background: #00ffb4; }

        @keyframes particle-orbit {
          from { transform: rotate(0deg)   translateX(var(--r)) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(var(--r)) rotate(-360deg); }
        }
      `}</style>

      <div className="orb-wrap" style={{ width: size, height: size }}>
        {/* Ring SVG */}
        <svg
          className={`orb-ring ${state}`}
          width={size} height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Arco principal */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={state === "speaking" ? "rgba(0,255,180,0.6)" : "rgba(0,212,255,0.6)"}
            strokeWidth={small ? 1 : 1.5}
            strokeDasharray={`${r * 1.8} ${r * 4.45}`}
            strokeLinecap="round"
          />
          {/* Arco secundario tenue */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={state === "speaking" ? "rgba(0,255,180,0.2)" : "rgba(0,212,255,0.2)"}
            strokeWidth={small ? 0.5 : 1}
            strokeDasharray={`${r * 0.8} ${r * 5.45}`}
            strokeLinecap="round"
            strokeDashoffset={`-${r * 2}`}
          />
        </svg>

        {/* Core */}
        <div
          className={`orb-core ${state}`}
          style={{ width: r * 1.4, height: r * 1.4 }}
        >
          {!small && (
            <span
              className={`orb-label ${state === "speaking" ? "speaking" : ""}`}
              style={{ fontSize: r * 0.13 }}
            >
              SISTEMA
            </span>
          )}
        </div>

        {/* Partículas en estados activos */}
        {!small && state !== "idle" && [0, 120, 240].map((deg, i) => (
          <div
            key={i}
            className={`orb-particle ${state === "speaking" ? "speaking" : ""}`}
            style={{
              width: state === "processing" ? 4 : 3,
              height: state === "processing" ? 4 : 3,
              "--r": `${r + 8}px`,
              top: "50%", left: "50%",
              marginTop: -2, marginLeft: -2,
              opacity: 0.7,
              animationDuration: state === "processing" ? "0.8s" : state === "speaking" ? "1.2s" : "2s",
              animationDelay: `${i * (state === "processing" ? 0.27 : state === "speaking" ? 0.4 : 0.67)}s`,
            }}
          />
        ))}
      </div>
    </>
  );
}