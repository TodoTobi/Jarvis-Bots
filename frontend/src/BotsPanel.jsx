import React, { useEffect, useState, useCallback } from "react";
import { getBots, activateBot, deactivateBot } from "./api";

const BOT_META = {
    WebBot: {
        icon: "🌐",
        role: "Búsqueda web e IA conversacional",
    },
    DoctorBot: {
        icon: "🩺",
        role: "Diagnóstico y recuperación de errores",
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
        } catch (error) {
            console.error("Failed to load bots:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBots();
        const interval = setInterval(loadBots, 5000);
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
        } catch (error) {
            console.error("Toggle failed:", error);
        } finally {
            setToggling(null);
        }
    };

    const getCardClass = (bot) => {
        let cls = "bot-card";
        if (bot.status === "working") cls += " working";
        else if (bot.status === "error") cls += " error";
        else if (bot.active) cls += " active";
        return cls;
    };

    const getStatusBadgeClass = (bot) => {
        if (bot.status === "working") return "bot-status-badge working";
        if (bot.status === "error") return "bot-status-badge error";
        if (bot.active) return "bot-status-badge active";
        return "bot-status-badge idle";
    };

    const getStatusText = (bot) => {
        if (bot.status === "working") return "Trabajando";
        if (bot.status === "error") return "Error";
        if (bot.active) return "Activo";
        return "Inactivo";
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "Nunca";
        const d = new Date(dateStr);
        return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    };

    if (loading) {
        return (
            <div className="bots-grid">
                <p style={{ color: "var(--text-muted)", padding: "20px" }}>
                    Cargando bots...
                </p>
            </div>
        );
    }

    return (
        <div className="bots-grid">
            {bots.map((bot) => {
                const meta = BOT_META[bot.name] || { icon: "🤖", role: "Bot" };

                return (
                    <div key={bot.name} className={getCardClass(bot)}>
                        <div className="bot-card-header">
                            <div className="bot-card-info">
                                <div className="bot-card-avatar">
                                    {meta.icon}
                                </div>
                                <div>
                                    <div className="bot-card-name">{bot.name}</div>
                                    <div className="bot-card-role">{meta.role}</div>
                                </div>
                            </div>

                            <div className={getStatusBadgeClass(bot)}>
                                <span className="bot-status-dot" />
                                {getStatusText(bot)}
                            </div>
                        </div>

                        {bot.lastError && (
                            <div style={{
                                fontSize: "12px",
                                color: "var(--status-error)",
                                background: "rgba(239, 68, 68, 0.08)",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                marginBottom: "12px"
                            }}>
                                ⚠ {bot.lastError}
                            </div>
                        )}

                        <div className="bot-card-footer">
                            <div className="bot-card-meta">
                                Última ejecución: {formatDate(bot.lastRun)}
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