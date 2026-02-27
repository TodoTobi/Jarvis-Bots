// === Sidebar.jsx — ChatGPT-style with history + projects ===
import React, { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:3001/api";

const NAV_MAIN = [
    { key: "dashboard", icon: "🏠", label: "Dashboard" },
    { key: "bots", icon: "🤖", label: "Bots" },
    { key: "devices", icon: "📡", label: "Dispositivos" },
];

const NAV_SYSTEM = [
    { key: "doctor", icon: "🩺", label: "DoctorBot" },
    { key: "instructions", icon: "📄", label: "Instrucciones" },
    { key: "settings", icon: "⚙️", label: "Configuración" },
];

/* ── Date grouping ── */
function getDateGroup(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays <= 7) return "Últimos 7 días";
    if (diffDays <= 30) return "Últimos 30 días";
    return "Anteriores";
}

const DATE_GROUP_ORDER = ["Hoy", "Ayer", "Últimos 7 días", "Últimos 30 días", "Anteriores"];

/* ── Project dot color ── */
function ProjectDot({ color }) {
    return (
        <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: color || "#10a37f", flexShrink: 0, display: "inline-block"
        }} />
    );
}

/* ── Conversation item ── */
function ConvItem({ conv, active, onSelect, onRename, onDelete }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(conv.title);
    const inputRef = useRef(null);

    const startEdit = (e) => {
        e.stopPropagation();
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const commitEdit = () => {
        setEditing(false);
        if (val.trim() && val.trim() !== conv.title) {
            onRename(conv.id, val.trim());
        } else {
            setVal(conv.title);
        }
    };

    return (
        <div
            onClick={() => onSelect(conv)}
            onDoubleClick={startEdit}
            style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 10px", borderRadius: 8,
                background: active ? "rgba(255,255,255,0.1)" : "transparent",
                cursor: "pointer", position: "relative", group: true,
                transition: "background 0.12s"
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
        >
            {editing ? (
                <input
                    ref={inputRef}
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setEditing(false); setVal(conv.title); } }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 5, padding: "2px 6px", color: "#fff", fontSize: 13,
                        fontFamily: "'DM Sans', sans-serif", outline: "none"
                    }}
                />
            ) : (
                <span style={{
                    flex: 1, fontSize: 13, color: active ? "#ececec" : "#9b9b9b",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    lineHeight: "1.4"
                }}>
                    {conv.title}
                </span>
            )}
            <button
                onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                style={{
                    background: "none", border: "none", color: "#616161", cursor: "pointer",
                    fontSize: 13, padding: "0 2px", flexShrink: 0,
                    opacity: 0, transition: "opacity 0.12s"
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                onMouseLeave={e => e.currentTarget.style.opacity = "0"}
                onMouseEnterCapture={e => e.currentTarget.parentElement?.querySelector("button")?.style.setProperty("opacity", "1")}
                className="conv-delete-btn"
            >
                ×
            </button>
        </div>
    );
}

