import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot, saveMemory } from "./api";
// WakeWord ya NO se importa aquí — está en App.jsx a nivel global

const API = "http://localhost:3001";

const WELCOME = {
    role: "assistant",
    content: "Sistema en línea ✓\n\nHola Tobías, soy **Jarvis**. ¿En qué puedo ayudarte?\n\nPuedo **buscar en la web** 🔍, controlar tu PC 💻, poner música 🎵, editar Google Docs 📄 y mucho más.\n\n💡 Decí **\"Jarvis [tu comando] enviar\"** desde cualquier parte de la app.",
    intent: null, bot: null,
};

/* ════════════════════════════════════════════════════════
   MARKDOWN RENDERER
═════════════════════════════════════════════════════════ */

function LinkBubble({ href, label }) {
    const domain = (() => { try { return new URL(href).hostname.replace("www.", ""); } catch { return href.substring(0, 40); } })();
    const display = (label && label !== href) ? label : domain;
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 10px 2px 7px", background: "rgba(16,163,127,0.1)",
            border: "1px solid rgba(16,163,127,0.3)", borderRadius: 20, color: "#19c37d",
            fontSize: 13, fontWeight: 500, textDecoration: "none", cursor: "pointer",
            verticalAlign: "middle", margin: "1px 3px", maxWidth: 320,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "all 0.15s",
        }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(16,163,127,0.2)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(16,163,127,0.1)"; e.currentTarget.style.transform = "none"; }}
            title={href}
        >
            <span style={{ fontSize: 11 }}>🔗</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>{display}</span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>↗</span>
        </a>
    );
}

function renderInline(text) {
    if (!text) return null;
    const parts = []; const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>")\]]+))/g;
    let last = 0, m, key = 0;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
        if (m[1]?.startsWith("**")) parts.push(<strong key={key++} style={{ fontWeight: 700 }}>{m[2]}</strong>);
        else if (m[1]?.startsWith("*") && !m[1]?.startsWith("**")) parts.push(<em key={key++} style={{ fontStyle: "italic", opacity: 0.85 }}>{m[3]}</em>);
        else if (m[4] !== undefined) parts.push(<code key={key++} style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.84em", padding: "1px 6px", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#e5c07b" }}>{m[4]}</code>);
        else if (m[5] !== undefined) parts.push(<s key={key++} style={{ opacity: 0.5 }}>{m[5]}</s>);
        else if (m[6] !== undefined) parts.push(<LinkBubble key={key++} href={m[7]} label={m[6]} />);
        else if (m[8] !== undefined) parts.push(<LinkBubble key={key++} href={m[8]} label={null} />);
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
    return parts;
}

