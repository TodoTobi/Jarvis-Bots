/**
 * WhatsAppQR.jsx — Shows WhatsApp QR code to link device
 *
 * Usage: Add to DevicesPage or SettingsPage
 *  <WhatsAppQR />
 *
 * Flow:
 *  1. Component polls /api/whatsapp/status
 *  2. If qr_ready, fetches /api/whatsapp/qr and renders QR image
 *  3. Once connected, shows green confirmation with phone number
 *  4. QR refreshes automatically before it expires
 *
 * WhatsApp Bot setup:
 *  The bot needs to be active. QR appears in the backend terminal first —
 *  this component fetches and displays it as a base64 image in the UI.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

const API = "http://localhost:3001/api";

function WhatsAppQR() {
    const [status, setStatus] = useState("disconnected");
    const [qrData, setQrData] = useState(null);
    const [phone, setPhone] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [countdown, setCountdown] = useState(60);
    const pollRef = useRef(null);
    const countdownRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API}/whatsapp/status`);
            const data = await res.json();
            setStatus(data.status);
            setPhone(data.phone);

            if (data.qrAvailable) {
                fetchQR();
            } else if (data.status === "connected") {
                setQrData(null);
                clearInterval(countdownRef.current);
            }
        } catch (err) {
            setError("No se pudo conectar al backend");
        }
    }, []);

    const fetchQR = async () => {
        try {
            const res = await fetch(`${API}/whatsapp/qr`);
            const data = await res.json();
            if (data.available && data.qr) {
                setQrData(data.qr);
                setCountdown(data.expiresIn || 60);
                // Start countdown
                clearInterval(countdownRef.current);
                countdownRef.current = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(countdownRef.current);
                            setQrData(null);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            } else {
                setQrData(null);
            }
        } catch { }
    };

    const handleActivate = async () => {
        setLoading(true);
        setError(null);
        try {
            // Activating the bot triggers QR generation
            const res = await fetch(`${API}/whatsapp/qr`);
            const data = await res.json();
            if (data.available && data.qr) {
                setQrData(data.qr);
                setStatus("qr_ready");
            } else {
                setStatus(data.status || "connecting");
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleDisconnect = async () => {
        try {
            await fetch(`${API}/whatsapp/disconnect`, { method: "POST" });
            setStatus("disconnected");
            setQrData(null);
            setPhone(null);
        } catch { }
    };

    useEffect(() => {
        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 5000);
        return () => {
            clearInterval(pollRef.current);
            clearInterval(countdownRef.current);
        };
    }, [fetchStatus]);

    /* ── Connected state ── */
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
                            Jarvis responderá tus mensajes de WhatsApp automáticamente
                        </div>
                    </div>
                </div>
                <button onClick={handleDisconnect}
                    style={{ marginTop: 16, background: "transparent", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: "6px 16px", color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    Desconectar
                </button>
            </div>
        );
    }

    /* ── QR ready state ── */
    if (status === "qr_ready" && qrData) {
        return (
            <div style={{
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: 16, padding: "28px", textAlign: "center",
            }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    📱 Escaneá con WhatsApp
                </div>
                <div style={{ fontSize: 12, color: "#9b9b9b", marginBottom: 20 }}>
                    Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo
                </div>

                {/* QR Image */}
                <div style={{
                    display: "inline-block", padding: 12,
                    background: "#fff", borderRadius: 12,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                    marginBottom: 16,
                }}>
                    {qrData.startsWith("data:") ? (
                        <img src={qrData} alt="WhatsApp QR" style={{ width: 220, height: 220, display: "block" }} />
                    ) : (
                        <img src={`data:image/png;base64,${qrData}`} alt="WhatsApp QR" style={{ width: 220, height: 220, display: "block" }} />
                    )}
                </div>

                <div style={{ fontSize: 12, color: countdown < 15 ? "#ef4444" : "#616161" }}>
                    Expira en {countdown}s
                    {countdown < 15 && " — refrescando..."}
                </div>

                <div style={{ marginTop: 12, fontSize: 11, color: "#616161", lineHeight: 1.6 }}>
                    💡 <strong>Fin:</strong> Mandá mensajes a vos mismo en WhatsApp y Jarvis te responderá con IA
                </div>
            </div>
        );
    }

    /* ── Disconnected / default state ── */
    return (
        <div style={{
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: 16, padding: "24px 28px",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>💬</span>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>WhatsApp Bot</div>
                    <div style={{ fontSize: 12, color: status === "connecting" ? "var(--accent)" : "#9b9b9b", marginTop: 2 }}>
                        {status === "connecting" ? "⟳ Generando QR..." : "No conectado"}
                    </div>
                </div>
            </div>

            <div style={{ fontSize: 13, color: "#9b9b9b", lineHeight: 1.6, marginBottom: 20 }}>
                Conectá tu WhatsApp para que Jarvis responda tus propios mensajes con IA.
                Mandás un mensaje a tu número y Jarvis responde automáticamente.
            </div>

            {error && (
                <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8, fontSize: 12, color: "#ef4444", marginBottom: 12 }}>
                    ⚠ {error}
                </div>
            )}

            <button onClick={handleActivate} disabled={loading || status === "connecting"}
                style={{
                    background: status === "connecting" ? "transparent" : "var(--accent)",
                    border: status === "connecting" ? "1px solid rgba(16,163,127,0.4)" : "none",
                    borderRadius: 10, padding: "10px 24px",
                    color: status === "connecting" ? "var(--accent)" : "#fff",
                    fontSize: 14, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: loading || status === "connecting" ? "wait" : "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                {loading || status === "connecting"
                    ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Generando QR...</>
                    : "📱 Conectar WhatsApp"}
            </button>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default WhatsAppQR;