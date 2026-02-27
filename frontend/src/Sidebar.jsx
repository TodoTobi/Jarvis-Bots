/**
 * Sidebar.jsx — v3.0
 * Lee conversaciones guardadas en localStorage y permite navegar entre ellas.
 * Proporciona un callback onSelectConversation(id) para que App.jsx cambie el convId activo.
 */

import React, { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "jarvis_conversations";
const CURRENT_CONV_KEY = "jarvis_current_conv";

function loadConversations() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function saveCurrentId(id) {
    try { localStorage.setItem(CURRENT_CONV_KEY, id); } catch { }
}
function loadCurrentId() {
    return localStorage.getItem(CURRENT_CONV_KEY) || null;
}

export default function Sidebar({ currentConvId, onSelectConversation, onNewConversation }) {
    const [conversations, setConversations] = useState([]);
    const [expanded, setExpanded] = useState(true);

    const refresh = useCallback(() => {
        const convs = loadConversations();
        const sorted = Object.values(convs)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setConversations(sorted);
    }, []);

    // Refresh on mount and every 2 seconds (to pick up changes from Chat.jsx)
    useEffect(() => {
        refresh();
        const t = setInterval(refresh, 2000);
        return () => clearInterval(t);
    }, [refresh]);

    function handleNew() {
        const id = generateId();
        saveCurrentId(id);
        if (onNewConversation) onNewConversation(id);
    }

    function handleSelect(id) {
        saveCurrentId(id);
        if (onSelectConversation) onSelectConversation(id);
    }

    function handleDelete(e, id) {
        e.stopPropagation();
        try {
            const convs = loadConversations();
            delete convs[id];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
            refresh();
            // If deleting the current, open a new one
            if (id === currentConvId) handleNew();
        } catch { }
    }

    function formatTime(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return "ahora";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
        return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    }

    return (
        <div className="sidebar" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "18px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>Jarvis</span>
                </div>
                <button onClick={handleNew}
                    title="Nueva conversación"
                    style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                    +
                </button>
            </div>

            {/* Conversations list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
                {conversations.length === 0 ? (
                    <div style={{ padding: "20px 10px", textAlign: "center", fontSize: 12, color: "var(--text-muted)", opacity: 0.6 }}>
                        Sin conversaciones aún.<br />Escribile algo a Jarvis.
                    </div>
                ) : (
                    conversations.map(conv => {
                        const isActive = conv.id === currentConvId;
                        const msgCount = (conv.messages?.length || 1) - 1;
                        return (
                            <div key={conv.id}
                                onClick={() => handleSelect(conv.id)}
                                style={{
                                    padding: "9px 10px",
                                    borderRadius: 9,
                                    cursor: "pointer",
                                    background: isActive ? "rgba(16,163,127,0.15)" : "transparent",
                                    border: isActive ? "1px solid rgba(16,163,127,0.3)" : "1px solid transparent",
                                    marginBottom: 2,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    transition: "all 0.15s",
                                    position: "relative",
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.querySelector(".del-btn").style.opacity = "1"; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; e.currentTarget.querySelector(".del-btn").style.opacity = "0"; }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: isActive ? "var(--accent)" : "var(--text-primary)", fontWeight: isActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {conv.title || "Nueva conversación"}
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 6 }}>
                                        <span>{msgCount} {msgCount === 1 ? "msg" : "msgs"}</span>
                                        <span>·</span>
                                        <span>{formatTime(conv.updatedAt)}</span>
                                    </div>
                                </div>
                                <button className="del-btn"
                                    onClick={e => handleDelete(e, conv.id)}
                                    style={{ opacity: 0, background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px", borderRadius: 4, transition: "all 0.15s", flexShrink: 0 }}
                                    title="Eliminar conversación"
                                >✕</button>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                {conversations.length} conversaciones guardadas
            </div>
        </div>
    );
}