function renderMarkdown(rawText) {
    if (!rawText) return null;
    const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
    const segments = []; let last = 0, m;
    while ((m = codeBlockRe.exec(rawText)) !== null) {
        if (m.index > last) segments.push({ type: "text", content: rawText.slice(last, m.index) });
        segments.push({ type: "code_block", lang: m[1] || "", content: m[2].trimEnd() });
        last = m.index + m[0].length;
    }
    if (last < rawText.length) segments.push({ type: "text", content: rawText.slice(last) });

    return segments.map((seg, si) => {
        if (seg.type === "code_block") return (
            <div key={si} style={{ margin: "10px 0", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.35)" }}>
                {seg.lang && <div style={{ padding: "3px 12px", fontSize: 11, color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)", fontFamily: "monospace" }}>{seg.lang}</div>}
                <pre style={{ margin: 0, padding: "12px 16px", fontSize: 13, lineHeight: 1.65, color: "#e5e7eb", fontFamily: "'DM Mono',monospace", overflowX: "auto", whiteSpace: "pre" }}><code>{seg.content}</code></pre>
            </div>
        );
        const lines = seg.content.split("\n"); const nodes = []; let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (line.trim() === "") { nodes.push(<div key={i} style={{ height: 5 }} />); i++; continue; }
            if (/^### /.test(line)) { nodes.push(<h5 key={i} style={{ margin: "7px 0 2px", fontSize: 14, fontWeight: 700 }}>{renderInline(line.slice(4))}</h5>); i++; continue; }
            if (/^## /.test(line)) { nodes.push(<h4 key={i} style={{ margin: "9px 0 3px", fontSize: 15, fontWeight: 700 }}>{renderInline(line.slice(3))}</h4>); i++; continue; }
            if (/^# /.test(line)) { nodes.push(<h3 key={i} style={{ margin: "10px 0 4px", fontSize: 17, fontWeight: 700 }}>{renderInline(line.slice(2))}</h3>); i++; continue; }
            if (/^---+$/.test(line.trim())) { nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />); i++; continue; }
            if (/^> /.test(line)) { nodes.push(<div key={i} style={{ borderLeft: "3px solid rgba(16,163,127,0.45)", paddingLeft: 12, margin: "3px 0", color: "var(--text-secondary)", fontStyle: "italic" }}>{renderInline(line.slice(2))}</div>); i++; continue; }
            if (/^[-*•] /.test(line)) {
                const items = [];
                while (i < lines.length && /^[-*•] /.test(lines[i])) { items.push(<div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}><span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>▸</span><span>{renderInline(lines[i].slice(2))}</span></div>); i++; }
                nodes.push(<div key={`ul${i}`} style={{ margin: "4px 0" }}>{items}</div>); continue;
            }
            if (/^\d+\. /.test(line)) {
                const items = []; let n = 1;
                while (i < lines.length && /^\d+\. /.test(lines[i])) { const content = lines[i].replace(/^\d+\. /, ""); items.push(<div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}><span style={{ color: "var(--accent)", fontWeight: 700, minWidth: 18 }}>{n}.</span><span>{renderInline(content)}</span></div>); i++; n++; }
                nodes.push(<div key={`ol${i}`} style={{ margin: "4px 0" }}>{items}</div>); continue;
            }
            nodes.push(<p key={i} style={{ margin: "2px 0", lineHeight: 1.75 }}>{renderInline(line)}</p>); i++;
        }
        return <div key={si}>{nodes}</div>;
    });
}

/* ════════════════════════════════════════════════════════
   THINKING INDICATOR
═════════════════════════════════════════════════════════ */
const THINKING_PHRASES = ["Analizando tu mensaje...", "Consultando los bots...", "Procesando respuesta...", "Pensando...", "Buscando información..."];

function ThinkingIndicator({ botName, action }) {
    const [phraseIdx, setPhraseIdx] = useState(0);
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        const iv = setInterval(() => { setVisible(false); setTimeout(() => { setPhraseIdx(p => (p + 1) % THINKING_PHRASES.length); setVisible(true); }, 200); }, 2200);
        return () => clearInterval(iv);
    }, []);
    return (
        <div style={{ display: "flex", padding: "10px 28px", animation: "fadeSlideUp 0.25s ease both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, animation: "botGlow 2s ease-in-out infinite" }}>⚡</div>
                <div style={{ paddingTop: 3 }}>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic", opacity: visible ? 1 : 0, transition: "opacity 0.18s ease", marginBottom: 6 }}>{action || THINKING_PHRASES[phraseIdx]}</div>
                    {botName && botName !== "unknown" && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", background: "rgba(16,163,127,0.1)", border: "1px solid rgba(16,163,127,0.25)", borderRadius: 10, fontSize: 11, color: "var(--accent)", fontFamily: "'DM Mono',monospace", marginBottom: 6 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", animation: "dotBlink 1s step-end infinite", display: "inline-block" }} />{botName}</div>}
                    <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "block", animation: "jarvisThink 1.3s infinite ease-in-out", animationDelay: `${i * 0.18}s` }} />)}</div>
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════
   TYPEWRITER
═════════════════════════════════════════════════════════ */
function useTypewriter(text, speed = 8) {
    const [displayed, setDisplayed] = useState(""); const [done, setDone] = useState(false); const ref = useRef(null);
    useEffect(() => {
        if (!text) return; setDisplayed(""); setDone(false); let i = 0;
        ref.current = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(ref.current); setDone(true); } }, speed);
        return () => clearInterval(ref.current);
    }, [text, speed]);
    return { displayed, done };
}

