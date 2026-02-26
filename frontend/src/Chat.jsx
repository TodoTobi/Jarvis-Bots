import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot } from "./api";

const WELCOME = {
    role: "assistant",
    content: "Sistema en línea ✓\n\nHola Tobías, soy Jarvis. ¿En qué puedo ayudarte?",
    intent: null,
    bot: null
};

const AVATAR_USER = "T";
const AVATAR_AI = "⚡";

function MessageRow({ msg, isLast }) {
    const isUser = msg.role === "user";
    const isError = msg.role === "error";
    const isThinking = msg.role === "thinking";

    const rowClass = isUser ? "message-row user"
        : isError ? "message-row error"
            : isThinking ? "message-row thinking"
                : "message-row assistant";

    return (
        <div
            className={rowClass}
            style={{ animation: isLast ? "msg-in 0.2s ease both" : "none" }}
        >
            <div className="message-inner">
                {/* Avatar */}
                <div className={`msg-avatar ${isUser ? "user-avatar" : "ai-avatar"}`}>
                    {isUser ? AVATAR_USER : isError ? "⚠" : isThinking ? "⚡" : AVATAR_AI}
                </div>

                {/* Content */}
                <div className="message-content-wrap" style={{ flex: 1, minWidth: 0 }}>
                    {isThinking ? (
                        <div className="thinking-wrap">
                            <span /><span /><span />
                        </div>
                    ) : (
                        <div className={`message-content ${isError ? "error-content" : ""}`}>
                            {msg.content}
                        </div>
                    )}

                    {/* Intent / bot tag — only on successful AI replies */}
                    {msg.intent && !isUser && !isError && (
                        <div className="message-intent">
                            <span className="intent-tag">↳ {msg.intent}</span>
                            {msg.bot && msg.bot !== "unknown" && (
                                <span style={{ marginLeft: "8px", opacity: 0.5 }}>
                                    via {msg.bot}
                                </span>
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

    // Auto scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Auto-resize textarea
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

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

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
                intent: null,
                bot: null
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
                <div style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "11px",
                    color: "var(--text-muted)"
                }}>
                    {messages.length - 1} msgs
                </div>
            </div>

            {/* Messages */}
            <div className="chat-box">
                {messages.map((msg, i) => (
                    <MessageRow
                        key={i}
                        msg={msg}
                        isLast={i === messages.length - 1}
                    />
                ))}

                {loading && (
                    <MessageRow
                        msg={{ role: "thinking" }}
                        isLast
                    />
                )}

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