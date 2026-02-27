import React, { useState, useEffect, useCallback, useRef } from "react";

const API = "http://localhost:3001/api";

const STATUS = {
    ok: { color: "#19c37d", bg: "rgba(25,195,125,0.10)", label: "OK", icon: "✓" },
    warn: { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", label: "Aviso", icon: "!" },
    error: { color: "#ef4444", bg: "rgba(239,68,68,0.10)", label: "Error", icon: "✕" },
    loading: { color: "#6b7280", bg: "rgba(107,114,128,0.10)", label: "...", icon: "·" },
};

const CAT_ICON = {
    "Modelo IA": "🧠",
    "Dependencias npm": "📦",
    "Variables .env": "🔑",
    "Archivos del sistema": "📁",
    "Estado de Bots": "🤖",
    "Errores Recientes (error.log)": "🪵",
    "Android (ADB)": "📱",
    "Supabase (Historial)": "🗄️",
};

// Files the doctor "scans" visually during animation
const SCAN_FILES = [
    "backend/server.js", "backend/routes/chatRoutes.js", "backend/bots/BotManager.js",
    "backend/bots/NetBot.js", "backend/bots/WebBot.js", "backend/bots/WhatsAppBot.js",
    "backend/services/ModelService.js", "backend/services/SupabaseService.js",
    "backend/config/.env", "backend/config/devices.json", "backend/logs/error.log",
    "frontend/src/App.jsx", "frontend/src/Chat.jsx", "frontend/src/Sidebar.jsx",
    "node_modules/express/index.js", "node_modules/whatsapp-web.js/index.js",
    "package.json", "backend/routes/doctorRoutes.js", "backend/bots/DoctorBot.js",
];

/* ── Avast-style scan animation ───────────────────────── */
function AvastScanner({ scanning }) {
    const [currentFile, setCurrentFile] = useState("");
    const [scanned, setScanned] = useState(0);
    const [total] = useState(SCAN_FILES.length);
    const intervalRef = useRef(null);
    const indexRef = useRef(0);

    useEffect(() => {
        if (scanning) {
            indexRef.current = 0;
            setScanned(0);
            intervalRef.current = setInterval(() => {
                const idx = indexRef.current % SCAN_FILES.length;
                setCurrentFile(SCAN_FILES[idx]);
                setScanned(prev => Math.min(prev + 1, total));
                indexRef.current++;
            }, 160);
        } else {
            clearInterval(intervalRef.current);
            setCurrentFile("");
        }
        return () => clearInterval(intervalRef.current);
    }, [scanning, total]);

    if (!scanning) return null;

    const pct = Math.round((scanned / total) * 100);

    return (
        <div style={{
            margin: "0 28px 16px",
            background: "rgba(16,163,127,0.05)",
            border: "1px solid rgba(16,163,127,0.2)",
            borderRadius: 14, padding: "16px 20px",
            overflow: "hidden", position: "relative",
        }}>
            {/* Rotating radar arc */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
                    {/* Outer ring */}
                    <svg width="44" height="44" style={{ position: "absolute", top: 0, left: 0 }}>
                        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(16,163,127,0.2)" strokeWidth="2" />
                        <circle cx="22" cy="22" r="18" fill="none" stroke="#10a37f" strokeWidth="2"
                            strokeDasharray={`${pct * 1.13} 113`}
                            strokeLinecap="round"
                            transform="rotate(-90 22 22)"
                            style={{ transition: "stroke-dasharray 0.3s ease" }}
                        />
                    </svg>
                    {/* Spinning sweep */}
                    <div style={{
                        position: "absolute", top: "50%", left: "50%",
                        width: 2, height: 18, background: "linear-gradient(to bottom, #10a37f, transparent)",
                        transformOrigin: "0 0",
                        animation: "radarSweep 1.2s linear infinite",
                        marginTop: 0, marginLeft: 0,
                    }} />
                    {/* Center dot */}
                    <div style={{ position: "absolute", top: "50%", left: "50%", width: 6, height: 6, borderRadius: "50%", background: "#10a37f", transform: "translate(-50%, -50%)" }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                        Analizando sistema... {pct}%
                    </div>
                    <div style={{
                        fontSize: 11, color: "var(--accent)", fontFamily: "'DM Mono', monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        opacity: 0.8,
                    }}>
                        📄 {currentFile}
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                    height: "100%", background: "linear-gradient(90deg, #10a37f, #19c37d)",
                    borderRadius: 2, transition: "width 0.3s ease",
                    width: `${pct}%`,
                    boxShadow: "0 0 8px rgba(16,163,127,0.6)",
                }} />
            </div>

            {/* Scan line sweep */}
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "100%",
                background: "linear-gradient(180deg, transparent 0%, rgba(16,163,127,0.04) 50%, transparent 100%)",
                animation: "scanBodyMove 2s ease-in-out infinite",
                pointerEvents: "none",
            }} />
        </div>
    );
}

