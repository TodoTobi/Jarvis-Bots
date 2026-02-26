import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot } from "./api";

const WELCOME = {
    role: "assistant",
    content: "Sistema en línea ✓\n\nHola Tobías, soy Jarvis. ¿En qué puedo ayudarte?",
    intent: null,
    bot: null
};

function MessageRow({ msg, isLast }) {
    const isUser = msg.role === "user";
    const isError = msg.role === "error";
    const isThinking = msg.role === "thinking";

    if (isThinking) {
        return (
            <div style={{ display: "flex", justifyContent: "flex-start", padding: "8px 24px", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                        width: "30px", height: "30px", borderRadius: "50%",
                        background: "var(--accent)", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: "14px", flexShrink: 0
                    }}>⚡</div>
                    <div style={{ display: "flex", gap: "5px", alignItems: "center", paddingTop: "2px" }}>
                        {[0, 1, 2].map(i => (
                            <span key={i} style={{
                                width: "6px", height: "6px", borderRadius: "50%",
                                background: "var(--accent)", display: "block",
                                animation: `thinking 1.2s infinite ease-in-out both`,
                                animationDelay: `${[-0.32, -0.16, 0][i]}s`
                            }} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (isUser) {
        // ── USER: right side, bubble style ──────────────────────
        return (
            <div style={{
                display: "flex", justifyContent: "flex-end",
                padding: "6px 24px",
                animation: isLast ? "msg-in 0.2s ease both" : "none"
            }}>
                <div style={{
                    display: "flex", alignItems: "flex-end", gap: "10px",
                    maxWidth: "70%"
                }}>
                    <div style={{
                        background: "var(--msg-user-bg)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "18px 18px 4px 18px",
                        padding: "11px 16px",
                        fontSize: "15px", lineHeight: "1.6",
                        color: "var(--text-primary)",
                        wordBreak: "break-word", whiteSpace: "pre-wrap"
                    }}>
                        {msg.content}
                    </div>
                    <div style={{
                        width: "30px", height: "30px", borderRadius: "50%",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)",
                        flexShrink: 0
                    }}>T</div>
                </div>
            </div>
        );
    }

    // ── ASSISTANT / ERROR: left side ─────────────────────────
    return (
        <div style={{
            display: "flex", justifyContent: "flex-start",
            padding: "8px 24px",
            animation: isLast ? "msg-in 0.2s ease both" : "none"
        }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", maxWidth: "72%" }}>
                {/* Avatar */}
                <div style={{
                    width: "30px", height: "30px", borderRadius: "50%",
                    background: isError ? "#ef4444" : "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", flexShrink: 0, marginTop: "2px"
                }}>
                    {isError ? "⚠" : "⚡"}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: "15px", lineHeight: "1.75",
                        color: isError ? "#f87171" : "var(--text-primary)",
                        fontFamily: isError ? "'DM Mono', monospace" : "inherit",
                        fontSize: isError ? "13px" : "15px",
                        wordBreak: "break-word", whiteSpace: "pre-wrap",
                        paddingTop: "3px"
                    }}>
                        {msg.content}
                    </div>

                    {msg.intent && !isError && (
                        <div style={{
                            marginTop: "8px", fontFamily: "'DM Mono', monospace",
                            fontSize: "11px", color: "var(--text-muted)"
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

function Chat() {
    const [messages, setMessages] = useState([WELCOME]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleInputChange = (e) => {
        setInput(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    };

    const sendMessage = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || loading) return;

        setMessages(prev => [...prev, { role: "user", content: trimmed }]);
        setInput("");

        if (textareaRef.current) textareaRef.current.style.height = "auto";

        setLoading(true);

        try {
            const data = await sendMessageToBot(trimmed);
            setMessages(prev => [...prev, {
                role: data.success === false ? "error" : "assistant",
                content: data.reply || "Sin respuesta del servidor.",
                intent: data.intent || null,
                bot: data.bot || null
            }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: "error",
                content: `Error de conexión: ${err.message}`,
                intent: null, bot: null
            }]);
        }

        setLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [input, loading]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chat-area">
            {/* Header */}
            <div className="chat-header">
                <div>
                    <div className="chat-header-title">Jarvis</div>
                    <div className="chat-header-subtitle">
                        LLaMA 13B · LM Studio · localhost:3001
                    </div>
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                    {messages.length - 1} msgs
                </div>
            </div>

            {/* Messages */}
            <div className="chat-box" style={{ paddingTop: "16px" }}>
                {messages.map((msg, i) => (
                    <MessageRow key={i} msg={msg} isLast={i === messages.length - 1} />
                ))}

                {loading && <MessageRow msg={{ role: "thinking" }} isLast />}

                <div ref={bottomRef} style={{ height: 1 }} />
            </div>

            {/* Input */}
            <div className="input-area">
                <div style={{ width: "100%", maxWidth: "720px" }}>
                    <div className="input-form">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe un mensaje o comando..."
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
                    <div className="input-hint">
                        Enter para enviar · Shift+Enter nueva línea
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Chat;