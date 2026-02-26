import React, { useEffect, useState, useCallback } from "react";
import { getDevices, pingDevice, sendDeviceCommand } from "./api";

const DEVICE_ICONS = {
    android_tv: "📺",
    android_phone: "📱",
    samsung_tv: "🖥",
    lg_tv: "🖥",
    default: "📡"
};

const QUICK_ACTIONS = [
    { label: "YouTube", action: "adb_youtube", icon: "▶", query: "" },
    { label: "Inicio", action: "adb_home", icon: "🏠", query: "" },
    { label: "Volver", action: "adb_back", icon: "↩", query: "" },
    { label: "Despertar", action: "adb_wakeup", icon: "⚡", query: "" },
    { label: "Screenshot", action: "adb_screenshot", icon: "📸", query: "" }
];

function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [pingResults, setPingResults] = useState({});
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState(null);
    const [ytQuery, setYtQuery] = useState({});

    const loadDevices = useCallback(async () => {
        try {
            const data = await getDevices();
            setDevices(data.devices || []);
        } catch (err) {
            console.error("Failed to load devices:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    const handlePing = async (deviceId) => {
        setPingResults(prev => ({ ...prev, [deviceId]: "pinging..." }));
        try {
            const result = await pingDevice(deviceId);
            setPingResults(prev => ({ ...prev, [deviceId]: result.result }));
        } catch (err) {
            setPingResults(prev => ({ ...prev, [deviceId]: "❌ Error" }));
        }
    };

    const handleAction = async (deviceId, action, query = "") => {
        setExecuting(`${deviceId}_${action}`);
        try {
            await sendDeviceCommand(deviceId, action, query);
        } catch (err) {
            console.error(err);
        } finally {
            setExecuting(null);
        }
    };

    if (loading) {
        return (
            <div className="bots-page">
                <div className="bots-header">
                    <h1>📡 Dispositivos</h1>
                    <p>Cargando dispositivos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bots-page">
            <div className="bots-header">
                <h1>📡 Dispositivos en Red</h1>
                <p>Control de TV, celulares y dispositivos en tu red local</p>
            </div>

            {devices.length === 0 ? (
                <div style={{ padding: "32px", color: "var(--text-muted)" }}>
                    <p>No hay dispositivos configurados.</p>
                    <p style={{ marginTop: "8px", fontSize: "13px" }}>
                        Editá <code>backend/config/devices.json</code> y reiniciá el servidor.
                    </p>
                </div>
            ) : (
                <div className="bots-grid">
                    {devices.map(device => (
                        <div key={device.id} className={`bot-card ${device.authorized ? "active" : ""}`}>
                            {/* Header */}
                            <div className="bot-card-header">
                                <div className="bot-card-info">
                                    <div className="bot-card-avatar">
                                        {DEVICE_ICONS[device.type] || DEVICE_ICONS.default}
                                    </div>
                                    <div>
                                        <div className="bot-card-name">{device.name}</div>
                                        <div className="bot-card-role">{device.type} — {device.ip}</div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handlePing(device.id)}
                                    style={{
                                        background: "var(--bg-tertiary)",
                                        border: "1px solid var(--border-base)",
                                        color: "var(--text-secondary)",
                                        borderRadius: "8px",
                                        padding: "6px 12px",
                                        cursor: "pointer",
                                        fontSize: "12px"
                                    }}
                                >
                                    Ping
                                </button>
                            </div>

                            {/* Ping result */}
                            {pingResults[device.id] && (
                                <div style={{
                                    fontSize: "12px",
                                    color: "var(--text-secondary)",
                                    marginBottom: "12px",
                                    padding: "6px 10px",
                                    background: "var(--bg-tertiary)",
                                    borderRadius: "6px"
                                }}>
                                    {pingResults[device.id]}
                                </div>
                            )}

                            {/* YouTube search */}
                            {["android_tv", "android_phone"].includes(device.type) && (
                                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                                    <input
                                        placeholder="Buscar en YouTube..."
                                        value={ytQuery[device.id] || ""}
                                        onChange={e => setYtQuery(prev => ({ ...prev, [device.id]: e.target.value }))}
                                        style={{
                                            flex: 1,
                                            background: "var(--bg-tertiary)",
                                            border: "1px solid var(--border-base)",
                                            borderRadius: "8px",
                                            padding: "8px 12px",
                                            color: "var(--text-primary)",
                                            fontSize: "13px",
                                            outline: "none"
                                        }}
                                    />
                                    <button
                                        onClick={() => handleAction(device.id, "adb_youtube", ytQuery[device.id] || "")}
                                        disabled={executing === `${device.id}_adb_youtube`}
                                        style={{
                                            background: "linear-gradient(135deg, var(--accent-primary), #7c3aed)",
                                            border: "none",
                                            borderRadius: "8px",
                                            color: "#fff",
                                            padding: "8px 14px",
                                            cursor: "pointer",
                                            fontSize: "13px"
                                        }}
                                    >
                                        ▶
                                    </button>
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {QUICK_ACTIONS.filter(a => a.action !== "adb_youtube").map(action => (
                                    <button
                                        key={action.action}
                                        onClick={() => handleAction(device.id, action.action)}
                                        disabled={executing === `${device.id}_${action.action}`}
                                        style={{
                                            background: "var(--bg-tertiary)",
                                            border: "1px solid var(--border-base)",
                                            borderRadius: "8px",
                                            color: "var(--text-secondary)",
                                            padding: "6px 12px",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "4px"
                                        }}
                                    >
                                        {action.icon} {action.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default DevicesPage;