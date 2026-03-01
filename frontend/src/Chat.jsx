import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot } from "./api";

const API = "http://localhost:3001";

const WELCOME = {
    role: "assistant",
    content: "Sistema en línea ✓\n\nHola Tobías, soy Jarvis. ¿En qué puedo ayudarte?",
    intent: null, bot: null,
};

/* ─── Typewriter ──────────────────────────────────────── */
function useTypewriter(text, speed = 12) {
    const [displayed, setDisplayed] = useState("");
    const [done, setDone] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!text) return;
        setDisplayed(""); setDone(false); let i = 0;
        ref.current = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) { clearInterval(ref.current); setDone(true); }
        }, speed);
        return () => clearInterval(ref.current);
    }, [text, speed]);
    return { displayed, done };
}

/* ─── Thinking dots ───────────────────────────────────── */
function ThinkingDots() {
    return (
        <div style={{ display: "flex", gap: 5, padding: "4px 0" }}>
            {[0, 1, 2].map(i => (
                <span key={i} style={{
                    width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "block",
                    animation: "jarvisThink 1.3s infinite ease-in-out", animationDelay: `${i * 0.18}s`,
                }} />
            ))}
        </div>
    );
}

/* ─── Inline QR Widget ────────────────────────────────── */
function InlineWhatsAppQR() {
    const [qrData, setQrData] = useState(null);
    const [status, setStatus] = useState("loading");
    const [countdown, setCountdown] = useState(60);
    const countdownRef = useRef(null);

    const fetchQR = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/whatsapp/qr`);
            const data = await res.json();
            if (data.available && data.qr) {
                setQrData(data.qr);
                setStatus("ready");
                setCountdown(data.expiresIn || 60);
                clearInterval(countdownRef.current);
                countdownRef.current = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) { clearInterval(countdownRef.current); fetchQR(); return 60; }
                        return prev - 1;
                    });
                }, 1000);
            } else if (data.status === "connected") {
                setStatus("connected");
                setQrData(null);
            } else {
                setStatus(data.status || "waiting");
            }
        } catch { setStatus("error"); }
    }, []);

    useEffect(() => {
        fetchQR();
        const iv = setInterval(() => {
            if (status !== "connected") fetchQR();
        }, 8000);
        return () => { clearInterval(iv); clearInterval(countdownRef.current); };
    }, [fetchQR]);

    if (status === "connected") {
        return (
            <div style={{ margin: "8px 0", padding: "12px 16px", background: "rgba(25,195,125,0.1)", border: "1px solid rgba(25,195,125,0.3)", borderRadius: 12, fontSize: 13, color: "#19c37d" }}>
                ✅ WhatsApp conectado — ahora te responderé en tu chat de WhatsApp
            </div>
        );
    }

    if (!qrData) {
        return (
            <div style={{ margin: "8px 0", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                    {status === "waiting" ? "Activá WhatsAppBot en la página de Bots para generar el QR..." : "Generando QR..."}
                </div>
            </div>
        );
    }

    return (
        <div style={{ margin: "8px 0" }}>
            <div style={{ fontSize: 12, color: "#9b9b9b", marginBottom: 8 }}>
                📱 Escaneá con WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </div>
            <div style={{ display: "inline-block", padding: 10, background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
                <img
                    src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`}
                    alt="WhatsApp QR"
                    style={{ width: 200, height: 200, display: "block" }}
                />
            </div>
            <div style={{ fontSize: 11, color: countdown < 15 ? "#ef4444" : "#616161", marginTop: 6 }}>
                Expira en {countdown}s
            </div>
        </div>
    );
}

