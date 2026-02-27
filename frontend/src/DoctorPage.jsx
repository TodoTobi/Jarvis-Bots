import React, { useState, useEffect, useCallback } from "react";

const API = "http://localhost:3001/api";

/* ─── Status config ───────────────────────────────────── */
const STATUS = {
    ok: { color: "#19c37d", bg: "rgba(25,195,125,0.10)", label: "OK", icon: "✓" },
    warn: { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", label: "Aviso", icon: "!" },
    error: { color: "#ef4444", bg: "rgba(239,68,68,0.10)", label: "Error", icon: "✕" },
    loading: { color: "#6b7280", bg: "rgba(107,114,128,0.10)", label: "...", icon: "·" },
};

/* ─── Category icons ──────────────────────────────────── */
const CAT_ICON = {
    "Modelo IA": "🧠",
    "Dependencias npm": "📦",
    "Variables .env": "🔑",
    "Archivos del sistema": "📁",
    "Estado de Bots": "🤖",
    "Errores Recientes (error.log)": "🪵",
};

/* ─── Scan animation line ─────────────────────────────── */
function ScanLine({ active }) {
    if (!active) return null;
    return (
        <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "2px",
            background: "linear-gradient(90deg, transparent, #10a37f, transparent)",
            animation: "scanMove 1.4s ease-in-out infinite",
            pointerEvents: "none", zIndex: 2
        }} />
    );
}

/* ─── Status badge ────────────────────────────────────── */
function Badge({ status }) {
    const s = STATUS[status] || STATUS.loading;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "20px", height: "20px", borderRadius: "50%",
            background: s.bg, border: `1.5px solid ${s.color}`,
            fontSize: "11px", fontWeight: 700, color: s.color,
            fontFamily: "'DM Mono', monospace", flexShrink: 0,
            boxShadow: `0 0 6px ${s.color}33`
        }}>
            {s.icon}
        </span>
    );
}

/* ─── Pulsing status dot ──────────────────────────────── */
function PulseDot({ status, size = 9 }) {
    const s = STATUS[status] || STATUS.loading;
    return (
        <span style={{
            display: "inline-block", width: size, height: size, borderRadius: "50%",
            background: s.color, flexShrink: 0,
            animation: status === "ok" || status === "loading" ? "pulseDot 2.5s ease-in-out infinite" : "none",
            boxShadow: `0 0 0 0 ${s.color}55`
        }} />
    );
}

