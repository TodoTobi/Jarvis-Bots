// === Sidebar.jsx ===
import React from "react";

const NAV_MAIN = [
    { key: "dashboard", icon: "🏠", label: "Dashboard" },
    { key: "chat", icon: "💬", label: "Chat" },
    { key: "bots", icon: "🤖", label: "Bots" },
    { key: "devices", icon: "📡", label: "Dispositivos" },
];

const NAV_TOOLS = [
    { key: "doctor", icon: "🩺", label: "DoctorBot" },
    { key: "instructions", icon: "📄", label: "Instrucciones" },
    { key: "settings", icon: "⚙️", label: "Configuración" },
];

export function Sidebar({ view, setView, doctorErrors = 0 }) {
    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">⚡</div>
                    <span className="sidebar-logo-text">Jarvis AI</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {NAV_MAIN.map(item => (
                    <button key={item.key} className={`nav-btn ${view === item.key ? "active" : ""}`} onClick={() => setView(item.key)}>
                        <span className="nav-btn-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar-divider" />
            <div className="sidebar-section-title">Sistema</div>

            <nav className="sidebar-nav" style={{ flex: "unset" }}>
                {NAV_TOOLS.map(item => (
                    <button key={item.key} className={`nav-btn ${view === item.key ? "active" : ""}`} onClick={() => setView(item.key)}
                        style={{ position: "relative" }}>
                        <span className="nav-btn-icon">{item.icon}</span>
                        <span>{item.label}</span>
                        {/* Error badge on DoctorBot */}
                        {item.key === "doctor" && doctorErrors > 0 && (
                            <span style={{
                                position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                                background: "#ef4444", color: "#fff", borderRadius: "10px",
                                fontSize: "10px", fontWeight: 700, padding: "1px 6px",
                                fontFamily: "'DM Mono', monospace", minWidth: "18px", textAlign: "center"
                            }}>
                                {doctorErrors}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-status">
                    <span className="status-dot" />
                    <span>Sistema activo</span>
                </div>
            </div>
        </div>
    );
}

export default Sidebar;