/* ════════════════════════════════════════════════════════
   QR WIDGET
═════════════════════════════════════════════════════════ */
function InlineWhatsAppQR() {
    const [qrData, setQrData] = useState(null); const [status, setStatus] = useState("loading"); const [countdown, setCountdown] = useState(60); const countdownRef = useRef(null);
    const fetchQR = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/whatsapp/qr`); const data = await res.json();
            if (data.available && data.qr) { setQrData(data.qr); setStatus("ready"); setCountdown(data.expiresIn || 60); clearInterval(countdownRef.current); countdownRef.current = setInterval(() => { setCountdown(p => { if (p <= 1) { clearInterval(countdownRef.current); fetchQR(); return 60; } return p - 1; }); }, 1000); }
            else if (data.status === "connected") { setStatus("connected"); setQrData(null); }
            else { setStatus(data.status || "waiting"); }
        } catch { setStatus("error"); }
    }, []);
    useEffect(() => { fetchQR(); const iv = setInterval(() => { if (status !== "connected") fetchQR(); }, 8000); return () => { clearInterval(iv); clearInterval(countdownRef.current); }; }, [fetchQR]);
    if (status === "connected") return <div style={{ margin: "8px 0", padding: "12px 16px", background: "rgba(25,195,125,0.1)", border: "1px solid rgba(25,195,125,0.3)", borderRadius: 12, fontSize: 13, color: "#19c37d" }}>✅ WhatsApp conectado</div>;
    if (!qrData) return <div style={{ margin: "8px 0", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}><div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>{status === "waiting" ? "Activá WhatsAppBot en Bots..." : "Generando QR..."}</div></div>;
    return <div style={{ margin: "8px 0" }}><div style={{ fontSize: 12, color: "#9b9b9b", marginBottom: 8 }}>📱 Escaneá con WhatsApp → Dispositivos vinculados</div><div style={{ display: "inline-block", padding: 10, background: "#fff", borderRadius: 10 }}><img src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`} alt="QR" style={{ width: 200, height: 200, display: "block" }} /></div><div style={{ fontSize: 11, color: countdown < 15 ? "#ef4444" : "#616161", marginTop: 6 }}>Expira en {countdown}s</div></div>;
}

