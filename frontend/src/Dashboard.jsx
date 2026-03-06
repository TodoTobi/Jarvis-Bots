import React, { useEffect, useState, useCallback, useRef } from "react";
import { getBots, activateBot, deactivateBot } from "./api";

const API_BASE = "http://localhost:3001";

const BOT_META = {
    WebBot: { icon: "🌐", color: "#10a37f" },
    DoctorBot: { icon: "🩺", color: "#6366f1" },
    BatBot: { icon: "⚙️", color: "#f59e0b" },
    MediaBot: { icon: "🎵", color: "#ec4899" },
    NetBot: { icon: "📡", color: "#3b82f6" },
    WhatsAppBot: { icon: "💬", color: "#25d366" },
    DriveBot: { icon: "📁", color: "#f59e0b" },
    ComputerBot: { icon: "🖥️", color: "#8b5cf6" },
    VisionBot: { icon: "👁️", color: "#06b6d4" },
    SearchBot: { icon: "🔍", color: "#10a37f" },
    GoogleDocsBot: { icon: "📄", color: "#4285f4" },
};

const QUICK_COMMANDS = [
    { label: "Subir volumen", cmd: "subi el volumen", icon: "🔊" },
    { label: "Bajar volumen", cmd: "baja el volumen", icon: "🔉" },
    { label: "Pausar música", cmd: "pausá la música", icon: "⏸" },
    { label: "YouTube PC", cmd: "abrí youtube", icon: "▶" },
    { label: "Bloquear PC", cmd: "bloqueá la pantalla", icon: "🔒" },
    { label: "Screenshot", cmd: "tomá una captura", icon: "📸" },
    { label: "Discord", cmd: "abrí discord", icon: "🎮" },
    { label: "Modo nocturno", cmd: "activá el modo nocturno", icon: "🌙" },
];

// Comandos de reinicio — usan endpoint directo, no /api/chat
const RESTART_COMMANDS = [
    {
        label: "Reiniciar Backend",
        icon: "🔄",
        action: "backend",
        endpoint: "/api/system/restart-backend",
        color: "#f59e0b",
        desc: "Reinicia el servidor Node.js",
    },
    {
        label: "Reiniciar Frontend",
        icon: "⚡",
        action: "frontend",
        endpoint: "/api/system/restart-frontend",
        color: "#6366f1",
        desc: "Reinicia Vite / React dev server",
    },
];