/* ── Project item (draggable) ── */
function ProjectItem({ project, open, onToggle, onRename, onDelete, onDragStart, onDragOver, onDrop }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(project.name);
    const inputRef = useRef(null);

    const startEdit = (e) => {
        e.stopPropagation();
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const commitEdit = () => {
        setEditing(false);
        if (val.trim() && val.trim() !== project.name) onRename(project.id, val.trim());
        else setVal(project.name);
    };

    return (
        <div
            draggable
            onDragStart={() => onDragStart(project.id)}
            onDragOver={e => { e.preventDefault(); onDragOver(project.id); }}
            onDrop={() => onDrop(project.id)}
            style={{ cursor: "grab" }}
        >
            <div
                onClick={() => onToggle(project.id)}
                onDoubleClick={startEdit}
                style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: 8,
                    cursor: "pointer", transition: "background 0.12s"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
                <ProjectDot color={project.color} />
                {editing ? (
                    <input
                        ref={inputRef}
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setEditing(false); setVal(project.name); } }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 5, padding: "2px 6px", color: "#fff", fontSize: 13,
                            fontFamily: "'DM Sans', sans-serif", outline: "none"
                        }}
                    />
                ) : (
                    <span style={{ flex: 1, fontSize: 13, color: "#9b9b9b", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {project.name}
                    </span>
                )}
                <span style={{ fontSize: 11, color: "#616161", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>▶</span>
                <button
                    onClick={e => { e.stopPropagation(); onDelete(project.id); }}
                    style={{ background: "none", border: "none", color: "#616161", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
                >×</button>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════
   MAIN SIDEBAR
══════════════════════════════════════ */
export function Sidebar({ view, setView, doctorErrors = 0, activeConvId, onSelectConv, onNewChat }) {
    const [conversations, setConversations] = useState([]);
    const [projects, setProjects] = useState([]);
    const [openProjects, setOpenProjects] = useState({});
    const [projectConvs, setProjectConvs] = useState({});
    const [supabaseOk, setSupabaseOk] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [showNewProject, setShowNewProject] = useState(false);
    const [dragId, setDragId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const newProjectRef = useRef(null);

    /* ── Load data ── */
    const loadAll = useCallback(async () => {
        try {
            const [statusRes, convsRes, projsRes] = await Promise.all([
                fetch(`${API}/history/status`).then(r => r.json()).catch(() => ({ connected: false })),
                fetch(`${API}/history/conversations?all=true`).then(r => r.json()).catch(() => []),
                fetch(`${API}/history/projects`).then(r => r.json()).catch(() => []),
            ]);
            setSupabaseOk(statusRes.connected || false);
            setConversations(Array.isArray(convsRes) ? convsRes : []);
            setProjects(Array.isArray(projsRes) ? projsRes : []);
        } catch { }
    }, []);

    useEffect(() => {
        loadAll();
        const iv = setInterval(loadAll, 15000);
        return () => clearInterval(iv);
    }, [loadAll]);

    // Load convs for open projects
    useEffect(() => {
        projects.forEach(async proj => {
            if (openProjects[proj.id]) {
                try {
                    const data = await fetch(`${API}/history/conversations?project_id=${proj.id}`).then(r => r.json());
                    setProjectConvs(p => ({ ...p, [proj.id]: Array.isArray(data) ? data : [] }));
                } catch { }
            }
        });
    }, [openProjects, projects]);

    /* ── Conversations without project ── */
    const rootConvs = conversations.filter(c => !c.project_id);

    /* ── Group by date ── */
    const grouped = {};
    rootConvs.forEach(c => {
        const g = getDateGroup(c.updated_at || c.created_at);
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(c);
    });

    /* ── Actions ── */
    const handleNewChat = async () => {
        try {
            const conv = await fetch(`${API}/history/conversations`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "Nueva conversación" })
            }).then(r => r.json());
            if (conv?.id) {
                await loadAll();
                onSelectConv?.(conv);
                setView("chat");
            } else {
                onNewChat?.();
                setView("chat");
            }
        } catch {
            onNewChat?.();
            setView("chat");
        }
    };

    const handleSelectConv = (conv) => {
        onSelectConv?.(conv);
        setView("chat");
    };

    const handleRenameConv = async (id, title) => {
        await fetch(`${API}/history/conversations/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title })
        });
        loadAll();
    };

    const handleDeleteConv = async (id) => {
        await fetch(`${API}/history/conversations/${id}`, { method: "DELETE" });
        loadAll();
    };

    const handleCreateProject = async () => {
        const name = newProjectName.trim() || "Nuevo proyecto";
        await fetch(`${API}/history/projects`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        setNewProjectName("");
        setShowNewProject(false);
        loadAll();
    };

    const handleRenameProject = async (id, name) => {
        await fetch(`${API}/history/projects/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        loadAll();
    };

    const handleDeleteProject = async (id) => {
        await fetch(`${API}/history/projects/${id}`, { method: "DELETE" });
        loadAll();
    };

    const toggleProject = (id) => {
        setOpenProjects(p => ({ ...p, [id]: !p[id] }));
    };

    /* ── Drag & drop reorder projects ── */
    const handleDragStart = (id) => setDragId(id);
    const handleDragOver = (id) => setDragOverId(id);
    const handleDrop = async (targetId) => {
        if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
        const reordered = [...projects];
        const fromIdx = reordered.findIndex(p => p.id === dragId);
        const toIdx = reordered.findIndex(p => p.id === targetId);
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        setProjects(reordered);
        setDragId(null);
        setDragOverId(null);
        await fetch(`${API}/history/projects/reorder`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds: reordered.map(p => p.id) })
        });
    };

    return (
        <div style={{
            width: 260, minWidth: 260, background: "#171717",
            display: "flex", flexDirection: "column", overflow: "hidden",
            borderRight: "1px solid rgba(255,255,255,0.07)"
        }}>

            {/* ── Logo + New Chat ── */}
            <div style={{ padding: "10px 8px 6px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: "50%", background: "#10a37f",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff"
                        }}>⚡</div>
                        <span style={{ fontSize: 15, fontWeight: 600, color: "#ececec", letterSpacing: "-0.01em" }}>Jarvis AI</span>
                    </div>
                    <button
                        onClick={handleNewChat}
                        title="Nueva conversación"
                        style={{
                            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8, color: "#9b9b9b", cursor: "pointer",
                            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, transition: "all 0.12s"
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#ececec"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#9b9b9b"; }}
                    >✏️</button>
                </div>

                {/* Nav */}
                {NAV_MAIN.map(item => (
                    <NavBtn key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />
                ))}
            </div>

            {/* ── Scrollable history + projects ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>

                {/* Supabase warning */}
                {!supabaseOk && (
                    <div style={{
                        margin: "6px 4px", padding: "8px 10px", borderRadius: 8,
                        background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
                        fontSize: 11, color: "#f59e0b", lineHeight: 1.5
                    }}>
                        ⚠ Supabase no conectado. Agrega SUPABASE_URL y SUPABASE_ANON_KEY en .env para activar el historial.
                    </div>
                )}

                {/* ── Projects section ── */}
                <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 2px" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "#616161", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Proyectos
                        </span>
                        <button
                            onClick={() => { setShowNewProject(p => !p); setTimeout(() => newProjectRef.current?.focus(), 50); }}
                            style={{ background: "none", border: "none", color: "#616161", cursor: "pointer", fontSize: 16, padding: "0 2px" }}
                            title="Nuevo proyecto"
                        >+</button>
                    </div>

                    {showNewProject && (
                        <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
                            <input
                                ref={newProjectRef}
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleCreateProject(); if (e.key === "Escape") { setShowNewProject(false); setNewProjectName(""); } }}
                                placeholder="Nombre del proyecto..."
                                style={{
                                    flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                                    borderRadius: 6, padding: "5px 8px", color: "#ececec", fontSize: 12,
                                    fontFamily: "'DM Sans', sans-serif", outline: "none"
                                }}
                            />
                            <button onClick={handleCreateProject}
                                style={{ background: "#10a37f", border: "none", borderRadius: 6, padding: "5px 8px", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                ✓
                            </button>
                        </div>
                    )}

                    {projects.map(proj => (
                        <div key={proj.id}
                            style={{ outline: dragOverId === proj.id && dragId !== proj.id ? "1px dashed #10a37f" : "none", borderRadius: 8 }}>
                            <ProjectItem
                                project={proj}
                                open={!!openProjects[proj.id]}
                                onToggle={toggleProject}
                                onRename={handleRenameProject}
                                onDelete={handleDeleteProject}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            />
                            {openProjects[proj.id] && (
                                <div style={{ paddingLeft: 16, marginBottom: 4 }}>
                                    {(projectConvs[proj.id] || []).length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#616161", padding: "4px 10px" }}>Sin chats</div>
                                    ) : (
                                        (projectConvs[proj.id] || []).map(conv => (
                                            <ConvItem
                                                key={conv.id}
                                                conv={conv}
                                                active={activeConvId === conv.id}
                                                onSelect={handleSelectConv}
                                                onRename={handleRenameConv}
                                                onDelete={handleDeleteConv}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {projects.length === 0 && (
                        <div style={{ fontSize: 12, color: "#616161", padding: "4px 10px" }}>Sin proyectos</div>
                    )}
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "10px 4px 8px" }} />

                {/* ── Conversations grouped by date ── */}
                {supabaseOk ? (
                    DATE_GROUP_ORDER.map(group => {
                        const items = grouped[group];
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={group} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 500, color: "#616161", padding: "4px 10px 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                    {group}
                                </div>
                                {items.map(conv => (
                                    <ConvItem
                                        key={conv.id}
                                        conv={conv}
                                        active={activeConvId === conv.id}
                                        onSelect={handleSelectConv}
                                        onRename={handleRenameConv}
                                        onDelete={handleDeleteConv}
                                    />
                                ))}
                            </div>
                        );
                    })
                ) : (
                    <div style={{ fontSize: 12, color: "#616161", padding: "4px 10px" }}>
                        Conecta Supabase para ver el historial
                    </div>
                )}

                <div style={{ height: 16 }} />
            </div>

            {/* ── System nav + footer ── */}
            <div style={{ padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "#616161", padding: "4px 8px 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Sistema
                </div>
                {NAV_SYSTEM.map(item => (
                    <NavBtn key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)}
                        badge={item.key === "doctor" && doctorErrors > 0 ? doctorErrors : null}
                    />
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 4px" }}>
                    <span style={{
                        width: 7, height: 7, borderRadius: "50%", background: "#19c37d",
                        animation: "pulseSidebar 3s ease-in-out infinite", flexShrink: 0
                    }} />
                    <span style={{ fontSize: 13, color: "#616161" }}>Sistema activo</span>
                    {supabaseOk && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#10a37f" }} title="Supabase conectado" />}
                </div>
            </div>

            <style>{`
                @keyframes pulseSidebar { 0%,100%{opacity:1} 50%{opacity:0.35} }
                .conv-delete-btn { opacity: 0 !important; }
                div:hover > .conv-delete-btn,
                div:hover .conv-delete-btn { opacity: 1 !important; }
            `}</style>
        </div>
    );
}

function NavBtn({ item, active, onClick, badge }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                background: active ? "rgba(255,255,255,0.1)" : "transparent",
                border: `1px solid ${active ? "rgba(255,255,255,0.12)" : "transparent"}`,
                color: active ? "#ececec" : "#9b9b9b",
                padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                fontSize: 14, fontWeight: active ? 500 : 400,
                fontFamily: "'DM Sans', sans-serif", textAlign: "left",
                transition: "all 0.12s", position: "relative", marginBottom: 1
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#ececec"; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9b9b9b"; } }}
        >
            <span style={{ fontSize: 17, width: 22, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
            <span>{item.label}</span>
            {badge && (
                <span style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "#ef4444", color: "#fff", borderRadius: 10,
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", minWidth: 18, textAlign: "center",
                    fontFamily: "'DM Mono', monospace"
                }}>{badge}</span>
            )}
        </button>
    );
}

export default Sidebar;