/* ─── Assistant message ───────────────────────────────── */
function AssistantMessage({ msg, isNew }) {
    const { displayed, done } = useTypewriter(isNew ? msg.content : null, 12);
    const text = isNew ? displayed : msg.content;
    const isError = msg.role === "error";
    const showQR = msg.showQR;

    return (
        <div style={{ display: "flex", justifyContent: "flex-start", padding: "10px 28px", animation: isNew ? "fadeSlideUp 0.25s ease both" : "none" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 13, maxWidth: "74%" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: isError ? "#ef4444" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, marginTop: 2, boxShadow: isError ? "0 0 0 3px rgba(239,68,68,0.2)" : "0 0 0 3px rgba(16,163,127,0.2)" }}>
                    {isError ? "⚠" : "⚡"}
                </div>
                <div>
                    <div style={{ fontSize: isError ? 13 : 15, lineHeight: 1.75, color: isError ? "#f87171" : "var(--text-primary)", fontFamily: isError ? "'DM Mono', monospace" : "inherit", wordBreak: "break-word", whiteSpace: "pre-wrap", paddingTop: 4 }}>
                        {text}
                        {isNew && !done && (
                            <span style={{ display: "inline-block", width: 2, height: 16, background: "var(--accent)", marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.7s step-end infinite" }} />
                        )}
                    </div>

                    {showQR && (done || !isNew) && <InlineWhatsAppQR />}

                    {msg.intent && !isError && (
                        <div style={{ marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text-muted)", opacity: done || !isNew ? 1 : 0, transition: "opacity 0.4s ease" }}>
                            <span style={{ color: "var(--accent)", opacity: 0.7 }}>↳ {msg.intent}</span>
                            {msg.bot && msg.bot !== "unknown" && <span style={{ marginLeft: 8, opacity: 0.5 }}>via {msg.bot}</span>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── User message ────────────────────────────────────── */
function UserMessage({ msg, isNew }) {
    return (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 28px", animation: isNew ? "fadeSlideUp 0.2s ease both" : "none" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, maxWidth: "68%" }}>
                <div style={{ background: "linear-gradient(135deg, #10a37f, #0d8a6a)", borderRadius: "20px 20px 4px 20px", padding: "12px 18px", fontSize: 15, lineHeight: 1.6, color: "#fff", wordBreak: "break-word", whiteSpace: "pre-wrap", boxShadow: "0 2px 12px rgba(16,163,127,0.25)" }}>
                    {msg.content}
                    {msg.isAudio && <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 12 }}>🎤</span>}
                    {msg.isFile && <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 12 }}>📎</span>}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>T</div>
            </div>
        </div>
    );
}

/* ─── Audio Recorder ──────────────────────────────────── */
function AudioRecorder({ onTranscribed, disabled }) {
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [floatError, setFloatError] = useState(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const recordingStartRef = useRef(0);

    const showError = (msg) => {
        setFloatError(msg);
        setTimeout(() => setFloatError(null), 3000);
    };

    const getSupportedMimeType = () => {
        const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
        return types.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
    };

    const startRecording = useCallback(async () => {
        if (recording || processing) return;
        setFloatError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = getSupportedMimeType();
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            recordingStartRef.current = Date.now();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data?.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const duration = Date.now() - recordingStartRef.current;

                if (duration < 600) {
                    showError("Muy corto — mantené presionado mientras hablás");
                    setProcessing(false);
                    return;
                }

                const blob = new Blob(chunksRef.current, { type: mimeType });

                if (blob.size < 500) {
                    showError("No se detectó audio — hablá cerca del micrófono");
                    setProcessing(false);
                    return;
                }

                setProcessing(true);
                try {
                    const formData = new FormData();
                    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                    formData.append("audio", blob, `recording.${ext}`);

                    const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: formData });
                    const data = await res.json();

                    if (!data.success) {
                        showError(data.error || "Error al transcribir");
                    } else if (!data.text?.trim()) {
                        showError("No se detectó voz — intentá de nuevo");
                    } else {
                        onTranscribed(data.text.trim());
                    }
                } catch (err) {
                    showError("Error de conexión con STT");
                }
                setProcessing(false);
            };

            mediaRecorder.start(100);
            setRecording(true);
        } catch (err) {
            showError("Micrófono no disponible");
        }
    }, [recording, processing, onTranscribed]);

    const stopRecording = useCallback(() => {
        if (!recording || !mediaRecorderRef.current) return;
        setRecording(false);
        mediaRecorderRef.current.stop();
    }, [recording]);

    useEffect(() => {
        const handleGlobalUp = () => { if (recording) stopRecording(); };
        document.addEventListener("mouseup", handleGlobalUp);
        document.addEventListener("touchend", handleGlobalUp);
        return () => {
            document.removeEventListener("mouseup", handleGlobalUp);
            document.removeEventListener("touchend", handleGlobalUp);
        };
    }, [recording, stopRecording]);

    return (
        <div style={{ position: "relative", flexShrink: 0 }}>
            <button
                onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                disabled={disabled || processing}
                title={recording ? "Soltá para transcribir" : "Mantené presionado para grabar"}
                style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: recording ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(255,255,255,0.1)",
                    background: recording ? "rgba(239,68,68,0.2)" : processing ? "rgba(16,163,127,0.15)" : "transparent",
                    color: recording ? "#ef4444" : processing ? "var(--accent)" : "var(--text-muted)",
                    cursor: disabled || processing ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, transition: "all 0.15s",
                    animation: recording ? "pulseMic 1s ease-in-out infinite" : "none",
                    userSelect: "none",
                }}>
                {processing ? (
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 14 }}>⟳</span>
                ) : recording ? "⏹" : "🎤"}
            </button>

            {floatError && (
                <div style={{
                    position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
                    background: "rgba(239,68,68,0.95)", backdropFilter: "blur(8px)",
                    color: "#fff", fontSize: 12, fontWeight: 500,
                    padding: "6px 12px", borderRadius: 8,
                    whiteSpace: "nowrap", zIndex: 100,
                    boxShadow: "0 4px 16px rgba(239,68,68,0.4)",
                    animation: "fadeSlideUp 0.2s ease both",
                    pointerEvents: "none",
                }}>
                    ⚠ {floatError}
                    <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid rgba(239,68,68,0.95)" }} />
                </div>
            )}

            {recording && (
                <div style={{
                    position: "absolute", inset: -4, borderRadius: 12,
                    border: "2px solid rgba(239,68,68,0.5)",
                    animation: "ringPulse 1s ease-in-out infinite",
                    pointerEvents: "none",
                }} />
            )}
        </div>
    );
}

