/**
 * WhatsAppQR.jsx — Shows WhatsApp QR code to link device
 *
 * FIX: The bot auto-connects from saved session (no QR needed).
 *      This component now correctly detects that state and shows
 *      the "connected" UI instead of staying stuck on "connecting".
 *
 * Polling: every 4 seconds hits /api/whatsapp/qr which returns:
 *   { available: bool, qr: string|null, status: string, phone: string|null }
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

const API = "http://localhost:3001/api";
const POLL_MS = 4000;

function WhatsAppQR() {
    const [status, setStatus] = useState("idle");        // idle | connecting | qr_ready | connected | error
    const [qrData, setQrData] = useState(null);          // base64 QR image
    const [phone, setPhone] = useState(null);
    const [countdown, setCountdown] = useState(60);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const pollRef = useRef(null);
    const countdownRef = useRef(null);

    /* ── Poll /api/whatsapp/qr ── */
    const pollQR = useCallback(async () => {
        try {
            const res = await fetch(`${API}/whatsapp/qr`);
            const data = await res.json();

            /* Backend should return one of:
               { available: false, status: "connected", phone: "549..." }
               { available: true,  qr: "data:image/png;base64,...", expiresIn: 60 }
               { available: false, status: "connecting" }
               { available: false, status: "disconnected" }
            */

            if (data.status === "connected" || (!data.available && data.phone)) {
                // Already connected (saved session auto-authenticated)
                setStatus("connected");
                setPhone(data.phone || null);
                setQrData(null);
                clearInterval(countdownRef.current);
                return;
            }

            if (data.available && data.qr) {
                setQrData(data.qr);
                setStatus("qr_ready");
                // Reset countdown
                const expires = data.expiresIn || 60;
                setCountdown(expires);
                clearInterval(countdownRef.current);
                countdownRef.current = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(countdownRef.current);
                            setQrData(null);
                            setStatus("connecting"); // QR expired, wait for new one
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
                return;
            }

            // Not connected, no QR yet
            if (data.status === "connecting" || data.status === "initializing") {
                setStatus("connecting");
            } else if (data.status === "disconnected" && status !== "idle") {
                setStatus("disconnected");
            }

        } catch (err) {
            setError("No se pudo conectar al backend");
        }
    }, [status]);

    /* ── On mount: check current state ── */
    useEffect(() => {
        pollQR(); // immediate first check
        pollRef.current = setInterval(pollQR, POLL_MS);
        return () => {
            clearInterval(pollRef.current);
            clearInterval(countdownRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Activate / Connect ── */
    const handleActivate = async () => {
        setLoading(true);
        setError(null);
        setStatus("connecting");
        try {
            // Calling /api/whatsapp/qr activates the bot and starts QR generation
            const res = await fetch(`${API}/whatsapp/qr`);
            const data = await res.json();

            if (data.status === "connected" && data.phone) {
                setStatus("connected");
                setPhone(data.phone);
            } else if (data.available && data.qr) {
                setQrData(data.qr);
                setStatus("qr_ready");
            }
            // else: bot is initializing, polling will catch it
        } catch (err) {
            setError(err.message);
            setStatus("idle");
        }
        setLoading(false);
    };

    /* ── Disconnect ── */
    const handleDisconnect = async () => {
        try {
            await fetch(`${API}/whatsapp/disconnect`, { method: "POST" });
        } catch { }
        setStatus("idle");
        setQrData(null);
        setPhone(null);
    };

    /* ══════════════════════════════════════
       RENDERS
    ══════════════════════════════════════ */

    /* Connected */
    if (status === "connected" && phone) {
        return (
            <div style={{
                background: "rgba(25,195,125,0.08)", border: "1px solid rgba(25,195,125,0.25)",
                borderRadius: 16, padding: "24px 28px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ fontSize: 36 }}>✅</div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#19c37d" }}>WhatsApp Conectado</div>
                        <div style={{ fontSize: 13, color: "#9b9b9b", marginTop: 3 }}>
                            Número: <span style={{ fontFamily: "'DM Mono', monospace", color: "#ececec" }}>+{phone}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#616161", marginTop: 4 }}>
                            Jarvis responde tus mensajes automáticamente. Podés pedirle recordatorios,
                            info y más directo desde WhatsApp.
                        </div>
                    </div>
                </div>
                <button onClick={handleDisconnect} style={{
                    marginTop: 16, background: "transparent",
                    border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8,
                    padding: "6px 16px", color: "#ef4444", fontSize: 12,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif"
                }}>
                    Desconectar
                </button>
            </div>
        );
    }

    /* Connected but no phone yet (just detected status=connected) */
    if (status === "connected" && !phone) {
        return (
            <div style={{
                background: "rgba(25,195,125,0.08)", border: "1px solid rgba(25,195,125,0.25)",
                borderRadius: 16, padding: "24px 28px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ fontSize: 36 }}>✅</div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#19c37d" }}>WhatsApp Conectado</div>
                        <div style={{ fontSize: 13, color: "#9b9b9b", marginTop: 3 }}>Sesión activa</div>
                    </div>
                </div>
                <button onClick={handleDisconnect} style={{
                    marginTop: 16, background: "transparent",
                    border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8,
                    padding: "6px 16px", color: "#ef4444", fontSize: 12,
                    cursor: "pointer",
                }}>Desconectar</button>
            </div>
        );
    }

    /* QR Ready */
    if (status === "qr_ready" && qrData) {
        const src = qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`;
        return (
            <div style={{
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: 16, padding: "28px", textAlign: "center",
            }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    📱 Escaneá con WhatsApp
                </div>
                <div style={{ fontSize: 12, color: "#9b9b9b", marginBottom: 20 }}>
                    Abrí WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo
                </div>
                <div style={{
                    display: "inline-block", padding: 12, background: "#fff",
                    borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", marginBottom: 16,
                }}>
                    <img src={src} alt="WhatsApp QR" style={{ width: 220, height: 220, display: "block" }} />
                </div>
                <div style={{ fontSize: 12, color: countdown < 15 ? "#ef4444" : "#616161" }}>
                    Expira en {countdown}s {countdown < 15 && "— refrescando..."}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: "#616161", lineHeight: 1.6 }}>
                    💡 Una vez vinculado, mandá cualquier mensaje a tu propio número y Jarvis responderá
                </div>
            </div>
        );
    }

    /* Connecting */
    if (status === "connecting") {
        return (
            <div style={{
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: 16, padding: "24px 28px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>💬</span>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>WhatsApp Bot</div>
                        <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-block", animation: "waSpin 1s linear infinite" }}>⟳</span>
                            Conectando...
                        </div>
                    </div>
                </div>
                <div style={{ fontSize: 12, color: "#616161" }}>
                    El bot se está inicializando. Si ya vinculaste tu WhatsApp antes, debería conectarse solo en unos segundos.
                </div>
                <style>{`@keyframes waSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    /* Default: disconnected / idle */
    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: 16, padding: "24px 28px",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>💬</span>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>WhatsApp Bot</div>
                    <div style={{ fontSize: 12, color: "#9b9b9b", marginTop: 2 }}>No conectado</div>
                </div>
            </div>

            <div style={{ fontSize: 13, color: "#9b9b9b", lineHeight: 1.6, marginBottom: 20 }}>
                Conectá tu WhatsApp para que Jarvis responda tus mensajes con IA.
                También podés pedirle desde el chat web que te mande recordatorios por WhatsApp.
            </div>

            {error && (
                <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8, fontSize: 12, color: "#ef4444", marginBottom: 12 }}>
                    ⚠ {error}
                </div>
            )}

            <button onClick={handleActivate} disabled={loading} style={{
                background: "var(--accent)", border: "none", borderRadius: 10,
                padding: "10px 24px", color: "#fff", fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: loading ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
            }}>
                {loading
                    ? <><span style={{ animation: "waSpin 1s linear infinite", display: "inline-block" }}>⟳</span> Iniciando...</>
                    : "📱 Conectar WhatsApp"}
            </button>
            <style>{`@keyframes waSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default WhatsAppQR;