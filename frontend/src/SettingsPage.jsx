import React, { useEffect, useState } from "react";
import WhatsAppQR from "./WhatsAppQR";

const API = "http://localhost:3001/api";

function Section({ title, icon, children }) {
    return (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", marginBottom: "16px", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "9px" }}>
                <span style={{ fontSize: "16px" }}>{icon}</span>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {children}
            </div>
        </div>
    );
}

function Field({ label, hint, children }) {
    return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div style={{ flex: "0 0 230px" }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
                {hint && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px", lineHeight: "1.5", whiteSpace: "pre-line" }}>{hint}</div>}
            </div>
            <div style={{ flex: 1 }}>{children}</div>
        </div>
    );
}

function TextInput({ value, onChange, placeholder, mono = false, type = "text" }) {
    return (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", background: "var(--input-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif", fontSize: "13px", outline: "none" }} />
    );
}

function Toggle({ checked, onChange }) {
    return (
        <label style={{ position: "relative", width: "40px", height: "22px", cursor: "pointer", display: "block" }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
            <span style={{ position: "absolute", inset: 0, background: checked ? "rgba(16,163,127,0.3)" : "rgba(255,255,255,0.08)", border: `1px solid ${checked ? "rgba(16,163,127,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: "100px", transition: "all 0.2s" }} />
            <span style={{ position: "absolute", width: "16px", height: "16px", bottom: "2px", left: checked ? "21px" : "2px", background: checked ? "var(--accent)" : "#6b7280", borderRadius: "50%", transition: "all 0.2s" }} />
        </label>
    );
}

function Select({ value, onChange, options }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            style={{ width: "100%", background: "var(--input-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "13px", outline: "none" }}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

function TestModel({ url, model, apiKey }) {
    const [result, setResult] = useState(null);
    const [testing, setTesting] = useState(false);
    const handleTest = async () => {
        setTesting(true); setResult(null);
        try {
            const headers = { "Content-Type": "application/json" };
            if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
            const body = { messages: [{ role: "user", content: "Say OK" }], max_tokens: 10, temperature: 0 };
            if (model) body.model = model;
            const res = await fetch(`${url}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
            const data = await res.json();
            if (data.choices?.[0]?.message?.content) {
                setResult({ ok: true, msg: `✓ Conexión exitosa — "${data.choices[0].message.content.trim()}"` });
            } else if (data.error) {
                setResult({ ok: false, msg: `✕ ${data.error.message || JSON.stringify(data.error)}` });
            } else {
                setResult({ ok: false, msg: `✕ Respuesta inesperada` });
            }
        } catch (err) { setResult({ ok: false, msg: `✕ ${err.message}` }); }
        setTesting(false);
    };
    return (
        <div>
            <button onClick={handleTest} disabled={testing || !url} style={{ background: "rgba(16,163,127,0.12)", border: "1px solid rgba(16,163,127,0.3)", borderRadius: "7px", padding: "7px 16px", color: "var(--accent)", fontSize: "12px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: testing || !url ? "not-allowed" : "pointer" }}>
                {testing ? "Probando..." : "🔌 Probar conexión"}
            </button>
            {result && (
                <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "7px", fontSize: "12px", fontFamily: "'DM Mono', monospace", lineHeight: "1.5", background: result.ok ? "rgba(25,195,125,0.1)" : "rgba(239,68,68,0.1)", color: result.ok ? "#19c37d" : "#ef4444", border: `1px solid ${result.ok ? "rgba(25,195,125,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                    {result.msg}
                </div>
            )}
        </div>
    );
}

/* ─── Test Groq STT ───────────────────────────────────── */
function TestGroqSTT({ apiKey }) {
    const [result, setResult] = useState(null);
    const [testing, setTesting] = useState(false);

    const handleTest = async () => {
        setTesting(true); setResult(null);
        try {
            const res = await fetch(`${API}/stt/status`);
            const data = await res.json();
            if (data.configured) {
                setResult({ ok: true, msg: `✓ Groq STT configurado — modelo: ${data.model}` });
            } else {
                setResult({ ok: false, msg: "✕ GROQ_API_KEY no guardada en .env del backend" });
            }
        } catch (err) { setResult({ ok: false, msg: `✕ ${err.message}` }); }
        setTesting(false);
    };

    return (
        <div>
            <button onClick={handleTest} disabled={testing} style={{ background: "rgba(16,163,127,0.12)", border: "1px solid rgba(16,163,127,0.3)", borderRadius: "7px", padding: "7px 16px", color: "var(--accent)", fontSize: "12px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                {testing ? "Verificando..." : "🎙 Verificar STT"}
            </button>
            {result && (
                <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "7px", fontSize: "12px", fontFamily: "'DM Mono', monospace", background: result.ok ? "rgba(25,195,125,0.1)" : "rgba(239,68,68,0.1)", color: result.ok ? "#19c37d" : "#ef4444", border: `1px solid ${result.ok ? "rgba(25,195,125,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                    {result.msg}
                </div>
            )}
        </div>
    );
}

function BatCreator() {
    const [form, setForm] = useState({ filePath: "pc/custom/mi_script.bat", key: "my_script", label: "Mi Script", category: "custom", desc: "Descripción del script", content: "@echo off\n:: Mi script personalizado\necho Hola desde mi script!\npause" });
    const [status, setStatus] = useState(null);
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const handleCreate = async () => {
        setStatus("saving");
        try {
            const r1 = await fetch(`${API}/bats`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath: form.filePath, content: form.content }) });
            if (!r1.ok) throw new Error(await r1.text());
            const r2 = await fetch(`${API}/whitelist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: form.key, entry: { path: form.filePath, label: form.label, category: form.category, description: form.desc, timeout: 10000 } }) });
            if (!r2.ok) throw new Error(await r2.text());
            setStatus("ok"); setTimeout(() => setStatus(null), 3000);
        } catch (err) { setStatus("error:" + err.message); setTimeout(() => setStatus(null), 4000); }
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[{ k: "filePath", label: "Ruta", placeholder: "pc/custom/mi_script.bat", mono: true }, { k: "key", label: "Clave whitelist", placeholder: "my_script", mono: true }, { k: "label", label: "Etiqueta", placeholder: "Mi Script" }, { k: "desc", label: "Descripción", placeholder: "Qué hace" }].map(({ k, label, placeholder, mono }) => (
                    <div key={k}><div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>{label}</div><TextInput value={form[k]} onChange={v => set(k, v)} placeholder={placeholder} mono={mono} /></div>
                ))}
            </div>
            <div><div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Categoría</div><Select value={form.category} onChange={v => set("category", v)} options={[{ value: "custom", label: "custom" }, { value: "media", label: "media" }, { value: "system", label: "system" }, { value: "apps", label: "apps" }]} /></div>
            <div><div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>Contenido .bat</div><textarea value={form.content} onChange={e => set("content", e.target.value)} rows={7} style={{ width: "100%", background: "var(--input-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "12px", color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", fontSize: "12px", lineHeight: "1.6", resize: "vertical", outline: "none" }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={handleCreate} disabled={status === "saving"} style={{ background: "var(--accent)", border: "none", borderRadius: "8px", padding: "9px 18px", color: "#fff", fontSize: "13px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{status === "saving" ? "Creando..." : "⚡ Crear Script"}</button>
                {status === "ok" && <span style={{ fontSize: "12px", color: "#19c37d" }}>✓ Script creado</span>}
                {status?.startsWith("error:") && <span style={{ fontSize: "12px", color: "#ef4444" }}>{status.replace("error:", "")}</span>}
            </div>
        </div>
    );
}

/* ─── Main Settings ───────────────────────────────────── */
function SettingsPage() {
    const [mode, setMode] = useState("simple");
    const [settings, setSettings] = useState({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tab, setTab] = useState("model");

    useEffect(() => {
        fetch(`${API}/settings`).then(r => r.json()).then(setSettings).catch(console.error);
    }, []);

    const set = (k, v) => setSettings(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`${API}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
            setSaved(true); setTimeout(() => setSaved(false), 3000);
        } catch (err) { alert("Error: " + err.message); }
        setSaving(false);
    };

    const tabs = [
        { key: "model", label: "🧠 Modelo IA" },
        { key: "whatsapp", label: "💬 WhatsApp" },
        { key: "stt", label: "🎙 Voz (STT)" },
        { key: "vision", label: "👁 Visión & Control" },
        { key: "bats", label: "⚡ Scripts .bat" },
        { key: "general", label: "⚙ General" },
    ];

    const PROVIDERS = [
        { id: "lmstudio", label: "LM Studio (Local)", baseUrl: "http://localhost:1234/v1", needsKey: false },
        { id: "openai", label: "OpenAI (GPT-4…)", baseUrl: "https://api.openai.com/v1", needsKey: true },
        { id: "anthropic", label: "Anthropic (Claude…)", baseUrl: "https://api.anthropic.com/v1", needsKey: true },
        { id: "groq", label: "Groq (Llama, Mixtral…)", baseUrl: "https://api.groq.com/openai/v1", needsKey: true },
        { id: "ollama", label: "Ollama (Local)", baseUrl: "http://localhost:11434/v1", needsKey: false },
        { id: "custom", label: "URL personalizada", baseUrl: "", needsKey: true },
    ];

    const currentProvider = PROVIDERS.find(p => settings.lm_api_url?.startsWith(p.baseUrl)) || PROVIDERS[5];
    const handleProviderChange = (id) => {
        const p = PROVIDERS.find(pr => pr.id === id);
        if (p && p.baseUrl) set("lm_api_url", p.baseUrl);
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ padding: "22px 28px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <h1 style={{ fontSize: "19px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>⚙️ Configuración</h1>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>Ajustá el sistema sin tocar código</p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "3px", display: "flex" }}>
                        {["simple", "advanced"].map(m => (
                            <button key={m} onClick={() => setMode(m)} style={{ background: mode === m ? "rgba(255,255,255,0.1)" : "transparent", border: "none", borderRadius: "6px", padding: "5px 14px", color: mode === m ? "var(--text-primary)" : "var(--text-muted)", fontSize: "12px", fontWeight: mode === m ? 600 : 400, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                                {m === "simple" ? "Simple" : "Avanzado"}
                            </button>
                        ))}
                    </div>
                    <button onClick={handleSave} disabled={saving} style={{ background: "var(--accent)", border: "none", borderRadius: "8px", padding: "8px 18px", color: "#fff", fontSize: "13px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                        {saving ? "Guardando..." : saved ? "✓ Guardado" : "💾 Guardar"}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Tabs */}
                <div style={{ width: "185px", borderRight: "1px solid rgba(255,255,255,0.07)", padding: "10px 8px", overflowY: "auto" }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            style={{ width: "100%", textAlign: "left", background: tab === t.key ? "var(--active-bg)" : "transparent", border: `1px solid ${tab === t.key ? "rgba(255,255,255,0.1)" : "transparent"}`, borderRadius: "8px", padding: "9px 12px", cursor: "pointer", marginBottom: "2px", fontSize: "13px", fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)", fontFamily: "'DM Sans', sans-serif" }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

                    {/* ── MODEL ── */}
                    {tab === "model" && (
                        <>
                            <Section title="Proveedor de IA" icon="🔌">
                                <Field label="Proveedor" hint="Servicio donde corre el modelo">
                                    <Select value={currentProvider.id} onChange={handleProviderChange} options={PROVIDERS.map(p => ({ value: p.id, label: p.label }))} />
                                </Field>
                                <Field label="URL del servidor" hint="Para LM Studio usá la IP de tu PC si es remoto">
                                    <TextInput value={settings.lm_api_url || ""} onChange={v => set("lm_api_url", v)} placeholder="http://localhost:1234/v1" mono />
                                </Field>
                                {(currentProvider.needsKey || mode === "advanced") && (
                                    <Field label="API Key" hint="No requerida para LM Studio local">
                                        <TextInput type="password" value={settings.lm_api_token || ""} onChange={v => set("lm_api_token", v)} placeholder="sk-..." mono />
                                    </Field>
                                )}
                                <Field label="Nombre del modelo" hint={`Ejemplos: gpt-4o, llama-3-13b-instruct\nLM Studio: dejá vacío para el modelo activo`}>
                                    <TextInput value={settings.lm_model || ""} onChange={v => set("lm_model", v)} placeholder="(vacío = usa el modelo activo)" mono />
                                </Field>
                                <div style={{ paddingTop: "4px" }}>
                                    <TestModel url={settings.lm_api_url} model={settings.lm_model} apiKey={settings.lm_api_token} />
                                </div>
                            </Section>
                        </>
                    )}

                    {/* ── WHATSAPP ── */}
                    {tab === "whatsapp" && (
                        <>
                            {/* QR Scanner */}
                            <div style={{ marginBottom: 20 }}>
                                <WhatsAppQR />
                            </div>

                            <Section title="Configuración" icon="⚙️">
                                <Field label="Tu número" hint="Sin +, sin espacios. Ej: 5491160597308">
                                    <TextInput value={settings.whatsapp_numbers || ""} onChange={v => set("whatsapp_numbers", v)} placeholder="5491160597308" mono />
                                </Field>
                                {mode === "advanced" && (
                                    <Field label="Debug Mode" hint="Loguea el número exacto de cada mensaje">
                                        <Toggle checked={!!settings.whatsapp_debug} onChange={v => set("whatsapp_debug", v)} />
                                    </Field>
                                )}
                            </Section>
                        </>
                    )}

                    {/* ── STT (Speech to Text) ── */}
                    {tab === "stt" && (
                        <>
                            <Section title="Speech to Text — Groq Whisper" icon="🎙">
                                <div style={{ padding: "10px 14px", background: "rgba(16,163,127,0.06)", borderRadius: 10, border: "1px solid rgba(16,163,127,0.15)", fontSize: 13, color: "#9b9b9b", lineHeight: 1.7 }}>
                                    <strong style={{ color: "var(--text-primary)" }}>Modelo:</strong> whisper-large-v3-turbo (Groq)<br />
                                    <strong style={{ color: "var(--text-primary)" }}>Soporta:</strong> flac, mp3, mp4, m4a, ogg, wav, webm<br />
                                    <strong style={{ color: "var(--text-primary)" }}>Límite:</strong> 25 MB · Tiempo real
                                </div>

                                <Field label="Groq API Key" hint={"Obtenela en: console.groq.com\nEmpeza con gsk_..."}>
                                    <TextInput type="password"
                                        value={settings.groq_api_key === "***configured***" ? "" : (settings.groq_api_key || "")}
                                        onChange={v => set("groq_api_key", v)}
                                        placeholder={settings.groq_api_key === "***configured***" ? "••••• (configurado)" : "gsk_..."}
                                        mono />
                                </Field>

                                <div style={{ paddingTop: "4px" }}>
                                    <TestGroqSTT apiKey={settings.groq_api_key} />
                                </div>
                            </Section>

                            <Section title="Cómo usar el micrófono" icon="🎤">
                                <div style={{ fontSize: 13, color: "#9b9b9b", lineHeight: 1.8 }}>
                                    <div>• En el chat web: mantené presionado el botón 🎤 para grabar</div>
                                    <div>• Soltá para que se transcriba y envíe automáticamente</div>
                                    <div>• Los audios de WhatsApp también se transcriben automáticamente</div>
                                </div>

                                <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.07)", borderRadius: 8, fontSize: 12, color: "#f59e0b", lineHeight: 1.6 }}>
                                    ⚠ Guardá la configuración y luego agregá en <code style={{ fontFamily: "'DM Mono', monospace" }}>backend/config/.env</code>:<br />
                                    <code style={{ fontFamily: "'DM Mono', monospace", color: "#19c37d" }}>GROQ_API_KEY=gsk_tu_clave_aqui</code>
                                </div>
                            </Section>
                        </>
                    )}

                    {/* ── VISION ── */}
                    {tab === "vision" && (
                        <Section title="Visión & Control del PC" icon="👁">
                            <Field label="API Key (Vision)" hint="Para analizar imágenes/PDFs. Claude o OpenAI.">
                                <TextInput type="password" value={settings.vision_api_key === "***configured***" ? "" : (settings.vision_api_key || "")} onChange={v => set("vision_api_key", v)} placeholder={settings.vision_api_key === "***configured***" ? "••••• (configurado)" : "sk-ant-... o sk-..."} mono />
                            </Field>
                            <Field label="Proveedor Vision" hint="Claude: mejor para PDFs">
                                <Select value={settings.vision_provider || "claude"} onChange={v => set("vision_provider", v)} options={[{ value: "claude", label: "Claude (Anthropic) — Recomendado" }, { value: "openai", label: "GPT-4o (OpenAI)" }]} />
                            </Field>
                            <Field label="Control del PC" hint="Permite clicks, teclado, automatización">
                                <Toggle checked={!!settings.computer_control_enabled} onChange={v => set("computer_control_enabled", v)} />
                            </Field>
                        </Section>
                    )}

                    {/* ── BATS ── */}
                    {tab === "bats" && (
                        <Section title="Crear Nuevo Script .bat" icon="⚡">
                            <BatCreator />
                        </Section>
                    )}

                    {/* ── GENERAL ── */}
                    {tab === "general" && (
                        <Section title="Servidor" icon="🖥">
                            <Field label="Puerto del backend" hint="Default: 3001. Reiniciá para aplicar.">
                                <TextInput value={settings.port || ""} onChange={v => set("port", v)} placeholder="3001" mono />
                            </Field>
                        </Section>
                    )}

                    <div style={{ height: "20px" }} />
                </div>
            </div>
        </div>
    );
}

export default SettingsPage;