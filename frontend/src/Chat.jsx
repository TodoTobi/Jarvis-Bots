import React, { useState, useRef, useEffect } from "react";
import { sendMessageToBot } from "./api";

function Chat() {
    const [messages, setMessages] = useState([
        { role: "assistant", content: "Hola, soy Jarvis 👋 ¿En qué puedo ayudarte?" }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async () => {
        const trimmed = input.trim();
        if (!trimmed || loading) return;

        const userMessage = { role: "user", content: trimmed };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const data = await sendMessageToBot(trimmed);

            setMessages(prev => [
                ...prev,
                {
                    role: data.success === false ? "error" : "assistant",
                    content: data.reply || "Sin respuesta del servidor."
                }
            ]);
        } catch (error) {
            setMessages(prev => [
                ...prev,
                {
                    role: "error",
                    content: `Error: ${error.message || "No se pudo conectar con el servidor."}`
                }
            ]);
        }

        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chat-area">
            <div className="chat-header">
                <div>
                    <div className="chat-header-title">Chat con Jarvis</div>
                    <div className="chat-header-subtitle">Modelo local LLaMA 13B</div>
                </div>
            </div>

            <div className="chat-box">
                {messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.role}`}>
                        {msg.content}
                    </div>
                ))}

                {loading && (
                    <div className="message thinking">
                        <div className="thinking-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <div className="input-area">
                <div className="input-wrapper">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribe tu mensaje..."
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                </div>
                <button onClick={sendMessage} disabled={loading || !input.trim()}>
                    Enviar
                </button>
            </div>
        </div>
    );
}

export default Chat;