/* ─── Summary bar at top ──────────────────────────────── */
function SummaryBar({ summary, scanning, onScan, onFixAll }) {
    const total = summary?.total || 0;
    const ok = summary?.ok || 0;
    const warns = summary?.warns || 0;
    const errs = summary?.errors || 0;
    const health = total > 0 ? Math.round((ok / total) * 100) : 0;
    const healthColor = errs > 0 ? "#ef4444" : warns > 0 ? "#f59e0b" : "#19c37d";

    return (
        <div style={{
            display: "flex", alignItems: "center", gap: "20px",
            padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0, flexWrap: "wrap"
        }}>
            {/* Health score */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{
                    width: "54px", height: "54px", borderRadius: "50%",
                    border: `3px solid ${healthColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", flexShrink: 0,
                    boxShadow: `0 0 16px ${healthColor}33`
                }}>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: healthColor, lineHeight: 1 }}>
                        {scanning ? "…" : `${health}%`}
                    </span>
                </div>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {scanning ? "Escaneando sistema..." : errs > 0 ? "Sistema con errores" : warns > 0 ? "Sistema con avisos" : "Sistema saludable"}
                    </div>
                    {!scanning && total > 0 && (
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "'DM Mono', monospace" }}>
                            <span style={{ color: "#19c37d" }}>✓ {ok}</span>
                            <span style={{ margin: "0 8px", color: "#f59e0b" }}>! {warns}</span>
                            <span style={{ color: "#ef4444" }}>✕ {errs}</span>
                            <span style={{ marginLeft: "8px" }}>/ {total} checks</span>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "10px" }}>
                {errs > 0 && !scanning && (
                    <button onClick={onFixAll}
                        style={{
                            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
                            borderRadius: "9px", padding: "9px 18px",
                            color: "#ef4444", fontSize: "13px", fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "7px"
                        }}>
                        🔧 Solucionar Todo
                    </button>
                )}
                <button onClick={onScan} disabled={scanning}
                    style={{
                        background: scanning ? "rgba(255,255,255,0.05)" : "var(--accent)",
                        border: "none", borderRadius: "9px", padding: "9px 18px",
                        color: scanning ? "var(--text-muted)" : "#fff",
                        fontSize: "13px", fontWeight: 600,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: scanning ? "wait" : "pointer",
                        display: "flex", alignItems: "center", gap: "7px"
                    }}>
                    {scanning ? (
                        <>
                            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                            Escaneando...
                        </>
                    ) : "🔍 Escanear"}
                </button>
            </div>
        </div>
    );
}

/* ─── Check row ───────────────────────────────────────── */
function CheckRow({ check, onFix, fixResult }) {
    const [expanded, setExpanded] = useState(false);
    const s = STATUS[check.status] || STATUS.loading;

    return (
        <div style={{
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: expanded ? "rgba(255,255,255,0.025)" : "transparent",
            transition: "background 0.15s"
        }}>
            {/* Main row */}
            <div
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "11px 16px", cursor: "pointer",
                    userSelect: "none"
                }}>
                <Badge status={check.status} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                            {check.title}
                        </span>
                        {check.status === "error" && check.fixable && (
                            <span style={{
                                fontSize: "10px", background: "rgba(239,68,68,0.15)",
                                color: "#ef4444", borderRadius: "4px",
                                padding: "1px 6px", fontWeight: 600
                            }}>fixable</span>
                        )}
                    </div>
                    {!expanded && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {check.detail}
                        </div>
                    )}
                </div>

                <span style={{ fontSize: "11px", color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div style={{ padding: "0 16px 14px 48px" }}>
                    {/* Detail */}
                    <div style={{
                        background: "rgba(0,0,0,0.25)", borderRadius: "8px",
                        padding: "10px 14px", marginBottom: "10px",
                        fontFamily: "'DM Mono', monospace", fontSize: "12px",
                        color: s.color, lineHeight: "1.6", wordBreak: "break-all"
                    }}>
                        {check.detail}
                    </div>

                    {/* File reference */}
                    {check.file && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px" }}>
                            📁 <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--text-secondary)" }}>{check.file}</span>
                            {check.line && <span style={{ marginLeft: "8px", color: "#f59e0b" }}>→ {check.line}</span>}
                        </div>
                    )}

                    {/* Fix result */}
                    {fixResult && (
                        <div style={{
                            padding: "8px 12px", borderRadius: "8px", marginBottom: "8px",
                            background: fixResult.success ? "rgba(25,195,125,0.1)" : "rgba(245,158,11,0.1)",
                            border: `1px solid ${fixResult.success ? "rgba(25,195,125,0.3)" : "rgba(245,158,11,0.3)"}`,
                            fontSize: "12px",
                            color: fixResult.success ? "#19c37d" : "#f59e0b",
                            fontFamily: "'DM Mono', monospace", lineHeight: "1.6",
                            whiteSpace: "pre-wrap"
                        }}>
                            {fixResult.message}
                            {fixResult.cmd && (
                                <div style={{ marginTop: "8px", background: "rgba(0,0,0,0.3)", padding: "6px 10px", borderRadius: "4px", color: "#19c37d" }}>
                                    $ {fixResult.cmd}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Fix button */}
                    {check.fixable && check.fix && !fixResult && (
                        <button onClick={(e) => { e.stopPropagation(); onFix(check); }}
                            style={{
                                background: "rgba(16,163,127,0.15)", border: "1px solid rgba(16,163,127,0.4)",
                                borderRadius: "7px", padding: "6px 14px",
                                color: "var(--accent)", fontSize: "12px", fontWeight: 600,
                                fontFamily: "'DM Sans', sans-serif", cursor: "pointer"
                            }}>
                            🔧 Aplicar Fix
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── Category group ──────────────────────────────────── */
function CategoryGroup({ category, checks, onFix, fixResults }) {
    const [open, setOpen] = useState(true);
    const errors = checks.filter(c => c.status === "error").length;
    const warns = checks.filter(c => c.status === "warn").length;

    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: "12px", overflow: "hidden", marginBottom: "12px"
        }}>
            {/* Category header */}
            <div
                onClick={() => setOpen(p => !p)}
                style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "12px 16px", cursor: "pointer",
                    borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none",
                    userSelect: "none"
                }}>
                <span style={{ fontSize: "16px" }}>{CAT_ICON[category] || "📋"}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                    {category}
                </span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {errors > 0 && (
                        <span style={{ fontSize: "11px", color: "#ef4444", fontFamily: "'DM Mono', monospace" }}>
                            ✕ {errors}
                        </span>
                    )}
                    {warns > 0 && (
                        <span style={{ fontSize: "11px", color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>
                            ! {warns}
                        </span>
                    )}
                    {errors === 0 && warns === 0 && (
                        <span style={{ fontSize: "11px", color: "#19c37d", fontFamily: "'DM Mono', monospace" }}>
                            ✓ OK
                        </span>
                    )}
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                </div>
            </div>

            {open && (
                <div>
                    {checks.map(check => (
                        <CheckRow
                            key={check.id}
                            check={check}
                            onFix={onFix}
                            fixResult={fixResults[check.id]}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Fix All result modal ────────────────────────────── */
function FixAllResult({ result, onClose }) {
    if (!result) return null;
    return (
        <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "16px", padding: "28px 32px", maxWidth: "520px", width: "90%",
                maxHeight: "80vh", overflowY: "auto"
            }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>
                    🔧 Resultado de Fix-All
                </h3>
                <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: "12px",
                    color: "var(--text-secondary)", lineHeight: "1.8",
                    background: "rgba(0,0,0,0.3)", borderRadius: "8px",
                    padding: "14px", whiteSpace: "pre-wrap"
                }}>
                    {result.message}
                </div>
                {result.manual?.length > 0 && (
                    <div style={{ marginTop: "16px" }}>
                        <p style={{ fontSize: "12px", color: "#f59e0b", marginBottom: "8px" }}>Ejecutá en la terminal del backend:</p>
                        {result.manual.map((cmd, i) => (
                            <div key={i} style={{
                                background: "rgba(0,0,0,0.4)", borderRadius: "6px",
                                padding: "8px 12px", fontFamily: "'DM Mono', monospace",
                                fontSize: "13px", color: "#19c37d", marginBottom: "6px"
                            }}>
                                $ {cmd}
                            </div>
                        ))}
                    </div>
                )}
                <button onClick={onClose} style={{
                    marginTop: "20px", background: "var(--accent)", border: "none",
                    borderRadius: "8px", padding: "9px 22px", color: "#fff",
                    fontSize: "13px", fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif"
                }}>
                    Cerrar
                </button>
            </div>
        </div>
    );
}

/* ─── Main DoctorPage ─────────────────────────────────── */
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
            setChecks([{
                id: "scan_error", category: "Estado de Bots",
                status: "error", title: "No se pudo conectar al backend",
                detail: err.message, file: "backend/server.js"
            }]);
        }
        setScanning(false);
    }, []);

    // Auto-scan on mount
    useEffect(() => { runScan(); }, [runScan]);

    const handleFix = async (check) => {
        try {
            const res = await fetch(`${API}/doctor/fix`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fixId: check.fix, fixData: check.autoFixData })
            });
            const data = await res.json();
            setFixResults(p => ({ ...p, [check.id]: data }));
        } catch (err) {
            setFixResults(p => ({ ...p, [check.id]: { success: false, message: err.message } }));
        }
    };

    const handleFixAll = async () => {
        const fixable = checks.filter(c => c.fixable && c.fix);
        try {
            const res = await fetch(`${API}/doctor/fix-all`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ checks: fixable })
            });
            const data = await res.json();
            setFixAllResult(data);
        } catch (err) {
            setFixAllResult({ success: false, message: err.message });
        }
    };

    // Group checks by category
    const grouped = {};
    for (const check of checks) {
        const cat = check.category || "General";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(check);
    }

    // Sort categories: errors first
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const aErrors = grouped[a].filter(c => c.status === "error").length;
        const bErrors = grouped[b].filter(c => c.status === "error").length;
        return bErrors - aErrors;
    });

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--main-bg)", overflow: "hidden", position: "relative" }}>
            <style>{`
                @keyframes scanMove  { 0%,100%{opacity:0;transform:translateY(-4px)} 50%{opacity:1;transform:translateY(calc(100vh - 2px))} }
                @keyframes pulseDot  { 0%,100%{box-shadow:0 0 0 0 currentColor} 50%{box-shadow:0 0 0 4px transparent} }
                @keyframes spin      { to{transform:rotate(360deg)} }
                @keyframes fadeIn    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
            `}</style>

            {/* Animated scan line */}
            <ScanLine active={scanning} />

            {/* Page header */}
            <div style={{ padding: "22px 28px 0", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "20px" }}>🩺</span>
                    <h1 style={{ fontSize: "19px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                        DoctorBot
                    </h1>
                    {lastScan && !scanning && (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginLeft: "8px" }}>
                            último scan: {lastScan.toLocaleTimeString("es-AR")}
                        </span>
                    )}
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Diagnóstico completo del sistema — archivos, conexiones, dependencias y bots
                </p>
            </div>

            {/* Summary bar */}
            <SummaryBar
                summary={summary}
                scanning={scanning}
                onScan={runScan}
                onFixAll={handleFixAll}
            />

            {/* Check groups */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
                {scanning && checks.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {["Modelo IA", "Dependencias npm", "Variables .env", "Archivos del sistema", "Estado de Bots"].map((cat, i) => (
                            <div key={cat} style={{
                                height: "52px", background: "var(--card-bg)",
                                borderRadius: "12px", border: "1px solid var(--card-border)",
                                animation: `fadeIn 0.3s ease ${i * 0.08}s both`,
                                overflow: "hidden", position: "relative"
                            }}>
                                <div style={{
                                    position: "absolute", inset: 0,
                                    background: "linear-gradient(90deg, transparent, rgba(16,163,127,0.07), transparent)",
                                    animation: "scanMove 1.6s ease-in-out infinite"
                                }} />
                                <div style={{ padding: "16px 18px", fontSize: "13px", color: "var(--text-muted)" }}>
                                    {CAT_ICON[cat]} {cat}...
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    sortedCats.map(cat => (
                        <CategoryGroup
                            key={cat}
                            category={cat}
                            checks={grouped[cat]}
                            onFix={handleFix}
                            fixResults={fixResults}
                        />
                    ))
                )}
                <div style={{ height: "24px" }} />
            </div>

            {/* Fix-all modal */}
            <FixAllResult result={fixAllResult} onClose={() => setFixAllResult(null)} />
        </div>
    );
}

export default DoctorPage;