/**
 * App.jsx — con WakeWord GLOBAL
 * WakeWord se monta aquí (nivel raíz) para funcionar en CUALQUIER vista.
 * Cuando se detecta "jarvis" desde Dashboard/Bots/etc, navega automáticamente
 * a una nueva conversación y envía el comando.
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
import "./App.css";

function App() {
    const [view, setView] = useState("dashboard");
    const [doctorErrors, setDoctorErrors] = useState(0);
    const [currentConvId, setCurrentConvId] = useState(null);
    const [chatKey, setChatKey] = useState(0);

    // Estado del wake word (para el indicador visual global)
    const [wakeWordState, setWakeWordState] = useState("idle");
    const [wakeWordEnabled, setWakeWordEnabled] = useState(
        () => localStorage.getItem("jarvis_wakeword") !== "false"
    );

    // Ref para acceder al sendMessage del Chat sin prop drilling complejo
    // Lo hacemos via un "pendingCommand" que Chat consume al montar/actualizar
    const pendingCommandRef = useRef(null);
    const chatSendRef = useRef(null); // Chat expone su sendMessage aquí

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

    /* ── Navegación a conversación existente ── */
    const handleSelectConversation = useCallback((conv) => {
        const id = typeof conv === "string" ? conv : conv?.id;
        setCurrentConvId(id || null);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    /* ── Nueva conversación ── */
    const handleNewConversation = useCallback(() => {
        setCurrentConvId(null);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    /* ── Comando del WakeWord (global) ──────────────────────────
       Se llama desde cualquier vista cuando el usuario dice "jarvis [cmd]"
       1. Si ya estamos en chat → enviar directamente via chatSendRef
       2. Si estamos en otra vista → guardar comando pendiente + navegar al chat
    ──────────────────────────────────────────────────────────── */
    const handleWakeWordCommand = useCallback((text) => {
        console.log("[App] WakeWord comando recibido:", text);

        if (view === "chat" && chatSendRef.current) {
            // Ya estamos en chat → enviar inmediatamente
            chatSendRef.current(text, { isAudio: true });
        } else {
            // Estamos en otra vista → guardar y navegar
            pendingCommandRef.current = text;
            setCurrentConvId(null);
            setChatKey(k => k + 1);
            setView("chat");
        }
    }, [view]);

    /* ── WakeWord navega al chat ── */
    const handleNavigateToChat = useCallback(() => {
        if (view !== "chat") {
            setCurrentConvId(null);
            setChatKey(k => k + 1);
            setView("chat");
        }
    }, [view]);

    /* ── Chat expone su sendMessage ── */
    const handleChatReady = useCallback((sendFn) => {
        chatSendRef.current = sendFn;
        // Si hay un comando pendiente (vino de otra vista), ejecutarlo
        if (pendingCommandRef.current) {
            const cmd = pendingCommandRef.current;
            pendingCommandRef.current = null;
            // Pequeño delay para que Chat termine de montar
            setTimeout(() => {
                sendFn(cmd, { isAudio: true });
            }, 400);
        }
    }, []);

    const renderView = () => {
        switch (view) {
            case "bots": return <BotsPage />;
            case "devices": return <DevicesPage />;
            case "instructions": return <InstructionsPage />;
            case "settings": return <SettingsPage />;
            case "doctor": return <DoctorPage />;
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
                    />
                );
            case "dashboard":
            default:
                return <Dashboard setView={setView} />;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar
                view={view}
                setView={setView}
                doctorErrors={doctorErrors}
                activeConvId={currentConvId}
                onSelectConv={handleSelectConversation}
                onNewChat={handleNewConversation}
            />

            {renderView()}

            {/* ── WakeWord GLOBAL — funciona en CUALQUIER vista ── */}
            <WakeWord
                active={wakeWordEnabled}
                disabled={false}
                onCommand={handleWakeWordCommand}
                onStateChange={setWakeWordState}
                onNavigateToChat={handleNavigateToChat}
            />

            {/* ── Indicador flotante cuando está escuchando (fuera del chat) ── */}
            {view !== "chat" && wakeWordState !== "idle" && (
                <div style={{
                    position: "fixed",
                    bottom: 24,
                    right: 24,
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 18px",
                    borderRadius: 50,
                    background: wakeWordState === "listening"
                        ? "rgba(239,68,68,0.92)"
                        : "rgba(245,158,11,0.92)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    animation: "ww-float-in 0.2s ease",
                }}>
                    <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#fff",
                        animation: "ww-pulse 1s ease-in-out infinite",
                    }} />
                    {wakeWordState === "listening" ? "🎙 Escuchando..." : "⟳ Procesando..."}
                </div>
            )}

            {/* ── Badge "Jarvis activo" cuando está en idle y habilitado (fuera del chat) ── */}
            {view !== "chat" && wakeWordEnabled && wakeWordState === "idle" && (
                <div
                    onClick={() => {
                        setWakeWordEnabled(false);
                        localStorage.setItem("jarvis_wakeword", "false");
                    }}
                    title="Jarvis escuchando — click para desactivar"
                    style={{
                        position: "fixed",
                        bottom: 24,
                        right: 24,
                        zIndex: 9998,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        borderRadius: 50,
                        background: "rgba(16,163,127,0.12)",
                        border: "1px solid rgba(16,163,127,0.3)",
                        color: "var(--accent, #10a37f)",
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        transition: "all 0.2s",
                    }}
                >
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#10a37f",
                        animation: "ww-pulse 3s ease-in-out infinite",
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