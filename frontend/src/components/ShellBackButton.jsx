/**
 * ShellBackButton.jsx — Barra top fija con botón para volver al Shell
 * Usarlo como primera línea en DoctorPage, BotsPage, DevicesPage,
 * SettingsPage e InstructionsPage.
 * Props: setView (fn)
 */

import React from "react";

export default function ShellBackButton({ setView }) {
    if (!setView) return null;
    return (
        <div style={{
            position:     "fixed",
            top:          0,
            left:         0,
            right:        0,
            height:       38,
            background:   "#04040a",
            borderBottom: "1px solid rgba(0,212,255,0.08)",
            display:      "flex",
            alignItems:   "center",
            padding:      "0 16px",
            zIndex:       9999,
            gap:          12,
        }}>
            <button
                onClick={() => setView("shell")}
                style={{
                    background:    "none",
                    border:        "none",
                    cursor:        "pointer",
                    color:         "rgba(0,212,255,0.6)",
                    display:       "flex",
                    alignItems:    "center",
                    gap:           8,
                    fontFamily:    "'JetBrains Mono', monospace",
                    fontSize:      11,
                    letterSpacing: "0.1em",
                    padding:       "4px 8px",
                    borderRadius:  3,
                    transition:    "color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#00d4ff"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(0,212,255,0.6)"; }}
            >
                {/* Flecha SVG */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
                SISTEMA
            </button>

            {/* Separador + nombre de la sección actual (opcional, cosmético) */}
            <div style={{
                width:        1,
                height:       16,
                background:   "rgba(0,212,255,0.1)",
            }} />
            <span style={{
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      9,
                color:         "rgba(0,212,255,0.25)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
            }}>
                {/* El nombre se infiere del path actual — cosmético */}
                panel
            </span>
        </div>
    );
}