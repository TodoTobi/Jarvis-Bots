import React, { useEffect, useState, useCallback } from "react";
import { getBots, activateBot, deactivateBot } from "./api";

const BOT_META = {
    WebBot: { icon: "🌐", color: "#10a37f" },
    DoctorBot: { icon: "🩺", color: "#6366f1" },
    BatBot: { icon: "⚙️", color: "#f59e0b" },
    MediaBot: { icon: "🎵", color: "#ec4899" },
    NetBot: { icon: "📡", color: "#3b82f6" },
    WhatsAppBot: { icon: "💬", color: "#25d366" }
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

function StatCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: "12px", padding: "20px 24px",
            borderTop: `3px solid ${color}`
        }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>{label}</div>
            {sub && <div style={{ fontSize: "11px", color, marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>{sub}</div>}
        </div>
    );
}

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
            const res = await fetch("http://localhost:3001/api/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: cmd })
            });
            const data = await res.json();
            setCmdFeedback(p => ({ ...p, [key]: data.success !== false ? "ok" : "error" }));
        } catch {
            setCmdFeedback(p => ({ ...p, [key]: "error" }));
        }
        setTimeout(() => setCmdFeedback(p => { const n = { ...p }; delete n[key]; return n; }), 2000);
    };

    const active = bots.filter(b => b.active).length;
    const errors = bots.filter(b => b.status === "error").length;
    const working = bots.filter(b => b.status === "working").length;
    const totalRuns = bots.reduce((s, b) => s + (b.runCount || 0), 0);

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflowY: "auto" }}>
            {/* Header */}
            <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                            ⚡ Dashboard
                        </h1>
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                            Overview del sistema JarvisCore
                        </p>
                    </div>
                    <button onClick={() => setView("chat")} style={{
                        background: "var(--accent)", color: "#fff", border: "none",
                        borderRadius: "10px", padding: "10px 20px", cursor: "pointer",
                        fontSize: "14px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                        display: "flex", alignItems: "center", gap: "8px"
                    }}>
                        💬 Abrir Chat
                    </button>
                </div>
            </div>

            <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "28px" }}>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                    <StatCard label="Bots Activos" value={`${active}/${bots.length}`} sub="en línea" color="#19c37d" />
                    <StatCard label="Ejecutando" value={working} sub={working > 0 ? "en proceso" : "idle"} color="#10a37f" />
                    <StatCard label="Errores" value={errors} sub={errors > 0 ? "revisar logs" : "sistema OK"} color={errors > 0 ? "#ef4444" : "#6b7280"} />
                    <StatCard label="Ejecuciones" value={totalRuns} sub="total desde inicio" color="#6366f1" />
                </div>

                {/* Quick commands */}
                <div>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "12px", letterSpacing: "0.03em", textTransform: "uppercase", fontSize: "11px" }}>
                        COMANDOS RÁPIDOS
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
                        {QUICK_COMMANDS.map((q) => {
                            const fb = cmdFeedback[q.label];
                            return (
                                <button key={q.label} onClick={() => handleQuickCmd(q.cmd, q.label)}
                                    style={{
                                        background: fb === "ok" ? "rgba(25,195,125,0.15)" : fb === "error" ? "rgba(239,68,68,0.12)" : fb === "sending" ? "rgba(16,163,127,0.1)" : "var(--card-bg)",
                                        border: `1px solid ${fb === "ok" ? "rgba(25,195,125,0.4)" : fb === "error" ? "rgba(239,68,68,0.3)" : "var(--card-border)"}`,
                                        borderRadius: "10px", padding: "12px 14px", cursor: fb === "sending" ? "wait" : "pointer",
                                        color: fb === "ok" ? "#19c37d" : fb === "error" ? "#ef4444" : "var(--text-primary)",
                                        fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 500,
                                        textAlign: "left", transition: "all 0.15s ease",
                                        display: "flex", alignItems: "center", gap: "8px"
                                    }}>
                                    <span>{fb === "ok" ? "✓" : fb === "error" ? "✕" : q.icon}</span>
                                    {q.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Bots grid */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                        <h2 style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                            ESTADO DE BOTS
                        </h2>
                        <button onClick={() => setView("bots")} style={{
                            background: "transparent", border: "none", color: "var(--accent)",
                            cursor: "pointer", fontSize: "12px", fontFamily: "'DM Sans', sans-serif"
                        }}>
                            Ver todos →
                        </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
                        {bots.map(bot => {
                            const meta = BOT_META[bot.name] || { icon: "🤖", color: "#6b7280" };
                            const statusColor = bot.status === "error" ? "#ef4444" : bot.status === "working" ? "#10a37f" : bot.active ? "#19c37d" : "#4b5563";
                            return (
                                <div key={bot.name} style={{
                                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                                    borderRadius: "12px", padding: "14px 16px",
                                    display: "flex", alignItems: "center", gap: "12px",
                                    borderLeft: `3px solid ${statusColor}`
                                }}>
                                    <span style={{ fontSize: "22px" }}>{meta.icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{bot.name}</div>
                                        <div style={{ fontSize: "11px", color: statusColor, marginTop: "2px", fontFamily: "'DM Mono', monospace" }}>
                                            {bot.status === "working" ? "● trabajando" : bot.status === "error" ? "● error" : bot.active ? "● activo" : "○ inactivo"}
                                        </div>
                                    </div>
                                    <label style={{ position: "relative", width: "36px", height: "20px", cursor: "pointer", flexShrink: 0 }}>
                                        <input type="checkbox" checked={bot.active} onChange={() => handleToggle(bot)}
                                            disabled={toggling === bot.name}
                                            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
                                        <span style={{
                                            position: "absolute", inset: 0,
                                            background: bot.active ? "rgba(16,163,127,0.3)" : "rgba(255,255,255,0.08)",
                                            border: `1px solid ${bot.active ? "rgba(16,163,127,0.5)" : "rgba(255,255,255,0.1)"}`,
                                            borderRadius: "100px", transition: "all 0.2s"
                                        }} />
                                        <span style={{
                                            position: "absolute", width: "14px", height: "14px",
                                            bottom: "2px", left: bot.active ? "19px" : "2px",
                                            background: bot.active ? "var(--accent)" : "#6b7280",
                                            borderRadius: "50%", transition: "all 0.2s"
                                        }} />
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* System info */}
                <div style={{
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    borderRadius: "12px", padding: "16px 20px"
                }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "12px" }}>
                        INFO DEL SISTEMA
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                        {[
                            { label: "Backend", value: "localhost:3001", ok: true },
                            { label: "LM Studio", value: "100.117.165.109:1234", ok: active > 0 },
                            { label: "Modelo", value: "LLaMA 13B", ok: true }
                        ].map(item => (
                            <div key={item.label}>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{item.label}</div>
                                <div style={{ fontSize: "13px", color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", marginTop: "3px" }}>
                                    <span style={{ color: item.ok ? "#19c37d" : "#ef4444", marginRight: "6px" }}>●</span>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Dashboard;