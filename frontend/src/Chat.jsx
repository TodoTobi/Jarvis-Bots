import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot } from "./api";

const WELCOME = {
    role: "assistant",
    content: "Sistema en línea ✓\n\nHola Tobías, soy Jarvis. ¿En qué puedo ayudarte?",
    intent: null, bot: null
};

/* ─── Typewriter hook ─────────────────────────────────── */
function useTypewriter(text, speed = 18) {
    const [displayed, setDisplayed] = useState("");
    const [done, setDone] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!text) return;
        setDisplayed("");
        setDone(false);
        let i = 0;
        ref.current = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) {
                clearInterval(ref.current);
                setDone(true);
            }
        }, speed);
        return () => clearInterval(ref.current);
    }, [text, speed]);

    return { displayed, done };
}

/* ─── Thinking dots ───────────────────────────────────── */
function ThinkingDots() {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 0" }}>
            {[0, 1, 2].map(i => (
                <span key={i} style={{
                    width: "7px", height: "7px", borderRadius: "50%",
                    background: "var(--accent)", display: "block",
                    animation: "jarvisThink 1.3s infinite ease-in-out",
                    animationDelay: `${i * 0.18}s`
                }} />
            ))}
        </div>
    );
}

/* ─── Assistant message with typewriter ──────────────── */
function AssistantMessage({ msg, isNew }) {
    const { displayed, done } = useTypewriter(isNew ? msg.content : null, 12);
    const text = isNew ? displayed : msg.content;
    const isError = msg.role === "error";

    return (
        <div style={{
            display: "flex", justifyContent: "flex-start",
            padding: "10px 28px",
            animation: isNew ? "fadeSlideUp 0.25s ease both" : "none"
        }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "13px", maxWidth: "74%" }}>
                {/* Avatar */}
                <div style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: isError ? "#ef4444" : "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "15px", flexShrink: 0, marginTop: "2px",
                    boxShadow: isError ? "0 0 0 3px rgba(239,68,68,0.2)" : "0 0 0 3px rgba(16,163,127,0.2)"
                }}>
                    {isError ? "⚠" : "⚡"}
                </div>

                {/* Text */}
                <div>
                    <div style={{
                        fontSize: "15px", lineHeight: "1.75",
                        color: isError ? "#f87171" : "var(--text-primary)",
                        fontFamily: isError ? "'DM Mono', monospace" : "inherit",
                        fontSize: isError ? "13px" : "15px",
                        wordBreak: "break-word", whiteSpace: "pre-wrap",
                        paddingTop: "4px"
                    }}>
                        {text}
                        {isNew && !done && (
                            <span style={{
                                display: "inline-block", width: "2px", height: "16px",
                                background: "var(--accent)", marginLeft: "2px",
                                verticalAlign: "text-bottom",
                                animation: "cursorBlink 0.7s step-end infinite"
                            }} />
                        )}
                    </div>

                    {msg.intent && !isError && (
                        <div style={{
                            marginTop: "8px", fontFamily: "'DM Mono', monospace",
                            fontSize: "11px", color: "var(--text-muted)",
                            opacity: done || !isNew ? 1 : 0,
                            transition: "opacity 0.4s ease"
                        }}>
                            <span style={{ color: "var(--accent)", opacity: 0.7 }}>↳ {msg.intent}</span>
                            {msg.bot && msg.bot !== "unknown" && (
                                <span style={{ marginLeft: "8px", opacity: 0.5 }}>via {msg.bot}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── User message: right side with bubble ────────────── */
function UserMessage({ msg, isNew }) {
    return (
        <div style={{
            display: "flex", justifyContent: "flex-end",
            padding: "8px 28px",
            animation: isNew ? "fadeSlideUp 0.2s ease both" : "none"
        }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", maxWidth: "68%" }}>
                <div style={{
                    background: "linear-gradient(135deg, #10a37f, #0d8a6a)",
                    borderRadius: "20px 20px 4px 20px",
                    padding: "12px 18px",
                    fontSize: "15px", lineHeight: "1.6",
                    color: "#fff",
                    wordBreak: "break-word", whiteSpace: "pre-wrap",
                    boxShadow: "0 2px 12px rgba(16,163,127,0.25)"
                }}>
                    {msg.content}
                </div>

                {/* User avatar */}
                <div style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)",
                    flexShrink: 0, letterSpacing: "0"
                }}>T</div>
            </div>
        </div>
    );
}

/* ─── File upload button ──────────────────────────────── */
function UploadButton({ onUpload, disabled }) {
    const ref = useRef(null);

    const handleChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        onUpload(file);
    };

    return (
        <>
            <input ref={ref} type="file" accept="image/*,application/pdf,audio/*"
                style={{ display: "none" }} onChange={handleChange} />
            <button
                onClick={() => ref.current?.click()}
                disabled={disabled}
                title="Adjuntar imagen, PDF o audio"
                style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent", color: "var(--text-muted)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "16px", flexShrink: 0,
                    transition: "all 0.15s"
                }}>
                📎
            </button>
        </>
    );
}

