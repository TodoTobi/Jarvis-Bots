// Sidebar.jsx
import React from "react";

const NAV_MAIN = [
    { key: "dashboard", icon: "🏠", label: "Dashboard" },
    { key: "chat", icon: "💬", label: "Chat" },
    { key: "bots", icon: "🤖", label: "Bots" },
    { key: "devices", icon: "📡", label: "Dispositivos" },
];

const NAV_CONFIG = [
    { key: "instructions", icon: "📄", label: "Instrucciones" },
    { key: "settings", icon: "⚙️", label: "Configuración" },
];

function NavBtn({ item, active, onClick }) {
    return (
        <button
            className={`nav-btn ${active ? "active" : ""}`}
            onClick={() => onClick(item.key)}
        >
            <span className="nav-btn-icon">{item.icon}</span>
            <span>{item.label}</span>
        </button>
    );
}

function Sidebar({ view, setView }) {
    return (
        <div className="sidebar">
            {/* Logo */}
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">⚡</div>
                    <span className="sidebar-logo-text">Jarvis AI</span>
                </div>
            </div>

            {/* Main nav */}
            <nav className="sidebar-nav">
                {NAV_MAIN.map(item => (
                    <NavBtn key={item.key} item={item} active={view === item.key} onClick={setView} />
                ))}
            </nav>

            <div className="sidebar-divider" />
            <div className="sidebar-section-title">Personalizar</div>

            {/* Config nav */}
            <nav className="sidebar-nav" style={{ flex: "unset" }}>
                {NAV_CONFIG.map(item => (
                    <NavBtn key={item.key} item={item} active={view === item.key} onClick={setView} />
                ))}
            </nav>

            {/* Footer */}
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