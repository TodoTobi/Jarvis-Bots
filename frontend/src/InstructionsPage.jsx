import React, { useEffect, useState, useCallback } from "react";

const API = "http://localhost:3001/api";

const FILE_META = {
    identity: { icon: "🤖", label: "Identidad", desc: "Quién es Jarvis, sus principios y valores" },
    soul: { icon: "💡", label: "Personalidad", desc: "Tono, idioma, comportamiento y estilo" },
    user: { icon: "👤", label: "Tu Perfil", desc: "Tu nombre, preferencias y estilo preferido" },
    bots: { icon: "⚙️", label: "Bots", desc: "Descripción de bots y formato de intents" },
    tools: { icon: "🔧", label: "Herramientas", desc: "Herramientas disponibles para Jarvis" },
    memory: { icon: "🧠", label: "Memoria", desc: "Historial de conversaciones (auto-generado)" },
    heartbeat: { icon: "💓", label: "Heartbeat", desc: "Configuración de monitoreo del sistema" },
    bootstrap: { icon: "🚀", label: "Bootstrap", desc: "Secuencia de arranque y manejo de fallos" },
};

function InstructionsPage() {
    const [files, setFiles] = useState([]);
    const [selected, setSelected] = useState(null);
    const [content, setContent] = useState("");
    const [original, setOriginal] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadFiles = useCallback(async () => {
        try {
            const res = await fetch(`${API}/md`);
            const data = await res.json();
            setFiles(data.files || []);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadFiles(); }, [loadFiles]);

    const selectFile = (file) => {
        setSelected(file.key);
        setContent(file.content);
        setOriginal(file.content);
        setSaved(false);
    };

    const handleSave = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/md/${selected}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content })
            });
            if (res.ok) {
                setOriginal(content);
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
                // Refresh list
                await loadFiles();
            }
        } catch (err) {
            alert("Error al guardar: " + err.message);
        }
        setSaving(false);
    };

    const isDirty = content !== original;

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                <h1 style={{ fontSize: "19px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                    📄 Instrucciones del Modelo
                </h1>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Editá los archivos .md que definen el comportamiento de Jarvis. Los cambios se aplican en el próximo mensaje.
                </p>
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

                {/* File list */}
                <div style={{
                    width: "220px", minWidth: "220px",
                    borderRight: "1px solid rgba(255,255,255,0.07)",
                    overflowY: "auto", padding: "10px 8px"
                }}>
                    {loading ? (
                        <p style={{ color: "var(--text-muted)", fontSize: "13px", padding: "12px" }}>Cargando...</p>
                    ) : files.map(file => {
                        const meta = FILE_META[file.key] || { icon: "📄", label: file.key };
                        const isSelected = selected === file.key;
                        return (
                            <button key={file.key} onClick={() => selectFile(file)}
                                style={{
                                    width: "100%", textAlign: "left", background: isSelected ? "var(--active-bg)" : "transparent",
                                    border: `1px solid ${isSelected ? "rgba(255,255,255,0.12)" : "transparent"}`,
                                    borderRadius: "8px", padding: "10px 12px", cursor: "pointer",
                                    marginBottom: "2px", transition: "all 0.12s"
                                }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                                    <span style={{ fontSize: "16px" }}>{meta.icon}</span>
                                    <div>
                                        <div style={{ fontSize: "13px", fontWeight: isSelected ? 600 : 400, color: isSelected ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                            {meta.label || file.key}
                                        </div>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", fontFamily: "'DM Mono', monospace" }}>
                                            {file.key}.md · {file.size} chars
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Editor */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {!selected ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
                            <span style={{ fontSize: "40px", opacity: 0.3 }}>📄</span>
                            <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Seleccioná un archivo para editarlo</p>
                        </div>
                    ) : (
                        <>
                            {/* Editor toolbar */}
                            <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0
                            }}>
                                <div>
                                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                                        {FILE_META[selected]?.icon} {FILE_META[selected]?.label || selected}.md
                                    </span>
                                    <span style={{ marginLeft: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
                                        {FILE_META[selected]?.desc}
                                    </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    {isDirty && (
                                        <span style={{ fontSize: "11px", color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>
                                            ● sin guardar
                                        </span>
                                    )}
                                    {saved && (
                                        <span style={{ fontSize: "11px", color: "#19c37d", fontFamily: "'DM Mono', monospace" }}>
                                            ✓ guardado
                                        </span>
                                    )}
                                    <button onClick={() => { setContent(original); setSaved(false); }}
                                        disabled={!isDirty || saving}
                                        style={{
                                            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "7px", padding: "6px 14px", cursor: isDirty ? "pointer" : "not-allowed",
                                            color: isDirty ? "var(--text-secondary)" : "var(--text-muted)",
                                            fontSize: "12px", fontFamily: "'DM Sans', sans-serif"
                                        }}>
                                        Descartar
                                    </button>
                                    <button onClick={handleSave} disabled={!isDirty || saving}
                                        style={{
                                            background: isDirty ? "var(--accent)" : "rgba(255,255,255,0.07)",
                                            border: "none", borderRadius: "7px", padding: "6px 16px",
                                            cursor: isDirty ? "pointer" : "not-allowed",
                                            color: isDirty ? "#fff" : "var(--text-muted)",
                                            fontSize: "12px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                                            transition: "all 0.15s"
                                        }}>
                                        {saving ? "Guardando..." : "💾 Guardar"}
                                    </button>
                                </div>
                            </div>

                            {/* Textarea editor */}
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                spellCheck={false}
                                style={{
                                    flex: 1, padding: "20px 24px",
                                    background: "transparent",
                                    border: "none", outline: "none",
                                    color: "var(--text-primary)",
                                    fontFamily: "'DM Mono', Consolas, monospace",
                                    fontSize: "13px", lineHeight: "1.7",
                                    resize: "none", overflowY: "auto",
                                    caretColor: "var(--accent)"
                                }}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default InstructionsPage;