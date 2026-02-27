import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot } from "./api";

const API = "http://localhost:3001";

const WELCOME = {
    role: "assistant",
    content: "Sistema en línea ✓\n\nHola Tobías, soy Jarvis. ¿En qué puedo ayudarte?",
    intent: null, bot: null
};

/* ─── Typewriter hook ─────────────────────────────────── */
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

/* ─── Assistant message ───────────────────────────────── */
function AssistantMessage({ msg, isNew }) {
    const { displayed, done } = useTypewriter(isNew ? msg.content : null, 12);
    const text = isNew ? displayed : msg.content;
    const isError = msg.role === "error";
    return (
        <div style={{ display: "flex", justifyContent: "flex-start", padding: "10px 28px", animation: isNew ? "fadeSlideUp 0.25s ease both" : "none" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "13px", maxWidth: "74%" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: isError ? "#ef4444" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0, marginTop: "2px", boxShadow: isError ? "0 0 0 3px rgba(239,68,68,0.2)" : "0 0 0 3px rgba(16,163,127,0.2)" }}>
                    {isError ? "⚠" : "⚡"}
                </div>
                <div>
                    <div style={{ fontSize: isError ? "13px" : "15px", lineHeight: "1.75", color: isError ? "#f87171" : "var(--text-primary)", fontFamily: isError ? "'DM Mono', monospace" : "inherit", wordBreak: "break-word", whiteSpace: "pre-wrap", paddingTop: "4px" }}>
                        {text}
                        {isNew && !done && (
                            <span style={{ display: "inline-block", width: "2px", height: "16px", background: "var(--accent)", marginLeft: "2px", verticalAlign: "text-bottom", animation: "cursorBlink 0.7s step-end infinite" }} />
                        )}
                    </div>
                    {msg.intent && !isError && (
                        <div style={{ marginTop: "8px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--text-muted)", opacity: done || !isNew ? 1 : 0, transition: "opacity 0.4s ease" }}>
                            <span style={{ color: "var(--accent)", opacity: 0.7 }}>↳ {msg.intent}</span>
                            {msg.bot && msg.bot !== "unknown" && <span style={{ marginLeft: "8px", opacity: 0.5 }}>via {msg.bot}</span>}
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
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", maxWidth: "68%" }}>
                <div style={{ background: "linear-gradient(135deg, #10a37f, #0d8a6a)", borderRadius: "20px 20px 4px 20px", padding: "12px 18px", fontSize: "15px", lineHeight: "1.6", color: "#fff", wordBreak: "break-word", whiteSpace: "pre-wrap", boxShadow: "0 2px 12px rgba(16,163,127,0.25)" }}>
                    {msg.content}
                    {msg.isAudio && <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 12 }}>🎤</span>}
                </div>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>T</div>
            </div>
        </div>
    );
}

/* ─── Audio Recorder Button ───────────────────────────── */
function AudioRecorder({ onTranscribed, disabled }) {
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const mimeType = mediaRecorder.mimeType;
                const blob = new Blob(chunksRef.current, { type: mimeType });

                if (blob.size < 500) {
                    setError("Audio muy corto");
                    setProcessing(false);
                    return;
                }

                setProcessing(true);
                try {
                    const text = await transcribeAudio(blob, mimeType);
                    onTranscribed(text);
                } catch (err) {
                    setError(err.message);
                }
                setProcessing(false);
            };

            mediaRecorder.start();
            setRecording(true);
        } catch (err) {
            setError("Microfono no disponible");
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    const getSupportedMimeType = () => {
        const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
        return types.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
    };

    return (
        <div style={{ position: "relative" }}>
            <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={disabled || processing}
                title={recording ? "Soltá para transcribir" : "Mantené para grabar"}
                style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    border: recording ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(255,255,255,0.1)",
                    background: recording ? "rgba(239,68,68,0.2)" : processing ? "rgba(16,163,127,0.2)" : "transparent",
                    color: recording ? "#ef4444" : processing ? "var(--accent)" : "var(--text-muted)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: recording ? "14px" : "16px", flexShrink: 0,
                    transition: "all 0.15s",
                    animation: recording ? "pulseMic 1s ease-in-out infinite" : "none",
                }}>
                {processing ? "⟳" : recording ? "⏹" : "🎤"}
            </button>

            {error && (
                <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                    transform: "translateX(-50%)", background: "rgba(239,68,68,0.9)",
                    color: "#fff", fontSize: 11, padding: "4px 8px", borderRadius: 6,
                    whiteSpace: "nowrap", zIndex: 10,
                }}>
                    {error}
                </div>
            )}
        </div>
    );
}

