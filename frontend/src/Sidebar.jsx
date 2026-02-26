import React from "react";

function Sidebar({ view, setView }) {
    return (
        <div className="sidebar">
            {/* Header / Logo */}
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">⚡</div>
                    <span className="sidebar-logo-text">Jarvis AI</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                <button
                    className={`nav-btn ${view === "chat" ? "active" : ""}`}
                    onClick={() => setView("chat")}
                >
                    <span className="nav-btn-icon">💬</span>
                    <span>Chat</span>
                </button>

                <button
                    className={`nav-btn ${view === "bots" ? "active" : ""}`}
                    onClick={() => setView("bots")}
                >
                    <span className="nav-btn-icon">🤖</span>
                    <span>Bots</span>
                </button>
            </nav>

            <div className="sidebar-divider" />

            <div className="sidebar-section-title">Recientes</div>

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