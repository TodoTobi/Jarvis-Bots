import React, { useEffect, useState } from "react";

const API = "http://localhost:3001/api";

/* ─── Section wrapper ─────────────────────────────────── */
function Section({ title, icon, children }) {
    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: "12px", marginBottom: "16px", overflow: "hidden"
        }}>
            <div style={{
                padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: "9px"
            }}>
                <span style={{ fontSize: "16px" }}>{icon}</span>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                {children}
            </div>
        </div>
    );
}

/* ─── Setting field ───────────────────────────────────── */
function Field({ label, hint, children }) {
    return (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ flex: "0 0 220px" }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
                {hint && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px", lineHeight: "1.5" }}>{hint}</div>}
            </div>
            <div style={{ flex: 1 }}>{children}</div>
        </div>
    );
}

/* ─── Text input ──────────────────────────────────────── */
function TextInput({ value, onChange, placeholder, mono = false }) {
    return (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{
                width: "100%", background: "var(--input-bg)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px", padding: "8px 12px",
                color: "var(--text-primary)",
                fontFamily: mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif",
                fontSize: "13px", outline: "none"
            }} />
    );
}

/* ─── Toggle ──────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
    return (
        <label style={{ position: "relative", width: "40px", height: "22px", cursor: "pointer", display: "block" }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
            <span style={{
                position: "absolute", inset: 0,
                background: checked ? "rgba(16,163,127,0.3)" : "rgba(255,255,255,0.08)",
                border: `1px solid ${checked ? "rgba(16,163,127,0.5)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: "100px", transition: "all 0.2s"
            }} />
            <span style={{
                position: "absolute", width: "16px", height: "16px",
                bottom: "2px", left: checked ? "21px" : "2px",
                background: checked ? "var(--accent)" : "#6b7280",
                borderRadius: "50%", transition: "all 0.2s"
            }} />
        </label>
    );
}

/* ─── Bat creator ─────────────────────────────────────── */
function BatCreator() {
    const [filePath, setFilePath] = useState("pc/custom/mi_script.bat");
    const [content, setContent] = useState("@echo off\n:: Mi script personalizado\necho Hola desde mi script!\npause");
    const [key, setKey] = useState("my_script");
    const [label, setLabel] = useState("Mi Script");
    const [category, setCategory] = useState("custom");
    const [desc, setDesc] = useState("Descripción de mi script");
    const [status, setStatus] = useState(null);

    const handleCreate = async () => {
        setStatus("saving");
        try {
            // 1. Save the .bat file
            const r1 = await fetch(`${API}/bats`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath, content })
            });
            if (!r1.ok) throw new Error(await r1.text());

            // 2. Add to whitelist
            const r2 = await fetch(`${API}/whitelist`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, entry: { path: filePath, label, category, description: desc, timeout: 10000 } })
            });
            if (!r2.ok) throw new Error(await r2.text());

            setStatus("ok");
            setTimeout(() => setStatus(null), 3000);
        } catch (err) {
            setStatus("error:" + err.message);
            setTimeout(() => setStatus(null), 4000);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Ruta del archivo (relativa a bats/)</div>
                    <TextInput value={filePath} onChange={setFilePath} placeholder="pc/custom/mi_script.bat" mono />
                </div>
                <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Clave en whitelist (única, sin espacios)</div>
                    <TextInput value={key} onChange={setKey} placeholder="my_script" mono />
                </div>
                <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Etiqueta</div>
                    <TextInput value={label} onChange={setLabel} placeholder="Mi Script" />
                </div>
                <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Categoría</div>
                    <select value={category} onChange={e => setCategory(e.target.value)}
                        style={{ width: "100%", background: "var(--input-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "13px", outline: "none" }}>
                        <option value="custom">custom</option>
                        <option value="media">media</option>
                        <option value="system">system</option>
                        <option value="apps">apps</option>
                    </select>
                </div>
            </div>
            <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Descripción</div>
                <TextInput value={desc} onChange={setDesc} placeholder="Qué hace este script" />
            </div>
            <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Contenido del .bat</div>
                <textarea value={content} onChange={e => setContent(e.target.value)}
                    rows={8}
                    style={{
                        width: "100%", background: "var(--input-bg)",
                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
                        padding: "12px", color: "var(--text-primary)",
                        fontFamily: "'DM Mono', monospace", fontSize: "12px",
                        lineHeight: "1.6", resize: "vertical", outline: "none"
                    }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={handleCreate} disabled={status === "saving"}
                    style={{
                        background: "var(--accent)", border: "none", borderRadius: "8px",
                        padding: "9px 18px", color: "#fff", fontSize: "13px", fontWeight: 600,
                        fontFamily: "'DM Sans', sans-serif", cursor: "pointer"
                    }}>
                    {status === "saving" ? "Creando..." : "⚡ Crear Script"}
                </button>
                {status === "ok" && <span style={{ fontSize: "12px", color: "#19c37d" }}>✓ Script creado y agregado a la whitelist</span>}
                {status?.startsWith("error:") && <span style={{ fontSize: "12px", color: "#ef4444" }}>{status.replace("error:", "")}</span>}
            </div>
        </div>
    );
}

/* ─── Main Settings ───────────────────────────────────── */
function SettingsPage() {
    const [mode, setMode] = useState("simple"); // simple | advanced
    const [settings, setSettings] = useState({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tab, setTab] = useState("general");

    useEffect(() => {
        fetch(`${API}/settings`)
            .then(r => r.json())
            .then(setSettings)
            .catch(console.error);
    }, []);

    const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`${API}/settings`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            alert("Error: " + err.message);
        }
        setSaving(false);
    };

    const tabs = [
        { key: "general", label: "General" },
        { key: "model", label: "Modelo IA" },
        { key: "whatsapp", label: "WhatsApp" },
        { key: "vision", label: "Visión & Control" },
        { key: "bats", label: "Scripts .bat" },
    ];

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflow: "hidden" }}>

            {/* Header */}
            <div style={{
                padding: "24px 28px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
                <div>
                    <h1 style={{ fontSize: "19px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>⚙️ Configuración</h1>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Ajustá el sistema sin tocar código
                    </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {/* Mode toggle */}
                    <div style={{
                        background: "var(--card-bg)", border: "1px solid var(--card-border)",
                        borderRadius: "8px", padding: "3px", display: "flex", gap: "2px"
                    }}>
                        {["simple", "advanced"].map(m => (
                            <button key={m} onClick={() => setMode(m)}
                                style={{
                                    background: mode === m ? "rgba(255,255,255,0.1)" : "transparent",
                                    border: "none", borderRadius: "6px", padding: "5px 14px",
                                    color: mode === m ? "var(--text-primary)" : "var(--text-muted)",
                                    fontSize: "12px", fontWeight: mode === m ? 600 : 400,
                                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer"
                                }}>
                                {m === "simple" ? "Simple" : "Avanzado"}
                            </button>
                        ))}
                    </div>
                    <button onClick={handleSave} disabled={saving}
                        style={{
                            background: "var(--accent)", border: "none", borderRadius: "8px",
                            padding: "8px 18px", color: "#fff", fontSize: "13px", fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif", cursor: "pointer"
                        }}>
                        {saving ? "Guardando..." : saved ? "✓ Guardado" : "💾 Guardar"}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

                {/* Tab list */}
                <div style={{ width: "180px", borderRight: "1px solid rgba(255,255,255,0.07)", padding: "12px 8px", overflowY: "auto" }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            style={{
                                width: "100%", textAlign: "left", background: tab === t.key ? "var(--active-bg)" : "transparent",
                                border: `1px solid ${tab === t.key ? "rgba(255,255,255,0.1)" : "transparent"}`,
                                borderRadius: "8px", padding: "9px 12px", cursor: "pointer", marginBottom: "2px",
                                fontSize: "13px", fontWeight: tab === t.key ? 600 : 400,
                                color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
                                fontFamily: "'DM Sans', sans-serif"
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

                    {tab === "general" && (
                        <>
                            <Section title="Servidor Backend" icon="🖥">
                                <Field label="Puerto" hint="Puerto donde corre el backend (default: 3001)">
                                    <TextInput value={settings.port || ""} onChange={v => set("port", v)} placeholder="3001" mono />
                                </Field>
                            </Section>
                        </>
                    )}

                    {tab === "model" && (
                        <>
                            <Section title="LM Studio" icon="🧠">
                                <Field label="URL del modelo" hint="IP y puerto donde LM Studio está corriendo. Ej: http://localhost:1234/v1">
                                    <TextInput value={settings.lm_api_url || ""} onChange={v => set("lm_api_url", v)} placeholder="http://localhost:1234/v1" mono />
                                </Field>
                                <Field label="Nombre del modelo" hint="Copiá el nombre EXACTO del modelo como aparece en LM Studio → Loaded Models. Si no coincide obtenés error 400.">
                                    <TextInput value={settings.lm_model || ""} onChange={v => set("lm_model", v)} placeholder="meta-llama-3.1-13b-instruct" mono />
                                </Field>
                                {mode === "advanced" && (
                                    <div style={{ padding: "10px 14px", background: "rgba(16,163,127,0.08)", borderRadius: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                                        💡 <strong>Tip:</strong> Si seguís recibiendo error 400, dejá el campo "Nombre del modelo" vacío. LM Studio usará el modelo que tengas cargado sin importar el nombre.
                                    </div>
                                )}
                            </Section>
                        </>
                    )}

                    {tab === "whatsapp" && (
                        <>
                            <Section title="WhatsApp Bot" icon="💬">
                                <Field label="Tu número" hint="Número de WhatsApp autorizado. Sin +, sin espacios. Ej: 5491160597308">
                                    <TextInput value={settings.whatsapp_numbers || ""} onChange={v => set("whatsapp_numbers", v)} placeholder="5491160597308" mono />
                                </Field>
                                {mode === "advanced" && (
                                    <Field label="Modo Debug" hint="Loguea el número exacto de cada mensaje recibido. Útil si el bot no te responde.">
                                        <Toggle checked={!!settings.whatsapp_debug} onChange={v => set("whatsapp_debug", v)} />
                                    </Field>
                                )}
                                {mode === "advanced" && (
                                    <>
                                        <Field label="Whisper.cpp (exe)" hint="Ruta al binario de whisper.cpp para transcripción de voz local">
                                            <TextInput value={settings.whisper_cpp_path || ""} onChange={v => set("whisper_cpp_path", v)} placeholder="C:\whisper.cpp\main.exe" mono />
                                        </Field>
                                        <Field label="Modelo Whisper" hint="Ruta al archivo .bin del modelo (ggml-base.bin recomendado)">
                                            <TextInput value={settings.whisper_model_path || ""} onChange={v => set("whisper_model_path", v)} placeholder="C:\whisper.cpp\models\ggml-base.bin" mono />
                                        </Field>
                                    </>
                                )}
                            </Section>
                        </>
                    )}

                    {tab === "vision" && (
                        <>
                            <Section title="Visión & Control del PC" icon="👁">
                                <Field label="API Key (Claude o OpenAI)" hint="Para análisis de imágenes, PDFs y control del PC. Obtenela en console.anthropic.com o platform.openai.com">
                                    <TextInput value={settings.vision_api_key === "***configured***" ? "" : (settings.vision_api_key || "")} onChange={v => set("vision_api_key", v)} placeholder={settings.vision_api_key === "***configured***" ? "••••••••• (configurado)" : "sk-ant-... o sk-..."} mono />
                                </Field>
                                <Field label="Proveedor" hint="Claude: mejor para PDFs y análisis detallado. OpenAI GPT-4o: buena alternativa.">
                                    <select value={settings.vision_provider || "claude"} onChange={e => set("vision_provider", e.target.value)}
                                        style={{ background: "var(--input-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "13px", outline: "none", width: "100%" }}>
                                        <option value="claude">Claude (Anthropic) — Recomendado</option>
                                        <option value="openai">GPT-4o (OpenAI)</option>
                                    </select>
                                </Field>
                                <Field label="Control del PC" hint="Permite a Jarvis controlar el mouse y teclado para automatizar tareas. Requiere: pip install pyautogui pillow">
                                    <Toggle checked={!!settings.computer_control_enabled} onChange={v => set("computer_control_enabled", v)} />
                                </Field>
                                {settings.computer_control_enabled && (
                                    <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: "8px", fontSize: "12px", color: "#f87171", lineHeight: "1.6" }}>
                                        ⚠️ <strong>Atención:</strong> Con el control del PC activado, Jarvis puede hacer clicks, escribir texto y controlar aplicaciones. Asegurate de solo darle tareas específicas y seguras.
                                    </div>
                                )}
                                {mode === "advanced" && (
                                    <div style={{ padding: "10px 14px", background: "rgba(16,163,127,0.08)", borderRadius: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                                        📦 <strong>Requisitos:</strong>
                                        <br />· <code>pip install pyautogui pillow</code> — control del PC
                                        <br />· <code>pip install openai-whisper</code> — transcripción local (opcional)
                                        <br />· API Key de Anthropic o OpenAI para análisis de imágenes y PDFs
                                    </div>
                                )}
                            </Section>
                        </>
                    )}

                    {tab === "bats" && (
                        <Section title="Crear Nuevo Script .bat" icon="⚡">
                            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                                Creá un script .bat personalizado y agregalo a la whitelist para que Jarvis pueda ejecutarlo.
                            </p>
                            <BatCreator />
                        </Section>
                    )}

                    <div style={{ height: "20px" }} />
                </div>
            </div>
        </div>
    );
}

export default SettingsPage;