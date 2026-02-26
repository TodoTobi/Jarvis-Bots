import React from "react";

function Sidebar({ view, setView }) {
    const navItems = [
        { key: "dashboard", icon: "🏠", label: "Dashboard" },
        { key: "chat", icon: "💬", label: "Chat" },
        { key: "bots", icon: "🤖", label: "Bots" },
        { key: "devices", icon: "📡", label: "Dispositivos" }
    ];

    return (
        <div className="sidebar">
            {/* Logo */}
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">⚡</div>
                    <span className="sidebar-logo-text">Jarvis AI</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <button
                        key={item.key}
                        className={`nav-btn ${view === item.key ? "active" : ""}`}
                        onClick={() => setView(item.key)}
                    >
                        <span className="nav-btn-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar-divider" />
            <div className="sidebar-section-title">Sistema</div>

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