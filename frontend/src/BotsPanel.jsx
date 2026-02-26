import React, { useEffect, useState, useCallback } from "react";
import { getBots, activateBot, deactivateBot } from "./api";

const BOT_META = {
    WebBot: {
        icon: "🌐",
        role: "Conversación general y búsquedas"
    },
    DoctorBot: {
        icon: "🩺",
        role: "Diagnóstico y recuperación de errores"
    },
    BatBot: {
        icon: "⚙️",
        role: "Ejecutor de scripts .bat locales"
    },
    MediaBot: {
        icon: "🎵",
        role: "Control de reproducción multimedia"
    },
    NetBot: {
        icon: "📡",
        role: "Control de dispositivos en red"
    },
    WhatsAppBot: {
        icon: "💬",
        role: "Control remoto vía WhatsApp"
    }
};

function BotsPanel() {
    const [bots, setBots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(null);

    const loadBots = useCallback(async () => {
        try {
            const data = await getBots();
            setBots(data);
        } catch (err) {
            console.error("Failed to load bots:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBots();
        const interval = setInterval(loadBots, 4000);
        return () => clearInterval(interval);
    }, [loadBots]);

    const handleToggle = async (bot) => {
        try {
            setToggling(bot.name);
            if (bot.active) {
                await deactivateBot(bot.name);
            } else {
                await activateBot(bot.name);
            }
            await loadBots();
        } catch (err) {
            console.error("Toggle failed:", err);
        } finally {
            setToggling(null);
        }
    };

    const getCardClass = (bot) => {
        const classes = ["bot-card"];
        if (bot.status === "working") classes.push("working");
        else if (bot.status === "error") classes.push("error");
        else if (bot.active) classes.push("active");
        return classes.join(" ");
    };

    const getBadgeClass = (bot) => {
        if (bot.status === "working") return "bot-status-badge working";
        if (bot.status === "error") return "bot-status-badge error";
        if (bot.active) return "bot-status-badge active";
        return "bot-status-badge idle";
    };

    const getStatusLabel = (bot) => {
        if (bot.status === "working") return "Trabajando";
        if (bot.status === "error") return "Error";
        if (bot.active) return "Activo";
        return "Inactivo";
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "Nunca";
        return new Date(dateStr).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    };

    if (loading) {
        return (
            <div className="bots-grid">
                <p style={{ color: "var(--text-muted)", padding: "20px" }}>Cargando bots...</p>
            </div>
        );
    }

    return (
        <div className="bots-grid">
            {bots.map(bot => {
                const meta = BOT_META[bot.name] || { icon: "🤖", role: "Bot" };

                return (
                    <div key={bot.name} className={getCardClass(bot)}>
                        <div className="bot-card-header">
                            <div className="bot-card-info">
                                <div className="bot-card-avatar">{meta.icon}</div>
                                <div>
                                    <div className="bot-card-name">{bot.name}</div>
                                    <div className="bot-card-role">{bot.description || meta.role}</div>
                                </div>
                            </div>

                            <div className={getBadgeClass(bot)}>
                                <span className="bot-status-dot" />
                                {getStatusLabel(bot)}
                            </div>
                        </div>

                        {bot.lastError && (
                            <div style={{
                                fontSize: "12px",
                                color: "var(--status-error)",
                                background: "rgba(239,68,68,0.08)",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                marginBottom: "12px",
                                lineHeight: 1.5
                            }}>
                                ⚠ {bot.lastError}
                            </div>
                        )}

                        <div className="bot-card-footer">
                            <div className="bot-card-meta">
                                Última ejecución: {formatDate(bot.lastRun)}
                                {bot.runCount > 0 && (
                                    <span style={{ marginLeft: "8px", color: "var(--accent-hover)" }}>
                                        ({bot.runCount} runs)
                                    </span>
                                )}
                            </div>

                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={bot.active}
                                    onChange={() => handleToggle(bot)}
                                    disabled={toggling === bot.name}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default BotsPanel;