/* ─── Main Chat ───────────────────────────────────────── */
function Chat() {
    const [messages, setMessages] = useState([WELCOME]);
    const [newMsgIdx, setNewMsgIdx] = useState(-1);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploadLabel, setUploadLabel] = useState("");
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

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

    const sendMessage = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || loading) return;

        addMessage("user", trimmed);
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setLoading(true);

        try {
            const data = await sendMessageToBot(trimmed);
            addMessage(
                data.success === false ? "error" : "assistant",
                data.reply || "Sin respuesta del servidor.",
                { intent: data.intent, bot: data.bot }
            );
        } catch (err) {
            addMessage("error", `Error de conexión: ${err.message}`);
        }

        setLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [input, loading]);

    const handleUpload = async (file) => {
        setUploadLabel(`📎 ${file.name}`);
        setLoading(true);
        addMessage("user", `[Archivo adjunto: ${file.name}]`);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("query", input.trim() || "Analizá este archivo");

            const res = await fetch("http://localhost:3001/api/upload", {
                method: "POST", body: formData
            });
            const data = await res.json();
            addMessage(
                data.success === false ? "error" : "assistant",
                data.reply || "No se pudo procesar el archivo.",
                { intent: data.intent, bot: data.bot }
            );
        } catch (err) {
            addMessage("error", `Error al subir archivo: ${err.message}`);
        }

        setLoading(false);
        setUploadLabel("");
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chat-area">
            {/* Inline styles for animations */}
            <style>{`
                @keyframes jarvisThink {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
                    40%           { transform: scale(1);   opacity: 1; }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes cursorBlink {
                    0%, 100% { opacity: 1; }
                    50%      { opacity: 0; }
                }
            `}</style>

            {/* Header */}
            <div className="chat-header">
                <div>
                    <div className="chat-header-title">Jarvis</div>
                    <div className="chat-header-subtitle">LLaMA 13B · LM Studio · localhost:3001</div>
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                    {messages.length - 1} msgs
                </div>
            </div>

            {/* Messages */}
            <div className="chat-box" style={{ paddingTop: "12px" }}>
                {messages.map((msg, i) => {
                    const isNew = i === newMsgIdx;
                    if (msg.role === "user") return <UserMessage key={i} msg={msg} isNew={isNew} />;
                    return <AssistantMessage key={i} msg={msg} isNew={isNew} />;
                })}

                {loading && (
                    <div style={{ display: "flex", padding: "10px 28px", animation: "fadeSlideUp 0.2s ease both" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                            <div style={{
                                width: "32px", height: "32px", borderRadius: "50%",
                                background: "var(--accent)", display: "flex", alignItems: "center",
                                justifyContent: "center", fontSize: "15px",
                                boxShadow: "0 0 0 3px rgba(16,163,127,0.2)"
                            }}>⚡</div>
                            <ThinkingDots />
                        </div>
                    </div>
                )}

                <div ref={bottomRef} style={{ height: 1 }} />
            </div>

            {/* Input */}
            <div className="input-area">
                <div style={{ width: "100%", maxWidth: "760px" }}>
                    {uploadLabel && (
                        <div style={{
                            padding: "6px 14px", marginBottom: "8px",
                            background: "var(--accent-light)", border: "1px solid var(--accent-border)",
                            borderRadius: "8px", fontSize: "12px", color: "var(--accent)",
                            fontFamily: "'DM Mono', monospace"
                        }}>
                            {uploadLabel}
                        </div>
                    )}
                    <div className="input-form">
                        <UploadButton onUpload={handleUpload} disabled={loading} />
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe un mensaje, comando, o adjuntá un archivo..."
                            disabled={loading}
                            rows={1}
                            autoFocus
                        />
                        <button
                            className="send-btn"
                            onClick={sendMessage}
                            disabled={loading || !input.trim()}
                            title="Enviar (Enter)"
                        >
                            ↑
                        </button>
                    </div>
                    <div className="input-hint">Enter para enviar · Shift+Enter nueva línea · 📎 para adjuntar</div>
                </div>
            </div>
        </div>
    );
}

export default Chat;