/* ── Restart buttons ──────────────────────────────────── */
function RestartButtons() {
    const [status, setStatus] = useState(null);
    const [sysInfo, setSysInfo] = useState(null);

    useEffect(() => {
        fetch(`${API}/system/info`).then(r => r.json()).then(setSysInfo).catch(() => { });
    }, []);

    const restart = async (target) => {
        setStatus(`restarting-${target}`);
        try {
            const endpoint = target === "backend" ? "restart-backend" : "restart-frontend";
            const res = await fetch(`${API}/system/${endpoint}`, { method: "POST" });
            const data = await res.json();
            setStatus(`done-${target}`);
            setTimeout(() => setStatus(null), 4000);
        } catch {
            // Backend restart will close connection — that's expected
            setStatus(`done-${target}`);
            setTimeout(() => setStatus(null), 4000);
        }
    };

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {sysInfo && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginRight: 4 }}>
                    PID {sysInfo.pid} · ↑ {sysInfo.uptimeFormatted} · {sysInfo.memory?.heapUsed}MB
                </div>
            )}

            <button
                onClick={() => restart("backend")}
                disabled={status?.startsWith("restarting")}
                style={{
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 8, padding: "6px 14px",
                    color: "#ef4444", fontSize: 12, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.1)"}
            >
                {status === "restarting-backend" ? (
                    <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Reiniciando...</>
                ) : status === "done-backend" ? "✓ Reiniciado" : "🔄 Reiniciar Backend"}
            </button>

            <button
                onClick={() => restart("frontend")}
                disabled={status?.startsWith("restarting")}
                style={{
                    background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 8, padding: "6px 14px",
                    color: "#818cf8", fontSize: 12, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(99,102,241,0.1)"}
            >
                {status === "restarting-frontend" ? (
                    <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Reiniciando...</>
                ) : status === "done-frontend" ? "✓ Reiniciado" : "🔄 Reiniciar Frontend"}
            </button>
        </div>
    );
}

/* ── Badge ────────────────────────────────────────────── */
function Badge({ status }) {
    const s = STATUS[status] || STATUS.loading;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: s.bg, border: `1.5px solid ${s.color}`, fontSize: 11, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace", flexShrink: 0, boxShadow: `0 0 6px ${s.color}33` }}>
            {s.icon}
        </span>
    );
}

/* ── Summary bar ──────────────────────────────────────── */
function SummaryBar({ summary, scanning, onScan, onFixAll }) {
    const total = summary?.total || 0;
    const ok = summary?.ok || 0;
    const warns = summary?.warns || 0;
    const errs = summary?.errors || 0;
    const health = total > 0 ? Math.round((ok / total) * 100) : 0;
    const healthColor = errs > 0 ? "#ef4444" : warns > 0 ? "#f59e0b" : "#19c37d";

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 28px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 54, height: 54, borderRadius: "50%", border: `3px solid ${healthColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 16px ${healthColor}33`, position: "relative" }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: healthColor, lineHeight: 1 }}>
                        {scanning ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 20 }}>⟳</span> : `${health}%`}
                    </span>
                </div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {scanning ? "Escaneando sistema..." : errs > 0 ? "Sistema con errores" : warns > 0 ? "Sistema con avisos" : "Sistema saludable"}
                    </div>
                    {!scanning && total > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, fontFamily: "'DM Mono', monospace" }}>
                            <span style={{ color: "#19c37d" }}>✓ {ok}</span>
                            <span style={{ margin: "0 8px", color: "#f59e0b" }}>! {warns}</span>
                            <span style={{ color: "#ef4444" }}>✕ {errs}</span>
                            <span style={{ marginLeft: 8 }}>/ {total} checks</span>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <RestartButtons />
                {errs > 0 && !scanning && (
                    <button onClick={onFixAll}
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 9, padding: "9px 18px", color: "#ef4444", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                        🔧 Solucionar Todo
                    </button>
                )}
                <button onClick={onScan} disabled={scanning}
                    style={{ background: scanning ? "rgba(255,255,255,0.05)" : "var(--accent)", border: "none", borderRadius: 9, padding: "9px 18px", color: scanning ? "var(--text-muted)" : "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: scanning ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                    {scanning ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Escaneando...</> : "🔍 Escanear"}
                </button>
            </div>
        </div>
    );
}