/* ─── File Upload Button ──────────────────────────────── */
function UploadButton({ onUpload, disabled }) {
    const ref = useRef(null);
    return (
        <>
            <input
                ref={ref}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ""; onUpload(f); } }}
            />
            <button
                onClick={() => ref.current?.click()}
                disabled={disabled}
                title="Adjuntar imagen o PDF (analizado por Gemini)"
                style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, transition: "all 0.15s" }}
            >
                📎
            </button>
        </>
    );
}

/* ─── Detect WhatsApp QR intent ───────────────────────── */
function shouldShowQR(userMsg) {
    const lower = userMsg.toLowerCase();
    return (
        (lower.includes("whatsapp") || lower.includes("wsp")) &&
        (lower.includes("qr") || lower.includes("conectar") || lower.includes("vincular") || lower.includes("escanear") || lower.includes("link"))
    );
}

/* ─── Convert Supabase message role to display role ──── */
function dbRoleToDisplay(role) {
    if (role === "user") return "user";
    if (role === "error") return "error";
    return "assistant"; // "assistant" and anything else
}

/* ═══════════════════════════════════════
   MAIN CHAT
   
   Props:
     propConvId  — conversation ID passed from App when user selects
                   an existing chat from the sidebar. null = new chat.
═══════════════════════════════════════ */
function Chat({ propConvId = null }) {
    // conversationId tracks the ACTIVE conversation for this Chat instance.
    // Initialised from propConvId so selecting a sidebar item loads it.
    const [conversationId, setConversationId] = useState(propConvId);

    const [messages, setMessages] = useState([WELCOME]);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [newMsgIdx, setNewMsgIdx] = useState(-1);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploadLabel, setUploadLabel] = useState("");
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    /* ── Load history when propConvId is provided ── */
    useEffect(() => {
        // Reset state whenever the target conversation changes
        setConversationId(propConvId);
        setHistoryLoaded(false);

        if (!propConvId) {
            // New chat — just show the welcome message
            setMessages([WELCOME]);
            return;
        }

        // Load messages for the selected conversation
        const loadHistory = async () => {
            try {
                const res = await fetch(`${API}/api/history/conversations/${propConvId}/messages`);
                const data = await res.json();

                if (Array.isArray(data) && data.length > 0) {
                    // Convert Supabase message rows → display format
                    const loaded = data.map(m => ({
                        role: dbRoleToDisplay(m.role),
                        content: m.content || "",
                        intent: m.intent || null,
                        bot: m.bot || null,
                    }));
                    setMessages(loaded);
                } else {
                    // Conversation exists but has no messages yet
                    setMessages([WELCOME]);
                }
            } catch (err) {
                console.error("Failed to load history:", err);
                setMessages([WELCOME]);
            } finally {
                setHistoryLoaded(true);
            }
        };

        loadHistory();
    }, [propConvId]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

    const handleInputChange = (e) => {
        setInput(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    };

    const addMessage = (role, content, extra = {}) => {
        setMessages(prev => {
            const next = [...prev, { role, content, ...extra }];
            setNewMsgIdx(next.length - 1);
            return next;
        });
    };

    const sendMessage = useCallback(async (text, extra = {}) => {
        const trimmed = (text || input).trim();
        if (!trimmed || loading) return;

        const wantsQR = shouldShowQR(trimmed);

        addMessage("user", trimmed, extra);
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setLoading(true);

        try {
            // Always pass conversationId (null on first message of a new chat)
            const data = await sendMessageToBot(trimmed, conversationId);

            // Backend returns conversation_id — save it for all subsequent messages
            // so they all go to the same conversation.
            if (data.conversation_id && !conversationId) {
                setConversationId(data.conversation_id);
            }

            const msgExtra = wantsQR ? { showQR: true } : {};

            addMessage(
                data.success === false ? "error" : "assistant",
                data.reply || "Sin respuesta del servidor.",
                { intent: data.intent, bot: data.bot, ...msgExtra }
            );
        } catch (err) {
            addMessage("error", `Error de conexión: ${err.message}`);
        }
        setLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [input, loading, conversationId]);

    const handleTranscribed = (text) => {
        if (text.trim()) sendMessage(text, { isAudio: true });
    };

    const handleUpload = async (file) => {
        setUploadLabel(`📎 ${file.name}`);
        setLoading(true);
        addMessage("user", `[Archivo: ${file.name}]`, { isFile: true });

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("query", input.trim() || "Analizá este archivo detalladamente. Si es un documento, resumí su contenido y extraé los datos importantes.");

            const res = await fetch(`${API}/api/upload`, { method: "POST", body: formData });
            const data = await res.json();

            addMessage(
                data.success === false ? "error" : "assistant",
                data.reply || "No se pudo procesar.",
                { intent: data.intent, bot: data.bot }
            );
        } catch (err) {
            addMessage("error", `Error al procesar archivo: ${err.message}`);
        }
        setLoading(false);
        setUploadLabel("");
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    return (
        <div className="chat-area">
            <style>{`
                @keyframes jarvisThink { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }
                @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
                @keyframes pulseMic { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
                @keyframes ringPulse { 0%, 100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 0.3; transform: scale(1.1); } }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>

            <div className="chat-header">
                <div>
                    <div className="chat-header-title">Jarvis</div>
                    <div className="chat-header-subtitle">LLaMA 13B · LM Studio · localhost:3001</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {conversationId && (
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-muted)", opacity: 0.5 }}>
                            #{conversationId.slice(-6)}
                        </div>
                    )}
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text-muted)" }}>
                        {messages.length - 1} msgs
                    </div>
                </div>
            </div>

            <div className="chat-box" style={{ paddingTop: 12 }}>
                {/* Loading indicator while fetching history */}
                {propConvId && !historyLoaded && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
                        <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 8 }}>⟳</span>
                        Cargando historial...
                    </div>
                )}

                {(!propConvId || historyLoaded) && messages.map((msg, i) => {
                    const isNew = i === newMsgIdx;
                    if (msg.role === "user") return <UserMessage key={i} msg={msg} isNew={isNew} />;
                    return <AssistantMessage key={i} msg={msg} isNew={isNew} />;
                })}

                {loading && (
                    <div style={{ display: "flex", padding: "10px 28px", animation: "fadeSlideUp 0.2s ease both" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 0 0 3px rgba(16,163,127,0.2)" }}>⚡</div>
                            <ThinkingDots />
                        </div>
                    </div>
                )}

                <div ref={bottomRef} style={{ height: 1 }} />
            </div>

            <div className="input-area">
                <div style={{ width: "100%", maxWidth: 760 }}>
                    {uploadLabel && (
                        <div style={{ padding: "6px 14px", marginBottom: 8, background: "var(--accent-light)", border: "1px solid var(--accent-border)", borderRadius: 8, fontSize: 12, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>
                            {uploadLabel}
                        </div>
                    )}
                    <div className="input-form">
                        <UploadButton onUpload={handleUpload} disabled={loading} />
                        <AudioRecorder onTranscribed={handleTranscribed} disabled={loading} />
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe un mensaje... o mantené 🎤 para hablar"
                            disabled={loading}
                            rows={1}
                            autoFocus
                        />
                        <button
                            className="send-btn"
                            onClick={() => sendMessage()}
                            disabled={loading || !input.trim()}
                            title="Enviar (Enter)"
                        >↑</button>
                    </div>
                    <div className="input-hint">
                        Enter para enviar · Shift+Enter nueva línea · 📎 imagen/PDF (Gemini) · 🎤 mantener para hablar
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Chat;