/* ════════════════════════════════════════════════════════
   ASSISTANT MESSAGE
═════════════════════════════════════════════════════════ */
function AssistantMessage({ msg, isNew }) {
    const { displayed, done } = useTypewriter(isNew ? msg.content : null, 8);
    const text = isNew ? displayed : msg.content;
    const isError = msg.role === "error";
    return (
        <div style={{ display: "flex", justifyContent: "flex-start", padding: "10px 28px", animation: isNew ? "fadeSlideUp 0.25s ease both" : "none" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 13, maxWidth: "80%" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: isError ? "#ef4444" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, marginTop: 2, boxShadow: isError ? "0 0 0 3px rgba(239,68,68,0.2)" : "0 0 0 3px rgba(16,163,127,0.2)" }}>{isError ? "⚠" : "⚡"}</div>
                <div style={{ minWidth: 0 }}>
                    {msg.bot && msg.bot !== "unknown" && !isError && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", marginBottom: 5, background: "rgba(16,163,127,0.08)", border: "1px solid rgba(16,163,127,0.2)", borderRadius: 8, fontSize: 10, color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>⚙ {msg.bot}</div>}
                    {msg.correction && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", marginBottom: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, fontSize: 11, color: "#f59e0b", fontFamily: "'DM Mono',monospace" }}>✏ Entendí: <em style={{ color: "#ececec", fontStyle: "normal", marginLeft: 4 }}>"{msg.correction}"</em></div>}
                    <div style={{ fontSize: isError ? 13 : 15, lineHeight: 1.75, color: isError ? "#f87171" : "var(--text-primary)", fontFamily: isError ? "'DM Mono',monospace" : "inherit", wordBreak: "break-word" }}>
                        {isError ? text : renderMarkdown(text)}
                        {isNew && !done && !isError && <span style={{ display: "inline-block", width: 2, height: 16, background: "var(--accent)", marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.7s step-end infinite" }} />}
                    </div>
                    {msg.showQR && (done || !isNew) && <InlineWhatsAppQR />}
                    {msg.intent && !isError && <div style={{ marginTop: 7, fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--text-muted)", opacity: done || !isNew ? 1 : 0, transition: "opacity 0.4s ease" }}><span style={{ color: "var(--accent)", opacity: 0.6 }}>↳ {msg.intent}</span></div>}
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════
   USER MESSAGE
═════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════
   AUDIO RECORDER
═════════════════════════════════════════════════════════ */
function AudioRecorder({ onTranscribed, disabled }) {
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [floatError, setFloatError] = useState(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);

    const showError = (msg) => { setFloatError(msg); setTimeout(() => setFloatError(null), 3500); };
    const getMimeType = () => {
        const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
        return types.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
    };

    const stopAndProcess = useCallback(async () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
        setRecording(false);
        mediaRecorderRef.current.stop();
    }, []);

    const startRecording = useCallback(async () => {
        if (processing) return;
        setFloatError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mimeType = getMimeType();
            const mr = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mr;
            chunksRef.current = [];

            mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunksRef.current, { type: mimeType });
                if (blob.size < 500) { showError("Audio demasiado corto"); setProcessing(false); return; }
                setProcessing(true);
                try {
                    const fd = new FormData();
                    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
                    fd.append("audio", blob, `rec.${ext}`);
                    const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
                    const data = await res.json();
                    if (!data.success) showError(data.error || "Error al transcribir");
                    else if (!data.text?.trim()) showError("No se detectó voz");
                    else onTranscribed(data.text.trim());
                } catch { showError("Error de conexión con STT"); }
                setProcessing(false);
            };
            mr.start(100);
            setRecording(true);
        } catch { showError("Micrófono no disponible"); }
    }, [processing, onTranscribed]);

    const handleClick = useCallback(() => {
        if (disabled || processing) return;
        if (recording) stopAndProcess();
        else startRecording();
    }, [disabled, processing, recording, stopAndProcess, startRecording]);

    return (
        <div style={{ position: "relative", flexShrink: 0 }}>
            <button
                onClick={handleClick}
                disabled={disabled || processing}
                title={recording ? "Click para enviar el audio" : "Click para empezar a grabar"}
                style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: recording ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(255,255,255,0.1)",
                    background: recording ? "rgba(239,68,68,0.2)" : processing ? "rgba(16,163,127,0.15)" : "transparent",
                    color: recording ? "#ef4444" : processing ? "var(--accent)" : "var(--text-muted)",
                    cursor: disabled || processing ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, transition: "all 0.15s",
                    animation: recording ? "pulseMic 1s ease-in-out infinite" : "none",
                }}
            >
                {processing
                    ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 14 }}>⟳</span>
                    : recording ? "⏹" : "🎤"}
            </button>
            {recording && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: 10, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap", pointerEvents: "none", fontWeight: 600 }}>
                    🔴 Grabando — click para enviar
                </div>
            )}
            {floatError && (
                <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.95)", color: "#fff", fontSize: 12, padding: "6px 12px", borderRadius: 8, whiteSpace: "nowrap", zIndex: 100, pointerEvents: "none" }}>
                    ⚠ {floatError}
                </div>
            )}
            {recording && <div style={{ position: "absolute", inset: -4, borderRadius: 12, border: "2px solid rgba(239,68,68,0.5)", animation: "ringPulse 1s ease-in-out infinite", pointerEvents: "none" }} />}
        </div>
    );
}

/* ════════════════════════════════════════════════════════
   UPLOAD BUTTON
═════════════════════════════════════════════════════════ */
function UploadButton({ onUpload, disabled }) {
    const ref = useRef(null);
    return (
        <>
            <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ""; onUpload(f); } }} />
            <button onClick={() => ref.current?.click()} disabled={disabled} title="Adjuntar imagen o PDF" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📎</button>
        </>
    );
}