/* ─── STT API call ────────────────────────────────────── */
async function transcribeAudio(audioBlob, mimeType) {
    const formData = new FormData();
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("audio", audioBlob, `recording.${ext}`);

    const res = await fetch(`${API}/api/stt/transcribe`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al transcribir");
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Transcripción fallida");
    return data.text || "";
}

/* ─── File upload button ──────────────────────────────── */
function UploadButton({ onUpload, disabled }) {
    const ref = useRef(null);
    return (
        <>
            <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ""; onUpload(f); } }} />
            <button onClick={() => ref.current?.click()} disabled={disabled} title="Adjuntar imagen o PDF"
                style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
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

    const sendMessage = useCallback(async (text, isAudio = false) => {
        const trimmed = (text || input).trim();
        if (!trimmed || loading) return;

        addMessage("user", trimmed, { isAudio });
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

    const handleTranscribed = (text) => {
        if (text.trim()) sendMessage(text, true);
    };

    const handleUpload = async (file) => {
        setUploadLabel(`📎 ${file.name}`);
        setLoading(true);
        addMessage("user", `[Archivo adjunto: ${file.name}]`);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("query", input.trim() || "Analizá este archivo");
            const res = await fetch(`${API}/api/upload`, { method: "POST", body: formData });
            const data = await res.json();
            addMessage(data.success === false ? "error" : "assistant", data.reply || "No se pudo procesar.", { intent: data.intent, bot: data.bot });
        } catch (err) {
            addMessage("error", `Error al subir archivo: ${err.message}`);
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
                @keyframes pulseMic { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }
            `}</style>

            <div className="chat-header">
                <div>
                    <div className="chat-header-title">Jarvis</div>
                    <div className="chat-header-subtitle">LLaMA 13B · LM Studio · localhost:3001</div>
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                    {messages.length - 1} msgs
                </div>
            </div>

            <div className="chat-box" style={{ paddingTop: "12px" }}>
                {messages.map((msg, i) => {
                    const isNew = i === newMsgIdx;
                    if (msg.role === "user") return <UserMessage key={i} msg={msg} isNew={isNew} />;
                    return <AssistantMessage key={i} msg={msg} isNew={isNew} />;
                })}

                {loading && (
                    <div style={{ display: "flex", padding: "10px 28px", animation: "fadeSlideUp 0.2s ease both" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", boxShadow: "0 0 0 3px rgba(16,163,127,0.2)" }}>⚡</div>
                            <ThinkingDots />
                        </div>
                    </div>
                )}

                <div ref={bottomRef} style={{ height: 1 }} />
            </div>

            <div className="input-area">
                <div style={{ width: "100%", maxWidth: "760px" }}>
                    {uploadLabel && (
                        <div style={{ padding: "6px 14px", marginBottom: "8px", background: "var(--accent-light)", border: "1px solid var(--accent-border)", borderRadius: "8px", fontSize: "12px", color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>
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
                        <button className="send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()} title="Enviar (Enter)">
                            ↑
                        </button>
                    </div>
                    <div className="input-hint">Enter para enviar · Shift+Enter nueva línea · 📎 adjuntar · 🎤 mantener para grabar</div>
                </div>
            </div>
        </div>
    );
}

export default Chat;