/* ── Check row ────────────────────────────────────────── */
function CheckRow({ check, onFix, fixResult }) {
    const [expanded, setExpanded] = useState(false);
    const s = STATUS[check.status] || STATUS.loading;

    return (
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: expanded ? "rgba(255,255,255,0.025)" : "transparent", transition: "background 0.15s" }}>
            <div onClick={() => setExpanded(p => !p)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", cursor: "pointer", userSelect: "none" }}>
                <Badge status={check.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{check.title}</span>
                        {check.status === "error" && check.fixable && (
                            <span style={{ fontSize: 10, background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>fixable</span>
                        )}
                    </div>
                    {!expanded && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{check.detail}</div>}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </div>

            {expanded && (
                <div style={{ padding: "0 16px 14px 48px" }}>
                    <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontFamily: "'DM Mono', monospace", fontSize: 12, color: s.color, lineHeight: 1.6, wordBreak: "break-all" }}>
                        {check.detail}
                    </div>
                    {check.file && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                            📁 <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--text-secondary)" }}>{check.file}</span>
                            {check.line && <span style={{ marginLeft: 8, color: "#f59e0b" }}>→ {check.line}</span>}
                        </div>
                    )}
                    {fixResult && (
                        <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 8, background: fixResult.success ? "rgba(25,195,125,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${fixResult.success ? "rgba(25,195,125,0.3)" : "rgba(245,158,11,0.3)"}`, fontSize: 12, color: fixResult.success ? "#19c37d" : "#f59e0b", fontFamily: "'DM Mono', monospace", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {fixResult.message}
                        </div>
                    )}
                    {check.fixable && check.fix && !fixResult && (
                        <button onClick={e => { e.stopPropagation(); onFix(check); }}
                            style={{ background: "rgba(16,163,127,0.15)", border: "1px solid rgba(16,163,127,0.4)", borderRadius: 7, padding: "6px 14px", color: "var(--accent)", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                            🔧 Aplicar Fix
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Category group ───────────────────────────────────── */
function CategoryGroup({ category, checks, onFix, fixResults }) {
    const [open, setOpen] = useState(true);
    const errors = checks.filter(c => c.status === "error").length;
    const warns = checks.filter(c => c.status === "warn").length;

    return (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            <div onClick={() => setOpen(p => !p)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none", userSelect: "none" }}>
                <span style={{ fontSize: 16 }}>{CAT_ICON[category] || "📋"}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{category}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {errors > 0 && <span style={{ fontSize: 11, color: "#ef4444", fontFamily: "'DM Mono', monospace" }}>✕ {errors}</span>}
                    {warns > 0 && <span style={{ fontSize: 11, color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>! {warns}</span>}
                    {errors === 0 && warns === 0 && <span style={{ fontSize: 11, color: "#19c37d", fontFamily: "'DM Mono', monospace" }}>✓ OK</span>}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                </div>
            </div>
            {open && checks.map(check => (
                <CheckRow key={check.id} check={check} onFix={onFix} fixResult={fixResults[check.id]} />
            ))}
        </div>
    );
}

/* ── Fix All modal ────────────────────────────────────── */
function FixAllResult({ result, onClose }) {
    if (!result) return null;
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "28px 32px", maxWidth: 520, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>🔧 Resultado de Fix-All</h3>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 14, whiteSpace: "pre-wrap" }}>
                    {result.message}
                </div>
                {result.manual?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <p style={{ fontSize: 12, color: "#f59e0b", marginBottom: 8 }}>Ejecutá en terminal:</p>
                        {result.manual.map((cmd, i) => (
                            <div key={i} style={{ background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "8px 12px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#19c37d", marginBottom: 6 }}>$ {cmd}</div>
                        ))}
                    </div>
                )}
                <button onClick={onClose} style={{ marginTop: 20, background: "var(--accent)", border: "none", borderRadius: 8, padding: "9px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cerrar</button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   MAIN DoctorPage
═══════════════════════════════════════ */
function DoctorPage() {
    const [checks, setChecks] = useState([]);
    const [summary, setSummary] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [fixResults, setFixResults] = useState({});
    const [fixAllResult, setFixAllResult] = useState(null);
    const [lastScan, setLastScan] = useState(null);

    const runScan = useCallback(async () => {
        setScanning(true);
        setFixResults({});
        try {
            const res = await fetch(`${API}/doctor/scan`);
            const data = await res.json();
            setChecks(data.checks || []);
            setSummary(data.summary);
            setLastScan(new Date());
        } catch (err) {
            setChecks([{ id: "scan_error", category: "Estado de Bots", status: "error", title: "No se pudo conectar al backend", detail: err.message, file: "backend/server.js" }]);
        }
        setScanning(false);
    }, []);

    useEffect(() => { runScan(); }, [runScan]);

    const handleFix = async (check) => {
        try {
            const res = await fetch(`${API}/doctor/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixId: check.fix, fixData: check.autoFixData }) });
            const data = await res.json();
            setFixResults(p => ({ ...p, [check.id]: data }));
        } catch (err) {
            setFixResults(p => ({ ...p, [check.id]: { success: false, message: err.message } }));
        }
    };

    const handleFixAll = async () => {
        const fixable = checks.filter(c => c.fixable && c.fix);
        try {
            const res = await fetch(`${API}/doctor/fix-all`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checks: fixable }) });
            setFixAllResult(await res.json());
        } catch (err) {
            setFixAllResult({ success: false, message: err.message });
        }
    };

    const grouped = {};
    for (const check of checks) {
        const cat = check.category || "General";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(check);
    }
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        return grouped[b].filter(c => c.status === "error").length - grouped[a].filter(c => c.status === "error").length;
    });

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflow: "hidden", position: "relative" }}>
            <style>{`
                @keyframes radarSweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes scanBodyMove { 0%,100%{transform:translateY(-100%)} 50%{transform:translateY(100%)} }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulseDot { 0%,100%{box-shadow:0 0 0 0 currentColor} 50%{box-shadow:0 0 0 4px transparent} }
                @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
            `}</style>

            {/* Page header */}
            <div style={{ padding: "20px 28px 0", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>🩺</span>
                    <h1 style={{ fontSize: 19, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>DoctorBot</h1>
                    {lastScan && !scanning && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginLeft: 8 }}>
                            último scan: {lastScan.toLocaleTimeString("es-AR")}
                        </span>
                    )}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
                    Diagnóstico completo del sistema — archivos, conexiones, dependencias y bots
                </p>
            </div>

            {/* Summary + restart buttons */}
            <SummaryBar summary={summary} scanning={scanning} onScan={runScan} onFixAll={handleFixAll} />

            {/* Avast-style scanner (only while scanning) */}
            <div style={{ flexShrink: 0 }}>
                <AvastScanner scanning={scanning} />
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px" }}>
                {scanning && checks.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {["Modelo IA", "Dependencias npm", "Variables .env", "Archivos del sistema", "Estado de Bots"].map((cat, i) => (
                            <div key={cat} style={{ height: 52, background: "var(--card-bg)", borderRadius: 12, border: "1px solid var(--card-border)", animation: `fadeIn 0.3s ease ${i * 0.08}s both`, overflow: "hidden", position: "relative" }}>
                                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(16,163,127,0.07), transparent)", animation: "scanBodyMove 1.6s ease-in-out infinite" }} />
                                <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--text-muted)" }}>{CAT_ICON[cat]} {cat}...</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    sortedCats.map(cat => (
                        <CategoryGroup key={cat} category={cat} checks={grouped[cat]} onFix={handleFix} fixResults={fixResults} />
                    ))
                )}
                <div style={{ height: 24 }} />
            </div>

            <FixAllResult result={fixAllResult} onClose={() => setFixAllResult(null)} />
        </div>
    );
}

export default DoctorPage;