/* ════════════════════════════════════════════════════════
   HELPERS
═════════════════════════════════════════════════════════ */
function shouldShowQR(msg) {
    const l = msg.toLowerCase();
    return (l.includes("whatsapp") || l.includes("wsp")) && (l.includes("qr") || l.includes("conectar") || l.includes("vincular"));
}
function dbRoleToDisplay(r) { if (r === "user") return "user"; if (r === "error") return "error"; return "assistant"; }
function guessBot(msg) {
    const l = msg.toLowerCase();
    if (l.includes("buscá") || l.includes("busca") || l.includes("google") || l.includes("web") || l.includes("quién") || l.includes("qué es")) return { botName: "SearchBot", action: "🔍 Buscando en la web..." };
    if (l.includes("youtube") || l.includes("spotify") || l.includes("música")) return { botName: "MediaBot", action: "🎵 Controlando multimedia..." };
    if (l.includes("whatsapp") || l.includes("wsp")) return { botName: "WhatsAppBot", action: "📱 Procesando WhatsApp..." };
    if (l.includes("docs") || l.includes("documento") || l.includes("google")) return { botName: "ComputerBot", action: "📄 Trabajando en Google Docs..." };
    if (l.includes("screenshot") || l.includes("captura") || l.includes("volumen")) return { botName: "BatBot", action: "🖥️ Ejecutando en el sistema..." };
    if (l.includes("drive") || l.includes("subir") || l.includes("archivo")) return { botName: "DriveBot", action: "📁 Subiendo a Google Drive..." };
    return { botName: null, action: null };
}
function correctPrompt(text) {
    // ── Correcciones de tipografía e informalidades ──────────────────
    // Orden importa: más específicos primero para evitar colisiones
    const fixes = [
        // WhatsApp variantes
        [/\bwassap\b/gi, "whatsapp"], [/\bwasap\b/gi, "whatsapp"],
        [/\bwsp\b/gi, "whatsapp"], [/\bwtsap\b/gi, "whatsapp"],
        [/\bwhsatapp\b/gi, "whatsapp"], [/\bwhatasapp\b/gi, "whatsapp"],
        [/\bwhastsapp\b/gi, "whatsapp"], [/\bwatsap\b/gi, "whatsapp"],

        // YouTube variantes
        [/\byoutuve\b/gi, "youtube"], [/\byutube\b/gi, "youtube"],
        [/\byoutub\b/gi, "youtube"], [/\byuotube\b/gi, "youtube"],

        // Spotify variantes
        [/\bspotifay\b/gi, "spotify"], [/\bspotifi\b/gi, "spotify"],
        [/\bspotfiy\b/gi, "spotify"],

        // Volumen variantes
        [/\bvoluem\b/gi, "volumen"], [/\bvolumne\b/gi, "volumen"],
        [/\bvolumen\b/gi, "volumen"], // ya correcto pero sin tilde

        // Chrome / navegador
        [/\bcrhome\b/gi, "chrome"], [/\bchorme\b/gi, "chrome"],

        // Drive
        [/\bgoogle driev\b/gi, "drive"], [/\bdirve\b/gi, "drive"],

        // Discord
        [/\bdiscrdo\b/gi, "discord"], [/\bdiscrod\b/gi, "discord"],

        // Información (errores comunes)
        [/\bifromacion\b/gi, "información"], [/\binfomacion\b/gi, "información"],
        [/\binformacion\b/gi, "información"], [/\binfromacion\b/gi, "información"],
        [/\binforamcion\b/gi, "información"],

        // Cuando (errores comunes)
        [/\bciando\b/gi, "cuando"], [/\bcuandp\b/gi, "cuando"],
        [/\bcuaando\b/gi, "cuando"],

        // Música
        [/\bmusica\b/gi, "música"], [/\bcancion\b/gi, "canción"],
        [/\bmusic\b/gi, "música"],

        // Verbos informales en rioplatense (sin acento)
        [/\bponele\b/gi, "poné"], [/\bponle\b/gi, "poné"],
        [/\bpone\b(?!\s*(?:rs|rse|mos|n\b))/gi, "poné"],
        [/\babre\b/gi, "abrí"], [/\babrir\b/gi, "abrí"],
        [/\bcierra\b/gi, "cerrá"], [/\bcerrar\b/gi, "cerrá"],
        [/\bpause\b/gi, "pausá"], [/\bpausar\b/gi, "pausá"],
        [/\bsube\b/gi, "subí"], [/\bsubir\b/gi, "subí"],
        [/\bbaja\b/gi, "bajá"], [/\bbajar\b/gi, "bajá"],
        [/\bmute\b/gi, "muteá"], [/\bsilencia\b/gi, "silenciá"],
        [/\bmueve\b/gi, "mové"], [/\bmover\b/gi, "mová"],
        [/\bbusca\b(?!\s*(?:r|rs|mos))/gi, "buscá"],
        [/\bmanda\b/gi, "mandá"], [/\bmandar\b/gi, "mandá"],
        [/\bpasa\b(?!\s*(?:r|rs|je))/gi, "pasá"],

        // Desktop / Escritorio variantes
        [/\bdesctop\b/gi, "desktop"], [/\bdesltop\b/gi, "desktop"],
        [/\bescritoroi\b/gi, "escritorio"],
    ];
    let result = text;
    fixes.forEach(([re, rep]) => {
        try { result = result.replace(re, rep); } catch { }
    });
    return result;
}
/* ════════════════════════════════════════════════════════
   LISTENING OVERLAY
═════════════════════════════════════════════════════════ */
function ListeningOverlay({ state }) {
    if (state === "idle") return null;
    const isListening = state === "listening";
    const color = isListening ? "239,68,68" : "245,158,11";
    return (
        <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", zIndex: 10, overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: -1, borderRadius: "inherit", background: `linear-gradient(90deg, transparent, rgba(${color},0.8), transparent, rgba(${color},0.8), transparent)`, backgroundSize: "200% 100%", animation: "listeningBorderMove 1.5s linear infinite", padding: 1, WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: `rgba(${color},0.07)`, userSelect: "none", animation: "listeningTextPulse 2s ease-in-out infinite", fontFamily: "'DM Sans',sans-serif" }}>
                    {isListening ? "🎙 escuchando jarvis" : "⟳ procesando"}
                </span>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════
   MAIN CHAT
═════════════════════════════════════════════════════════ */
function Chat({
    propConvId = null,
    onReady,                // (sendFn) → App.jsx guarda ref para WakeWord global
    globalWakeWordState,    // viene de App.jsx
    globalWakeWordEnabled,  // viene de App.jsx
    onToggleWakeWord,       // viene de App.jsx
}) {
    const [conversationId, setConversationId] = useState(propConvId);
    const [messages, setMessages] = useState([WELCOME]);
    const [wakeWordState, setWakeWordState] = useState(globalWakeWordState || "idle");
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [newMsgIdx, setNewMsgIdx] = useState(-1);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [thinkingBot, setThinkingBot] = useState(null);
    const [thinkingAction, setThinkingAction] = useState(null);
    const [uploadLabel, setUploadLabel] = useState("");
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    // Sync wakeWordState desde App (global)
    useEffect(() => {
        if (globalWakeWordState !== undefined) setWakeWordState(globalWakeWordState);
    }, [globalWakeWordState]);

    useEffect(() => {
        setConversationId(propConvId); setHistoryLoaded(false);
        if (!propConvId) { setMessages([WELCOME]); return; }
        const load = async () => {
            try {
                const res = await fetch(`${API}/api/history/conversations/${propConvId}/messages`);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) setMessages(data.map(m => ({ role: dbRoleToDisplay(m.role), content: m.content || "", intent: m.intent || null, bot: m.bot || null })));
                else setMessages([WELCOME]);
            } catch { setMessages([WELCOME]); }
            finally { setHistoryLoaded(true); }
        };
        load();
    }, [propConvId]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

    const handleInputChange = e => {
        setInput(e.target.value);
        const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px";
    };

    const addMessage = (role, content, extra = {}) => {
        setMessages(prev => { const next = [...prev, { role, content, ...extra }]; setNewMsgIdx(next.length - 1); return next; });
    };

    /* ── sendMessage — se expone al padre via onReady ── */
    const sendMessage = useCallback(async (text, extra = {}) => {
        const raw = (text || input).trim();
        if (!raw || loading) return;

        const trimmed = correctPrompt(raw);
        const wasCorrect = trimmed !== raw;
        const wantsQR = shouldShowQR(trimmed);
        const { botName, action } = guessBot(trimmed);

        const memoryPattern = /\b(memorizá|memoriza|guardá en memoria|guarda en memoria|recordá esto|recuerda esto|guardá esto|guarda esto|memorizate)\b/i;
        const isMemoryRequest = memoryPattern.test(trimmed);

        addMessage("user", raw, extra);
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setLoading(true);
        setThinkingBot(botName);
        setThinkingAction(action);

        try {
            if (isMemoryRequest) {
                try {
                    const contentToMemorize = trimmed.replace(memoryPattern, "").replace(/^[,:\s]+|[,:\s]+$/g, "").trim() || trimmed;
                    await saveMemory(contentToMemorize, "usuario");
                } catch (e) { console.warn("No se pudo guardar memoria:", e.message); }
            }

            const historyForContext = messages.filter(m => m.role !== "thinking");
            const data = await sendMessageToBot(trimmed, conversationId, historyForContext);
            if (data.conversation_id && !conversationId) setConversationId(data.conversation_id);
            addMessage(data.success === false ? "error" : "assistant", data.reply || "Sin respuesta.", {
                intent: data.intent, bot: data.bot,
                ...(wantsQR ? { showQR: true } : {}),
                ...(wasCorrect ? { correction: trimmed } : {}),
            });
        } catch (err) {
            addMessage("error", `Error de conexión: ${err.message}`);
        }

        setLoading(false); setThinkingBot(null); setThinkingAction(null);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [input, loading, conversationId, messages]);

    /* ── Exponer sendMessage al padre (App.jsx) ── */
    useEffect(() => {
        onReady?.(sendMessage);
    }, [sendMessage, onReady]);

    const handleUpload = async (file) => {
        setUploadLabel(`📎 ${file.name}`); setLoading(true);
        setThinkingBot("VisionBot"); setThinkingAction("🔍 Analizando con Gemini...");
        addMessage("user", `[Archivo: ${file.name}]`, { isFile: true });
        try {
            const fd = new FormData(); fd.append("file", file); fd.append("query", input.trim() || "Analizá este archivo detalladamente.");
            const res = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
            const data = await res.json();
            addMessage(data.success === false ? "error" : "assistant", data.reply || "No se pudo procesar.", { intent: data.intent, bot: data.bot });
        } catch (err) { addMessage("error", `Error al procesar archivo: ${err.message}`); }
        setLoading(false); setThinkingBot(null); setThinkingAction(null); setUploadLabel("");
    };

    const handleKeyDown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

    const isListeningMode = wakeWordState !== "idle";
    const wakeWordEnabled = globalWakeWordEnabled ?? true;

    return (
        <div className="chat-area">
            <style>{`
                @keyframes jarvisThink{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}
                @keyframes fadeSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
                @keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}
                @keyframes pulseMic{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
                @keyframes ringPulse{0%,100%{opacity:0.8;transform:scale(1)}50%{opacity:0.3;transform:scale(1.1)}}
                @keyframes spin{to{transform:rotate(360deg)}}
                @keyframes botGlow{0%,100%{box-shadow:0 0 0 3px rgba(16,163,127,0.2)}50%{box-shadow:0 0 0 7px rgba(16,163,127,0.05)}}
                @keyframes dotBlink{0%,100%{opacity:1}50%{opacity:0.15}}
                @keyframes listeningBorderMove{0%{background-position:0% 0%}100%{background-position:200% 0%}}
                @keyframes listeningTextPulse{0%,100%{opacity:0.6}50%{opacity:1}}
            `}</style>

            <div className="chat-header">
                <div>
                    <div className="chat-header-title">Jarvis</div>
                    <div className="chat-header-subtitle">LLaMA · LM Studio · localhost:3001</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {conversationId && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-muted)", opacity: 0.5 }}>#{conversationId.slice(-6)}</div>}
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--text-muted)" }}>{messages.length - 1} msgs</div>
                </div>
            </div>

            <div className="chat-box" style={{ paddingTop: 12 }}>
                {propConvId && !historyLoaded && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
                        <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 8 }}>⟳</span>Cargando historial...
                    </div>
                )}
                {(!propConvId || historyLoaded) && messages.map((msg, i) => {
                    const isNew = i === newMsgIdx;
                    if (msg.role === "user") return <UserMessage key={i} msg={msg} isNew={isNew} />;
                    return <AssistantMessage key={i} msg={msg} isNew={isNew} />;
                })}
                {loading && <ThinkingIndicator botName={thinkingBot} action={thinkingAction} />}
                <div ref={bottomRef} style={{ height: 1 }} />
            </div>

            <div className="input-area">
                <div style={{ width: "100%", maxWidth: 760 }}>
                    {uploadLabel && (
                        <div style={{ padding: "6px 14px", marginBottom: 8, background: "var(--accent-light)", border: "1px solid var(--accent-border)", borderRadius: 8, fontSize: 12, color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>
                            {uploadLabel}
                        </div>
                    )}

                    <div className="input-form" style={{
                        position: "relative",
                        transition: "border-color 0.3s, box-shadow 0.3s",
                        ...(isListeningMode ? {
                            borderColor: wakeWordState === "listening" ? "rgba(239,68,68,0.5)" : "rgba(245,158,11,0.5)",
                            boxShadow: wakeWordState === "listening"
                                ? "0 0 0 2px rgba(239,68,68,0.1), 0 0 20px rgba(239,68,68,0.08)"
                                : "0 0 0 2px rgba(245,158,11,0.1)",
                        } : {}),
                    }}>
                        <ListeningOverlay state={wakeWordState} />
                        <UploadButton onUpload={handleUpload} disabled={loading} />
                        <AudioRecorder
                            onTranscribed={t => { if (t.trim()) sendMessage(t, { isAudio: true }); }}
                            disabled={loading}
                        />

                        {/* Botón toggle wake word — controla el global en App.jsx */}
                        <button
                            onClick={() => onToggleWakeWord?.(!wakeWordEnabled)}
                            title={wakeWordEnabled ? "Jarvis escuchando — click para desactivar" : "Wake word inactivo"}
                            style={{
                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                border: wakeWordEnabled ? "1px solid rgba(16,163,127,0.4)" : "1px solid rgba(255,255,255,0.1)",
                                background: wakeWordEnabled ? "rgba(16,163,127,0.1)" : "transparent",
                                color: wakeWordEnabled ? "var(--accent)" : "var(--text-muted)",
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 15, transition: "all 0.2s",
                                ...(wakeWordState === "listening" ? { border: "1px solid rgba(239,68,68,0.6)", background: "rgba(239,68,68,0.15)", color: "#ef4444", animation: "pulseMic 1.5s ease-in-out infinite" } : {}),
                                ...(wakeWordState === "processing" ? { border: "1px solid rgba(245,158,11,0.6)", background: "rgba(245,158,11,0.1)", color: "#f59e0b" } : {}),
                            }}
                        >
                            {wakeWordState === "listening" ? "🔴" : wakeWordState === "processing" ? "⟳" : wakeWordEnabled ? "👂" : "🔕"}
                        </button>

                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                wakeWordState === "listening" ? "🔴 Escuchando... decí 'enviar' para terminar" :
                                    wakeWordState === "processing" ? "⟳ Procesando audio..." :
                                        'Escribí un mensaje... o decí 👂 "Jarvis [comando] enviar"'
                            }
                            disabled={loading || wakeWordState === "listening"}
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
                        Enter para enviar · 🎤 click para grabar · 👂 "Jarvis [comando] enviar"
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Chat;