/* ══════════════════════════════════════════
   LOGO COMPONENT — marca animada de Jarvis
══════════════════════════════════════════ */
function JarvisLogo() {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 2000);
        return () => clearInterval(iv);
    }, []);

    return (
        <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "flex-start", gap: 4,
            padding: "28px 32px 20px",
        }}>
            {/* Logo mark */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                    position: "relative",
                    width: 52, height: 52,
                }}>
                    {/* Outer ring pulse */}
                    <div style={{
                        position: "absolute", inset: -4,
                        borderRadius: "50%",
                        border: "1.5px solid rgba(16,163,127,0.25)",
                        animation: "logoRingPulse 3s ease-in-out infinite",
                    }} />
                    {/* Core circle */}
                    <div style={{
                        width: 52, height: 52, borderRadius: "50%",
                        background: "linear-gradient(135deg, #0d8a6a 0%, #10a37f 50%, #19c37d 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 24px rgba(16,163,127,0.35), 0 0 8px rgba(16,163,127,0.2)",
                        position: "relative", zIndex: 1,
                    }}>
                        <span style={{ fontSize: 24, filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.4))" }}>⚡</span>
                    </div>
                    {/* Orbiting dot */}
                    <div style={{
                        position: "absolute",
                        top: "50%", left: "50%",
                        width: 7, height: 7,
                        borderRadius: "50%",
                        background: "#19c37d",
                        boxShadow: "0 0 6px #19c37d",
                        transform: "translate(-50%, -50%)",
                        animation: "orbitDot 4s linear infinite",
                        transformOrigin: "50% 50%",
                    }} />
                </div>

                <div>
                    <div style={{
                        fontSize: 28, fontWeight: 800,
                        color: "#ececec", letterSpacing: "-0.04em",
                        lineHeight: 1,
                        fontFamily: "'DM Sans', sans-serif",
                    }}>
                        Jarvis
                        <span style={{ color: "#10a37f", marginLeft: 3 }}>AI</span>
                    </div>
                    <div style={{
                        fontSize: 12, color: "#616161",
                        fontFamily: "'DM Mono', monospace",
                        marginTop: 3, letterSpacing: "0.04em",
                    }}>
                        JARVISCORE v2.0 · {new Date().toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════
   SYSTEM HEALTH CARD
══════════════════════════════════════════ */
function SystemHealthCard({ bots }) {
    const [checks, setChecks] = useState({
        backend: { status: "checking", label: "Backend", detail: "localhost:3001" },
        lmstudio: { status: "checking", label: "LM Studio", detail: "Modelo IA" },
        whatsapp: { status: "checking", label: "WhatsApp", detail: "Bot desconectado", phone: null, canSend: false },
        supabase: { status: "checking", label: "Supabase", detail: "Historial" },
    });
    const [lastCheck, setLastCheck] = useState(null);
    const intervalRef = useRef(null);

    const runChecks = useCallback(async () => {
        const next = { ...checks };

        // ── Backend ──
        try {
            const t0 = Date.now();
            const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
            const ms = Date.now() - t0;
            if (res.ok) {
                next.backend = { status: "ok", label: "Backend", detail: `localhost:3001 · ${ms}ms` };
            } else {
                next.backend = { status: "error", label: "Backend", detail: `HTTP ${res.status}` };
            }
        } catch {
            next.backend = { status: "error", label: "Backend", detail: "Sin conexión" };
        }

        // ── LM Studio (solo si backend está OK) ──
        if (next.backend.status === "ok") {
            try {
                const res = await fetch(`${API_BASE}/api/health/model`, { signal: AbortSignal.timeout(4000) });
                const data = await res.json();
                if (data.ok || data.connected) {
                    next.lmstudio = { status: "ok", label: "LM Studio", detail: data.model || "Modelo activo" };
                } else {
                    next.lmstudio = { status: "warn", label: "LM Studio", detail: data.error || "No disponible" };
                }
            } catch {
                next.lmstudio = { status: "warn", label: "LM Studio", detail: "No accesible" };
            }
        } else {
            next.lmstudio = { status: "error", label: "LM Studio", detail: "Backend caído" };
        }

        // ── WhatsApp ──
        try {
            const res = await fetch(`${API_BASE}/api/whatsapp/qr`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();

            if (data.status === "connected" || (!data.available && data.phone)) {
                // Conectado — verificar si puede mandar mensajes
                const phone = data.phone || null;
                let canSend = false;
                try {
                    const testRes = await fetch(`${API_BASE}/api/whatsapp/status`, { signal: AbortSignal.timeout(2000) });
                    const testData = await testRes.json();
                    canSend = testData.canSend === true || testData.ready === true || testData.connected === true;
                } catch {
                    canSend = true; // asumimos que si está conectado puede enviar
                }
                next.whatsapp = {
                    status: "ok", label: "WhatsApp",
                    detail: `+${phone || "conectado"} · ${canSend ? "puede enviar ✓" : "conectado"}`,
                    phone, canSend,
                };
            } else if (data.available && data.qr) {
                next.whatsapp = { status: "warn", label: "WhatsApp", detail: "Esperando escaneo QR", phone: null, canSend: false };
            } else if (data.status === "connecting") {
                next.whatsapp = { status: "warn", label: "WhatsApp", detail: "Conectando...", phone: null, canSend: false };
            } else {
                // Comprobar si el bot está activo pero no conectado
                const waBot = bots.find(b => b.name === "WhatsAppBot");
                if (!waBot?.active) {
                    next.whatsapp = { status: "idle", label: "WhatsApp", detail: "Bot inactivo", phone: null, canSend: false };
                } else {
                    next.whatsapp = { status: "warn", label: "WhatsApp", detail: "Desconectado", phone: null, canSend: false };
                }
            }
        } catch {
            next.whatsapp = { status: "error", label: "WhatsApp", detail: "Error al verificar", phone: null, canSend: false };
        }

        // ── Supabase ──
        try {
            const res = await fetch(`${API_BASE}/api/history/status`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            next.supabase = {
                status: data.connected ? "ok" : "warn",
                label: "Supabase",
                detail: data.connected ? "Historial activo" : "Sin conexión",
            };
        } catch {
            next.supabase = { status: "warn", label: "Supabase", detail: "No configurado" };
        }

        setChecks(next);
        setLastCheck(new Date());
    }, [bots]);

    useEffect(() => {
        runChecks();
        intervalRef.current = setInterval(runChecks, 15000);
        return () => clearInterval(intervalRef.current);
    }, [runChecks]);

    const STATUS_CFG = {
        ok:       { color: "#19c37d", bg: "rgba(25,195,125,0.1)",  border: "rgba(25,195,125,0.25)", dot: "ok",      icon: "●" },
        warn:     { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)",  dot: "warn",    icon: "◐" },
        error:    { color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",   dot: "error",   icon: "●" },
        checking: { color: "#6b7280", bg: "rgba(107,114,128,0.06)", border: "rgba(107,114,128,0.15)", dot: "checking", icon: "○" },
        idle:     { color: "#4b5563", bg: "rgba(75,85,99,0.06)",   border: "rgba(75,85,99,0.15)",   dot: "idle",    icon: "○" },
    };

    const CHECK_ICONS = {
        backend: "🖥️",
        lmstudio: "🧠",
        whatsapp: "💬",
        supabase: "🗄️",
    };

    const allOk = Object.values(checks).every(c => c.status === "ok" || c.status === "checking");
    const hasError = Object.values(checks).some(c => c.status === "error");

    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: 14, overflow: "hidden",
            borderTop: `3px solid ${hasError ? "#ef4444" : allOk ? "#19c37d" : "#f59e0b"}`,
        }}>
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px 10px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>🩺</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        Estado del Sistema
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {lastCheck && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
                            {lastCheck.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                    )}
                    <button
                        onClick={runChecks}
                        title="Verificar ahora"
                        style={{
                            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                            color: "var(--text-muted)", fontSize: 11,
                            fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    >
                        ↻ Verificar
                    </button>
                </div>
            </div>

            {/* Checks grid */}
            <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: 1, background: "rgba(255,255,255,0.04)",
            }}>
                {Object.entries(checks).map(([key, check]) => {
                    const cfg = STATUS_CFG[check.status] || STATUS_CFG.checking;
                    const isChecking = check.status === "checking";
                    return (
                        <div key={key} style={{
                            background: "var(--card-bg)",
                            padding: "14px 16px",
                            display: "flex", alignItems: "flex-start", gap: 10,
                            position: "relative", overflow: "hidden",
                        }}>
                            {/* Accent left bar */}
                            <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: 3, background: cfg.color, opacity: 0.7,
                            }} />

                            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>
                                {CHECK_ICONS[key]}
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                    <span style={{
                                        fontSize: 12, color: cfg.color,
                                        animation: isChecking ? "spin 1.5s linear infinite" : "none",
                                        display: "inline-block",
                                        fontFamily: isChecking ? "'DM Mono', monospace" : "inherit",
                                    }}>
                                        {isChecking ? "⟳" : cfg.icon}
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                                        {check.label}
                                    </span>

                                    {/* WhatsApp "puede mandar" badge */}
                                    {key === "whatsapp" && check.canSend && (
                                        <span style={{
                                            fontSize: 10, padding: "1px 6px",
                                            background: "rgba(25,195,125,0.15)",
                                            border: "1px solid rgba(25,195,125,0.3)",
                                            borderRadius: 10, color: "#19c37d",
                                            fontFamily: "'DM Mono', monospace", fontWeight: 600,
                                        }}>
                                            ACTIVO
                                        </span>
                                    )}
                                </div>

                                <div style={{
                                    fontSize: 11, color: "var(--text-muted)",
                                    fontFamily: "'DM Mono', monospace",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {isChecking ? "verificando..." : check.detail}
                                </div>

                                {/* WhatsApp — info extra */}
                                {key === "whatsapp" && check.phone && (
                                    <div style={{
                                        marginTop: 5, fontSize: 11,
                                        color: "#19c37d", fontFamily: "'DM Mono', monospace",
                                    }}>
                                        📱 Podés mandar "jarvis [comando]"
                                    </div>
                                )}
                                {key === "whatsapp" && !check.phone && check.status !== "checking" && check.status !== "ok" && (
                                    <div style={{
                                        marginTop: 5, fontSize: 11, color: "#616161",
                                    }}>
                                        Activá WhatsAppBot → Configuración
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* WhatsApp comandos de ejemplo (si está conectado) */}
            {checks.whatsapp.status === "ok" && checks.whatsapp.phone && (
                <div style={{
                    padding: "12px 16px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(37,211,102,0.04)",
                }}>
                    <div style={{ fontSize: 11, color: "#9b9b9b", marginBottom: 6, fontWeight: 500 }}>
                        💬 Comandos vía WhatsApp:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {[
                            "jarvis, abrí youtube",
                            "jarvis, pausá la música",
                            "jarvis, pasame tarea.pdf al drive",
                            "jarvis, qué hora es",
                        ].map(cmd => (
                            <span key={cmd} style={{
                                fontSize: 11, padding: "3px 9px",
                                background: "rgba(37,211,102,0.08)",
                                border: "1px solid rgba(37,211,102,0.15)",
                                borderRadius: 20, color: "#19c37d",
                                fontFamily: "'DM Mono', monospace",
                            }}>
                                {cmd}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ══════════════════════════════════════════
   STAT CARD
══════════════════════════════════════════ */
function StatCard({ label, value, sub, color, icon }) {
    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: 14, padding: "18px 20px",
            borderTop: `3px solid ${color}`,
            display: "flex", flexDirection: "column", gap: 2,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
                    {label}
                </span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: 11, color, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                    {sub}
                </div>
            )}
        </div>
    );
}

/* ══════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════ */
function Dashboard({ setView }) {
    const [bots, setBots] = useState([]);
    const [toggling, setToggling] = useState(null);
    const [cmdFeedback, setCmdFeedback] = useState({});

    const loadBots = useCallback(async () => {
        try { setBots(await getBots()); } catch { }
    }, []);

    useEffect(() => {
        loadBots();
        const iv = setInterval(loadBots, 5000);
        return () => clearInterval(iv);
    }, [loadBots]);

    const handleToggle = async (bot) => {
        setToggling(bot.name);
        try {
            if (bot.active) await deactivateBot(bot.name);
            else await activateBot(bot.name);
            await loadBots();
        } finally { setToggling(null); }
    };

    const handleQuickCmd = async (cmd, key) => {
        setCmdFeedback(p => ({ ...p, [key]: "sending" }));
        try {
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: cmd }),
            });
            const data = await res.json();
            setCmdFeedback(p => ({ ...p, [key]: data.success !== false ? "ok" : "error" }));
        } catch {
            setCmdFeedback(p => ({ ...p, [key]: "error" }));
        }
        setTimeout(() => setCmdFeedback(p => { const n = { ...p }; delete n[key]; return n; }), 2000);
    };

    const handleRestart = async (endpoint, key) => {
        // Confirmar antes de reiniciar
        const target = key === "backend" ? "el backend" : "el frontend";
        if (!window.confirm(`¿Reiniciar ${target}? El servicio se caerá brevemente.`)) return;

        setCmdFeedback(p => ({ ...p, [key]: "sending" }));
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST" });
            const data = await res.json();
            if (data.ok) {
                setCmdFeedback(p => ({ ...p, [key]: "ok" }));
                // Si fue backend, mostrar countdown de reconexión
                if (key === "backend") {
                    let secs = 5;
                    const iv = setInterval(() => {
                        secs--; 
                        if (secs <= 0) {
                            clearInterval(iv);
                            // Intentar recargar health check
                            loadBots();
                            setCmdFeedback(p => { const n = { ...p }; delete n[key]; return n; });
                        }
                    }, 1000);
                }
            } else {
                setCmdFeedback(p => ({ ...p, [key]: "error" }));
            }
        } catch {
            // El backend se cayó (esperado al reiniciar)
            setCmdFeedback(p => ({ ...p, [key]: "ok" }));
        }
        setTimeout(() => setCmdFeedback(p => { const n = { ...p }; delete n[key]; return n; }), 8000);
    };

    const active = bots.filter(b => b.active).length;
    const errors = bots.filter(b => b.status === "error").length;
    const working = bots.filter(b => b.status === "working").length;
    const totalRuns = bots.reduce((s, b) => s + (b.runCount || 0), 0);

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflowY: "auto" }}>

            <style>{`
                @keyframes logoRingPulse {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.06); }
                }
                @keyframes orbitDot {
                    0%   { transform: translate(calc(-50% + 32px), -50%) scale(1); opacity: 1; }
                    25%  { transform: translate(-50%, calc(-50% + 32px)) scale(0.6); opacity: 0.5; }
                    50%  { transform: translate(calc(-50% - 32px), -50%) scale(1); opacity: 1; }
                    75%  { transform: translate(-50%, calc(-50% - 32px)) scale(0.6); opacity: 0.5; }
                    100% { transform: translate(calc(-50% + 32px), -50%) scale(1); opacity: 1; }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>

            {/* ── Logo header ── */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px 20px" }}>
                    <JarvisLogo />
                    <button onClick={() => setView("chat")} style={{
                        background: "var(--accent)", color: "#fff", border: "none",
                        borderRadius: 10, padding: "10px 22px", cursor: "pointer",
                        fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                        display: "flex", alignItems: "center", gap: 8,
                        boxShadow: "0 2px 12px rgba(16,163,127,0.3)",
                        transition: "all 0.15s",
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#0d9270"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.transform = "none"; }}
                    >
                        💬 Abrir Chat
                    </button>
                </div>
            </div>

            <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>

                {/* ── Stats ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                    <StatCard label="Bots Activos" value={`${active}/${bots.length}`} sub="en línea" color="#19c37d" icon="🤖" />
                    <StatCard label="Ejecutando" value={working} sub={working > 0 ? "en proceso" : "idle"} color="#10a37f" icon="⚡" />
                    <StatCard label="Errores" value={errors} sub={errors > 0 ? "revisar logs" : "sistema OK"} color={errors > 0 ? "#ef4444" : "#6b7280"} icon="🩺" />
                    <StatCard label="Ejecuciones" value={totalRuns} sub="total sesión" color="#6366f1" icon="📊" />
                </div>

                {/* ── System Health ── */}
                <SystemHealthCard bots={bots} />

                {/* ── Quick commands ── */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        COMANDOS RÁPIDOS
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                        {QUICK_COMMANDS.map((q) => {
                            const fb = cmdFeedback[q.label];
                            return (
                                <button key={q.label} onClick={() => handleQuickCmd(q.cmd, q.label)}
                                    style={{
                                        background: fb === "ok" ? "rgba(25,195,125,0.15)" : fb === "error" ? "rgba(239,68,68,0.12)" : fb === "sending" ? "rgba(16,163,127,0.1)" : "var(--card-bg)",
                                        border: `1px solid ${fb === "ok" ? "rgba(25,195,125,0.4)" : fb === "error" ? "rgba(239,68,68,0.3)" : "var(--card-border)"}`,
                                        borderRadius: 10, padding: "11px 14px", cursor: fb === "sending" ? "wait" : "pointer",
                                        color: fb === "ok" ? "#19c37d" : fb === "error" ? "#ef4444" : "var(--text-primary)",
                                        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
                                        textAlign: "left", transition: "all 0.15s ease",
                                        display: "flex", alignItems: "center", gap: 8,
                                    }}
                                    onMouseEnter={e => { if (!fb) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; } }}
                                    onMouseLeave={e => { if (!fb) { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.background = "var(--card-bg)"; } }}
                                >
                                    <span>{fb === "ok" ? "✓" : fb === "error" ? "✕" : q.icon}</span>
                                    {q.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Reiniciar servicios ── */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        REINICIAR SERVICIOS
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                        {RESTART_COMMANDS.map((r) => {
                            const fb = cmdFeedback[r.action];
                            const isSending = fb === "sending";
                            const isOk = fb === "ok";
                            const isError = fb === "error";
                            return (
                                <button key={r.action}
                                    onClick={() => handleRestart(r.endpoint, r.action)}
                                    disabled={isSending}
                                    title={r.desc}
                                    style={{
                                        background: isOk ? "rgba(25,195,125,0.1)" : isError ? "rgba(239,68,68,0.1)" : isSending ? `rgba(${r.action==="backend"?"245,158,11":"99,102,241"},0.1)` : "var(--card-bg)",
                                        border: `1px solid ${isOk ? "rgba(25,195,125,0.4)" : isError ? "rgba(239,68,68,0.3)" : isSending ? `rgba(${r.action==="backend"?"245,158,11":"99,102,241"},0.4)` : "var(--card-border)"}`,
                                        borderLeft: `3px solid ${isOk ? "#19c37d" : isError ? "#ef4444" : r.color}`,
                                        borderRadius: 10, padding: "13px 16px",
                                        cursor: isSending ? "wait" : "pointer",
                                        color: isOk ? "#19c37d" : isError ? "#ef4444" : "var(--text-primary)",
                                        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
                                        textAlign: "left", transition: "all 0.2s ease",
                                        display: "flex", alignItems: "center", gap: 10,
                                        opacity: isSending ? 0.7 : 1,
                                    }}
                                    onMouseEnter={e => { if (!isSending) e.currentTarget.style.background = `rgba(${r.action==="backend"?"245,158,11":"99,102,241"},0.08)`; }}
                                    onMouseLeave={e => { if (!isSending) e.currentTarget.style.background = "var(--card-bg)"; }}
                                >
                                    <span style={{ fontSize: 18, animation: isSending ? "spin 1s linear infinite" : "none", display: "inline-block" }}>
                                        {isSending ? "⟳" : isOk ? "✓" : isError ? "✕" : r.icon}
                                    </span>
                                    <div>
                                        <div>{r.label}</div>
                                        {isSending && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Reiniciando...</div>}
                                        {isOk && <div style={{ fontSize: 11, color: "#19c37d", marginTop: 2 }}>Listo ✓</div>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Bots grid ── */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            ESTADO DE BOTS
                        </div>
                        <button onClick={() => setView("bots")} style={{
                            background: "transparent", border: "none", color: "var(--accent)",
                            cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                        }}>
                            Ver todos →
                        </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                        {bots.map(bot => {
                            const meta = BOT_META[bot.name] || { icon: "🤖", color: "#6b7280" };
                            const statusColor = bot.status === "error" ? "#ef4444" : bot.status === "working" ? "#10a37f" : bot.active ? "#19c37d" : "#4b5563";
                            return (
                                <div key={bot.name} style={{
                                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                                    borderRadius: 12, padding: "12px 14px",
                                    display: "flex", alignItems: "center", gap: 12,
                                    borderLeft: `3px solid ${statusColor}`,
                                    transition: "border-color 0.3s",
                                }}>
                                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{bot.name}</div>
                                        <div style={{ fontSize: 11, color: statusColor, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                                            {bot.status === "working" ? "● trabajando" : bot.status === "error" ? "● error" : bot.active ? "● activo" : "○ inactivo"}
                                        </div>
                                    </div>
                                    <label style={{ position: "relative", width: 36, height: 20, cursor: "pointer", flexShrink: 0 }}>
                                        <input type="checkbox" checked={bot.active} onChange={() => handleToggle(bot)}
                                            disabled={toggling === bot.name}
                                            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
                                        <span style={{
                                            position: "absolute", inset: 0,
                                            background: bot.active ? "rgba(16,163,127,0.3)" : "rgba(255,255,255,0.08)",
                                            border: `1px solid ${bot.active ? "rgba(16,163,127,0.5)" : "rgba(255,255,255,0.1)"}`,
                                            borderRadius: 100, transition: "all 0.2s",
                                        }} />
                                        <span style={{
                                            position: "absolute", width: 14, height: 14,
                                            bottom: 2, left: bot.active ? 19 : 2,
                                            background: bot.active ? "var(--accent)" : "#6b7280",
                                            borderRadius: "50%", transition: "all 0.2s",
                                        }} />
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Dashboard;