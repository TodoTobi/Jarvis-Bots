/**
 * App.jsx — con WakeWord GLOBAL + Shell visual
 * Shell es la home (view default). WakeWord sigue montado a nivel raíz.
 * Cambios respecto al original:
 *   1. import Shell
 *   2. view default: "dashboard" → "shell"
 *   3. case "shell" en renderView()
 *   4. Badge/pill flotante solo cuando view !== "shell" (Shell tiene los suyos)
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import BotsPage from "./BotsPage";
import DevicesPage from "./DevicesPage";
import Dashboard from "./Dashboard";
import InstructionsPage from "./InstructionsPage";
import SettingsPage from "./SettingsPage";
import DoctorPage from "./DoctorPage";
import WakeWord from "./WakeWord";
import Shell from "./Shell";           // ← NUEVO
import "./App.css";

function App() {
    // "shell" es la home. Dashboard accesible desde ControlPanel del Shell.
    const [view, setView] = useState("shell");  // ← CAMBIADO de "dashboard"
    const [doctorErrors, setDoctorErrors] = useState(0);
    const [currentConvId, setCurrentConvId] = useState(null);
    const [chatKey, setChatKey] = useState(0);

    const [wakeWordState, setWakeWordState] = useState("idle");
    const [wakeWordEnabled, setWakeWordEnabled] = useState(
        () => localStorage.getItem("jarvis_wakeword") !== "false"
    );

    const pendingCommandRef = useRef(null);
    const chatSendRef = useRef(null);

    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch("http://localhost:3001/api/doctor/scan");
                const data = await res.json();
                setDoctorErrors(data.summary?.errors || 0);
            } catch { }
        };
        check();
        const iv = setInterval(check, 30000);
        return () => clearInterval(iv);
    }, []);

    const handleSelectConversation = useCallback((conv) => {
        const id = typeof conv === "string" ? conv : conv?.id;
        setCurrentConvId(id || null);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    const handleNewConversation = useCallback(() => {
        setCurrentConvId(null);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    const handleWakeWordCommand = useCallback((text) => {
        console.log("[App] WakeWord comando recibido:", text);
        if (view === "chat" && chatSendRef.current) {
            chatSendRef.current(text, { isAudio: true });
        } else {
            pendingCommandRef.current = text;
            setCurrentConvId(null);
            setChatKey(k => k + 1);
            setView("chat");
        }
    }, [view]);

    const handleNavigateToChat = useCallback(() => {
        if (view !== "chat") {
            setCurrentConvId(null);
            setChatKey(k => k + 1);
            setView("chat");
        }
    }, [view]);

    const handleChatReady = useCallback((sendFn) => {
        chatSendRef.current = sendFn;
        if (pendingCommandRef.current) {
            const cmd = pendingCommandRef.current;
            pendingCommandRef.current = null;
            setTimeout(() => { sendFn(cmd, { isAudio: true }); }, 400);
        }
    }, []);

    const renderView = () => {
        switch (view) {
            // ── Shell — home visual ──────────────────────────────
            case "shell":
                return (
                    <Shell
                        wakeWordState={wakeWordState}
                        wakeWordEnabled={wakeWordEnabled}
                        onToggleWakeWord={(v) => {
                            setWakeWordEnabled(v);
                            localStorage.setItem("jarvis_wakeword", String(v));
                        }}
                        setView={setView}
                        systemStatus={{ backend: true }}
                    />
                );
            // ── Vistas existentes (sin cambios) ─────────────────
            case "bots":         return <BotsPage        setView={setView} />;
            case "devices":      return <DevicesPage     setView={setView} />;
            case "instructions": return <InstructionsPage setView={setView} />;
            case "settings":     return <SettingsPage    setView={setView} />;
            case "doctor":       return <DoctorPage      setView={setView} />;
            case "chat":
                return (
                    <Chat
                        key={chatKey}
                        propConvId={currentConvId}
                        onReady={handleChatReady}
                        globalWakeWordState={wakeWordState}
                        globalWakeWordEnabled={wakeWordEnabled}
                        onToggleWakeWord={(v) => {
                            setWakeWordEnabled(v);
                            localStorage.setItem("jarvis_wakeword", String(v));
                        }}
                        setView={setView}
                    />
                );
            case "dashboard":
            default:
                return <Dashboard setView={setView} />;
        }
    };

    // En Shell, la Sidebar no aparece y los overlays flotantes tampoco
    // (Shell tiene sus propios indicadores de estado)
    const isShell = view === "shell";

    return (
        <div className="app-layout">
            {!isShell && (
                <Sidebar
                    view={view}
                    setView={setView}
                    doctorErrors={doctorErrors}
                    activeConvId={currentConvId}
                    onSelectConv={handleSelectConversation}
                    onNewChat={handleNewConversation}
                />
            )}

            {renderView()}

            {/* WakeWord GLOBAL — funciona en cualquier vista */}
            <WakeWord
                active={wakeWordEnabled}
                disabled={false}
                onCommand={handleWakeWordCommand}
                onStateChange={setWakeWordState}
                onNavigateToChat={handleNavigateToChat}
            />

            {/* Indicadores flotantes: solo en vistas sin Shell propio */}
            {!isShell && view !== "chat" && wakeWordState !== "idle" && (
                <div style={{
                    position: "fixed", bottom: 24, right: 24, zIndex: 9999,
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 18px", borderRadius: 50,
                    background: wakeWordState === "listening"
                        ? "rgba(239,68,68,0.92)"
                        : "rgba(245,158,11,0.92)",
                    color: "#fff", fontSize: 13, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    animation: "ww-float-in 0.2s ease",
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#fff", animation: "ww-pulse 1s ease-in-out infinite",
                    }} />
                    {wakeWordState === "listening" ? "🎙 Escuchando..." : "⟳ Procesando..."}
                </div>
            )}

            {!isShell && view !== "chat" && wakeWordEnabled && wakeWordState === "idle" && (
                <div
                    onClick={() => {
                        setWakeWordEnabled(false);
                        localStorage.setItem("jarvis_wakeword", "false");
                    }}
                    title="Jarvis escuchando — click para desactivar"
                    style={{
                        position: "fixed", bottom: 24, right: 24, zIndex: 9998,
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 14px", borderRadius: 50,
                        background: "rgba(16,163,127,0.12)",
                        border: "1px solid rgba(16,163,127,0.3)",
                        color: "var(--accent, #10a37f)", fontSize: 12, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                    }}
                >
                    <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#10a37f", animation: "ww-pulse 3s ease-in-out infinite",
                    }} />
                    👂 Jarvis activo
                </div>
            )}

            <style>{`
                @keyframes ww-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                @keyframes ww-float-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

export default App;