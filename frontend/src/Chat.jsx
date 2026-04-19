import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot, saveMemory } from "./api";

const API = "http://localhost:3001";

const WELCOME = {
  role: "assistant",
  content:
    "Sistema en línea ✓\n\nHola Tobías, soy **Jarvis**. ¿En qué puedo ayudarte?\n\nPuedo **buscar en la web** 🔍, controlar tu PC 💻, poner música 🎵, editar Google Docs 📄 y mucho más.\n\n💡 Decí **\"Jarvis [tu comando] enviar\"** desde cualquier parte de la app.",
  intent: null,
  bot: null,
};

/* ────────────────────────────────────────────────
   MERMAID LOADER
──────────────────────────────────────────────── */
let _mermaidReady = false;
let _mermaidLoading = false;
const _mermaidQueue = [];

function loadMermaid() {
  return new Promise((resolve) => {
    if (_mermaidReady) { resolve(window.mermaid); return; }
    _mermaidQueue.push(resolve);
    if (_mermaidLoading) return;
    _mermaidLoading = true;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    s.onload = () => {
      window.mermaid.initialize({
        startOnLoad: false, theme: "dark",
        themeVariables: {
          primaryColor: "#1e3a5f", primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#10a37f", lineColor: "#10a37f",
          secondaryColor: "#111827", background: "#0d1117",
          mainBkg: "#1e2030", nodeBorder: "#10a37f",
          titleColor: "#ececec", edgeLabelBackground: "#1a1a2e",
        },
      });
      _mermaidReady = true;
      _mermaidQueue.forEach((cb) => cb(window.mermaid));
      _mermaidQueue.length = 0;
    };
    s.onerror = () => { _mermaidQueue.forEach((cb) => cb(null)); _mermaidQueue.length = 0; };
    document.head.appendChild(s);
  });
}

/* ────────────────────────────────────────────────
   ARTIFACT DETECTOR
──────────────────────────────────────────────── */
function detectArtifact(text) {
  if (!text) return null;
  const patterns = [
    { re: /```mermaid\n([\s\S]+?)```/, type: "mermaid" },
    { re: /```html\n([\s\S]+?)```/, type: "html" },
    { re: /```svg\n([\s\S]+?)```/, type: "svg" },
    { re: /```jsx\n([\s\S]+?)```/, type: "react" },
    { re: /```javascript\n([\s\S]+?)```/, type: "javascript" },
    { re: /```js\n([\s\S]+?)```/, type: "javascript" },
    { re: /```css\n([\s\S]+?)```/, type: "css" },
  ];
  for (const { re, type } of patterns) {
    const m = text.match(re);
    if (m) return { type, code: m[1].trim(), raw: m[0] };
  }
  return null;
}

/* ────────────────────────────────────────────────
   INTENT FILTERS
──────────────────────────────────────────────── */
function isRawIntentJSON(text) {
  if (!text) return false;
  const t = text.trim();
  return (t.startsWith("{") && t.includes('"intent"')) ||
    (t.includes("```json") && t.includes('"intent"'));
}

function stripIntentBlocks(text) {
  if (!text) return text;
  let c = text.replace(/```json\s*\{[\s\S]*?"intent"[\s\S]*?\}\s*```/g, "").trim();
  c = c.replace(/^\s*\{[\s\S]*?"intent"[\s\S]*?\}\s*$/gm, "").trim();
  return c || text;
}

/* ────────────────────────────────────────────────
   MARKDOWN RENDERER
──────────────────────────────────────────────── */
function LinkBubble({ href, label }) {
  const domain = (() => { try { return new URL(href).hostname.replace("www.", ""); } catch { return href.slice(0, 40); } })();
  const display = label && label !== href ? label : domain;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px 2px 7px", background: "rgba(16,163,127,0.1)", border: "1px solid rgba(16,163,127,0.3)", borderRadius: 20, color: "#19c37d", fontSize: 13, fontWeight: 500, textDecoration: "none", verticalAlign: "middle", margin: "1px 3px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(16,163,127,0.2)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(16,163,127,0.1)"; e.currentTarget.style.transform = "none"; }}
      title={href}
    >
      <span style={{ fontSize: 11 }}>🔗</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>{display}</span>
      <span style={{ fontSize: 10, opacity: 0.5 }}>↗</span>
    </a>
  );
}

function renderInline(text) {
  if (!text) return null;
  const parts = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>")\]]+))/g;
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
      <div key={si} style={{ margin: "10px 0", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.35)" }}>
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

/* ────────────────────────────────────────────────
   MERMAID CANVAS RENDERER
──────────────────────────────────────────────── */
function MermaidCanvas({ code }) {
  const containerRef = useRef(null);
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);
  const id = useRef(`mmd-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    loadMermaid().then(async (mermaid) => {
      if (cancelled || !mermaid || !containerRef.current) return;
      try {
        const { svg } = await mermaid.render(id.current, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setReady(true);
        }
      } catch (e) { if (!cancelled) setErr(e.message); }
    });
    return () => { cancelled = true; };
  }, [code]);

  if (err) return (
    <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}>❌ Error al renderizar diagrama:</div>
      <pre style={{ fontSize: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>{err}</pre>
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: 60 }}>
      {!ready && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 8 }}>⟳</span>
          Renderizando diagrama...
        </div>
      )}
      <div ref={containerRef} style={{ display: ready ? "block" : "none", padding: 16, overflowX: "auto", background: "#0d1117", borderRadius: 8 }} />
    </div>
  );
}

/* ────────────────────────────────────────────────
   HTML CANVAS RENDERER (iframe sandboxed)
──────────────────────────────────────────────── */
function HtmlCanvas({ code }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(320);
  const [loaded, setLoaded] = useState(false);

  const fullDoc = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;padding:16px}
a{color:#10a37f}
input,textarea,select{font-family:inherit;background:#1e2030;color:#e2e8f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;outline:none}
button{font-family:inherit;cursor:pointer;padding:6px 14px;border-radius:6px;border:none;background:#10a37f;color:#fff;font-weight:600}
button:hover{background:#0d8a6a}
</style></head>
<body>${code.includes("<html") ? code : code}</body></html>`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(fullDoc); doc.close();
    const onLoad = () => {
      try {
        const h = iframe.contentDocument.body.scrollHeight;
        setHeight(Math.max(200, Math.min(h + 32, 600)));
      } catch (_) {}
      setLoaded(true);
    };
    iframe.addEventListener("load", onLoad);
    // fallback
    setTimeout(() => setLoaded(true), 600);
    return () => iframe.removeEventListener("load", onLoad);
  }, [fullDoc]);

  return (
    <div style={{ position: "relative" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(13,17,23,0.8)", zIndex: 2, color: "var(--text-muted)", fontSize: 13 }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 8 }}>⟳</span>
          Renderizando interfaz...
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin"
        style={{ width: "100%", height, border: "none", display: "block", borderRadius: 8, background: "#0d1117" }}
        title="html-preview"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────
   SVG CANVAS RENDERER
──────────────────────────────────────────────── */
function SvgCanvas({ code }) {
  const clean = code.includes("viewBox") ? code : code.replace("<svg", '<svg viewBox="0 0 800 400"');
  return (
    <div style={{ padding: 16, background: "#0d1117", borderRadius: 8, overflowX: "auto", textAlign: "center" }}>
      <div dangerouslySetInnerHTML={{ __html: clean }} style={{ maxWidth: "100%", display: "inline-block" }} />
    </div>
  );
}

/* ────────────────────────────────────────────────
   CODE CANVAS (JS/CSS/React)
──────────────────────────────────────────────── */
function CodeCanvas({ code, type }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ position: "relative", background: "#0d1117", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{type}</span>
        <button onClick={copy} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: copied ? "#19c37d" : "var(--text-muted)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: 16, fontSize: 13, lineHeight: 1.65, color: "#e2e8f0", fontFamily: "'DM Mono',monospace", overflowX: "auto", whiteSpace: "pre" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ────────────────────────────────────────────────
   CANVAS PANEL — inline expandable in chat
──────────────────────────────────────────────── */
const CANVAS_META = {
  mermaid:    { icon: "📊", label: "Diagrama", color: "#6366f1" },
  html:       { icon: "🌐", label: "Interfaz Web", color: "#10a37f" },
  svg:        { icon: "🎨", label: "Gráfico SVG", color: "#f59e0b" },
  react:      { icon: "⚛️", label: "Componente React", color: "#06b6d4" },
  javascript: { icon: "⚡", label: "Script JS", color: "#eab308" },
  css:        { icon: "🎨", label: "Estilos CSS", color: "#ec4899" },
};

function CanvasPanel({ artifact, onExpand }) {
  const meta = CANVAS_META[artifact.type] || { icon: "📄", label: "Código", color: "#6b7280" };
  const [tab, setTab] = useState("preview"); // "preview" | "code"

  const renderPreview = () => {
    switch (artifact.type) {
      case "mermaid": return <MermaidCanvas code={artifact.code} />;
      case "html": return <HtmlCanvas code={artifact.code} />;
      case "svg": return <SvgCanvas code={artifact.code} />;
      default: return <CodeCanvas code={artifact.code} type={artifact.type} />;
    }
  };

  const hasPreview = ["mermaid", "html", "svg"].includes(artifact.type);

  return (
    <div style={{
      margin: "12px 0",
      borderRadius: 12,
      overflow: "hidden",
      border: `1px solid ${meta.color}33`,
      background: "rgba(13,17,23,0.8)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        background: `${meta.color}12`,
        borderBottom: `1px solid ${meta.color}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{meta.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{meta.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Tab switcher */}
          {hasPreview && (
            <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 2, gap: 2 }}>
              {["preview", "code"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? "rgba(255,255,255,0.12)" : "transparent",
                  border: "none", borderRadius: 6, padding: "3px 10px",
                  color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: 11, fontWeight: tab === t ? 600 : 400,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
                }}>{t === "preview" ? "Vista previa" : "Código"}</button>
              ))}
            </div>
          )}
          {/* Expand */}
          <button onClick={() => onExpand?.(artifact)} style={{
            background: `${meta.color}22`, border: `1px solid ${meta.color}44`,
            borderRadius: 8, padding: "4px 12px",
            color: meta.color, fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          }}>⊞ Pantalla completa</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: 480, overflow: "auto" }}>
        {tab === "preview" ? renderPreview() : <CodeCanvas code={artifact.code} type={artifact.type} />}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   CANVAS FULLSCREEN MODAL
──────────────────────────────────────────────── */
function CanvasModal({ artifact, onClose }) {
  const [tab, setTab] = useState("preview");
  
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!artifact) return null;
  const meta = CANVAS_META[artifact.type] || { icon: "📄", label: "Código", color: "#6b7280" };

  const renderContent = () => {
    switch (artifact.type) {
      case "mermaid": return <MermaidCanvas code={artifact.code} />;
      case "html": return <HtmlCanvas code={artifact.code} />;
      case "svg": return <SvgCanvas code={artifact.code} />;
      default: return <CodeCanvas code={artifact.code} type={artifact.type} />;
    }
  };

  const hasPreview = ["mermaid", "html", "svg"].includes(artifact.type);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeSlideUp 0.2s ease" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "95vw", maxWidth: 1200, height: "90vh", display: "flex", flexDirection: "column", background: "#13151a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden" }}
      >
        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: `${meta.color}10`, borderBottom: `1px solid ${meta.color}22`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{meta.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>{meta.label}</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {hasPreview && (
              <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 2 }}>
                {["preview", "code"].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "rgba(255,255,255,0.12)" : "transparent", border: "none", borderRadius: 6, padding: "4px 14px", color: tab === t ? "var(--text-primary)" : "var(--text-muted)", fontSize: 12, fontWeight: tab === t ? 600 : 400, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    {t === "preview" ? "Vista previa" : "Código"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => navigator.clipboard.writeText(artifact.code)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 12px", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>📋 Copiar</button>
            <button onClick={onClose} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "4px 12px", color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>✕ Cerrar</button>
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "preview" ? renderContent() : <CodeCanvas code={artifact.code} type={artifact.type} />}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   THINKING INDICATOR
──────────────────────────────────────────────── */
const THINKING_PHRASES = ["Analizando tu mensaje...", "Consultando los bots...", "Procesando respuesta...", "Pensando...", "Buscando información..."];

function ThinkingIndicator({ botName, action }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setPhraseIdx((p) => (p + 1) % THINKING_PHRASES.length); setVisible(true); }, 200);
    }, 2200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ display: "flex", padding: "10px 28px", animation: "fadeSlideUp 0.25s ease both" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, animation: "botGlow 2s ease-in-out infinite" }}>⚡</div>
        <div style={{ paddingTop: 3 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic", opacity: visible ? 1 : 0, transition: "opacity 0.18s ease", marginBottom: 6 }}>{action || THINKING_PHRASES[phraseIdx]}</div>
          {botName && botName !== "unknown" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", background: "rgba(16,163,127,0.1)", border: "1px solid rgba(16,163,127,0.25)", borderRadius: 10, fontSize: 11, color: "var(--accent)", fontFamily: "'DM Mono',monospace", marginBottom: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", animation: "dotBlink 1s step-end infinite", display: "inline-block" }} />{botName}
            </div>
          )}
          <div style={{ display: "flex", gap: 5 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "block", animation: "jarvisThink 1.3s infinite ease-in-out", animationDelay: `${i * 0.18}s` }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   TYPEWRITER
──────────────────────────────────────────────── */
function useTypewriter(text, speed = 8) {
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

/* ────────────────────────────────────────────────
   QR WIDGET
──────────────────────────────────────────────── */
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
        setQrData(data.qr); setStatus("ready"); setCountdown(data.expiresIn || 60);
        clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setCountdown((p) => { if (p <= 1) { clearInterval(countdownRef.current); fetchQR(); return 60; } return p - 1; });
        }, 1000);
      } else if (data.status === "connected") { setStatus("connected"); setQrData(null); }
      else { setStatus(data.status || "waiting"); }
    } catch { setStatus("error"); }
  }, []);
  useEffect(() => {
    fetchQR();
    const iv = setInterval(() => { if (status !== "connected") fetchQR(); }, 8000);
    return () => { clearInterval(iv); clearInterval(countdownRef.current); };
  }, [fetchQR]);
  if (status === "connected") return <div style={{ margin: "8px 0", padding: "12px 16px", background: "rgba(25,195,125,0.1)", border: "1px solid rgba(25,195,125,0.3)", borderRadius: 12, fontSize: 13, color: "#19c37d" }}>✅ WhatsApp conectado</div>;
  if (!qrData) return <div style={{ margin: "8px 0", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}><div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>{status === "waiting" ? "Activá WhatsAppBot en Bots..." : "Generando QR..."}</div></div>;
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ fontSize: 12, color: "#9b9b9b", marginBottom: 8 }}>📱 Escaneá con WhatsApp → Dispositivos vinculados</div>
      <div style={{ display: "inline-block", padding: 10, background: "#fff", borderRadius: 10 }}>
        <img src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`} alt="QR" style={{ width: 200, height: 200, display: "block" }} />
      </div>
      <div style={{ fontSize: 11, color: countdown < 15 ? "#ef4444" : "#616161", marginTop: 6 }}>Expira en {countdown}s</div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   ASSISTANT MESSAGE
──────────────────────────────────────────────── */
function AssistantMessage({ msg, isNew, onOpenCanvas }) {
  const { displayed, done } = useTypewriter(isNew ? msg.content : null, 8);
  const text = isNew ? displayed : msg.content || "";
  const isError = msg.role === "error";
  const safeContent = msg.content && !isError ? msg.content : "";
  const artifact = safeContent ? detectArtifact(safeContent) : null;

  const cleanText = (() => {
    if (!artifact || !safeContent) return safeContent || msg.content || "";
    try { return safeContent.replace(artifact.raw, "").trim(); } catch { return safeContent; }
  })();

  const displayText = isNew && !done ? text || "" : cleanText || "";
  const showArtifact = !!(artifact?.code && typeof artifact.code === "string" && (!isNew || done));

  return (
    <div style={{ display: "flex", justifyContent: "flex-start", padding: "10px 28px", animation: isNew ? "fadeSlideUp 0.25s ease both" : "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 13, maxWidth: "82%" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: isError ? "#ef4444" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, marginTop: 2, boxShadow: isError ? "0 0 0 3px rgba(239,68,68,0.2)" : "0 0 0 3px rgba(16,163,127,0.2)" }}>{isError ? "⚠" : "⚡"}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {msg.bot && msg.bot !== "unknown" && !isError && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", marginBottom: 5, background: "rgba(16,163,127,0.08)", border: "1px solid rgba(16,163,127,0.2)", borderRadius: 8, fontSize: 10, color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>⚙ {msg.bot}</div>
          )}
          {msg.correction && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", marginBottom: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, fontSize: 11, color: "#f59e0b", fontFamily: "'DM Mono',monospace" }}>✏ Entendí: <em style={{ color: "#ececec", fontStyle: "normal", marginLeft: 4 }}>"{msg.correction}"</em></div>
          )}
          <div style={{ fontSize: isError ? 13 : 15, lineHeight: 1.75, color: isError ? "#f87171" : "var(--text-primary)", fontFamily: isError ? "'DM Mono',monospace" : "inherit", wordBreak: "break-word" }}>
            {isError ? displayText : renderMarkdown(displayText)}
            {isNew && !done && !isError && <span style={{ display: "inline-block", width: 2, height: 16, background: "var(--accent)", marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.7s step-end infinite" }} />}
          </div>
          {/* Canvas panel inline */}
          {showArtifact && <CanvasPanel artifact={artifact} onExpand={onOpenCanvas} />}
          {msg.showQR && (done || !isNew) && <InlineWhatsAppQR />}
          {msg.intent && !isError && (
            <div style={{ marginTop: 7, fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--text-muted)", opacity: done || !isNew ? 1 : 0, transition: "opacity 0.4s ease" }}>
              <span style={{ color: "var(--accent)", opacity: 0.6 }}>↳ {msg.intent}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   USER MESSAGE
──────────────────────────────────────────────── */
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

/* ────────────────────────────────────────────────
   AUDIO RECORDER — FIX: correct getUserMedia flow
──────────────────────────────────────────────── */
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
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || "audio/webm";
  };

  const stopAndProcess = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
    setRecording(false);

    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      mr.onstop = async () => {
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        const mimeType = mr.mimeType || getMimeType();
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (blob.size < 500) { showError("Audio demasiado corto"); setProcessing(false); resolve(); return; }

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
        resolve();
      };
      mr.stop();
    });
  }, [onTranscribed]);

  const startRecording = useCallback(async () => {
    if (disabled || processing || recording) return;
    setFloatError(null);

    // FIX: Explicitly request microphone permission before anything else
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showError("Permiso de micrófono denegado. Habilitalo en el navegador.");
      } else if (err.name === "NotFoundError") {
        showError("No se encontró micrófono.");
      } else {
        showError(`Micrófono no disponible: ${err.message}`);
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = getMimeType();

    let mr;
    try {
      mr = new MediaRecorder(stream, { mimeType });
    } catch {
      mr = new MediaRecorder(stream);
    }
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
    mr.onerror = () => { showError("Error durante la grabación"); setRecording(false); setProcessing(false); };

    mr.start(100);
    setRecording(true);
  }, [disabled, processing, recording]);

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
        title={recording ? "Click para enviar el audio" : "Click para grabar"}
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
        {processing ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 14 }}>⟳</span>
          : recording ? "⏹" : "🎤"}
      </button>
      {recording && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.92)", color: "#fff", fontSize: 10, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap", pointerEvents: "none", fontWeight: 600, zIndex: 10 }}>
          🔴 Grabando — click para enviar
        </div>
      )}
      {floatError && (
        <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.95)", color: "#fff", fontSize: 12, padding: "6px 12px", borderRadius: 8, whiteSpace: "nowrap", zIndex: 100, pointerEvents: "none", maxWidth: 280, textAlign: "center" }}>
          ⚠ {floatError}
        </div>
      )}
      {recording && <div style={{ position: "absolute", inset: -4, borderRadius: 12, border: "2px solid rgba(239,68,68,0.5)", animation: "ringPulse 1s ease-in-out infinite", pointerEvents: "none" }} />}
    </div>
  );
}

/* ────────────────────────────────────────────────
   UPLOAD BUTTON — FIX: handle PDFs separately from images
──────────────────────────────────────────────── */
function UploadButton({ onUpload, disabled }) {
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        // Accept images AND PDFs clearly
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { e.target.value = ""; onUpload(f); }
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        disabled={disabled}
        title="Adjuntar imagen o PDF"
        style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, transition: "all 0.15s" }}
        onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
      >📎</button>
    </>
  );
}

/* ────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────── */
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
  if (l.includes("diagrama") || l.includes("diagram") || l.includes("gráfico") || l.includes("chart") || l.includes("mermaid") || l.includes("flujo")) return { botName: "WebBot", action: "📊 Generando diagrama..." };
  if (l.includes("diseñ") || l.includes("interfaz") || l.includes("ui") || l.includes("html") || l.includes("componente")) return { botName: "WebBot", action: "🎨 Diseñando interfaz..." };
  return { botName: null, action: null };
}

// FIX: handle "open YouTube" / "abrir YouTube" style commands
function handleExternalCommand(text) {
  const l = text.toLowerCase();
  const OPENS = {
    youtube: "https://youtube.com",
    "you tube": "https://youtube.com",
    spotify: "https://open.spotify.com",
    discord: "https://discord.com/app",
    gmail: "https://mail.google.com",
    "google docs": "https://docs.google.com",
    "google drive": "https://drive.google.com",
    github: "https://github.com",
  };
  if (/\b(abrí|abrir|open|lanzar|launch|ir a)\b/i.test(l)) {
    for (const [site, url] of Object.entries(OPENS)) {
      if (l.includes(site)) { window.open(url, "_blank"); return true; }
    }
  }
  return false;
}

function correctPrompt(text) {
  if (!text) return { text: "", changed: false };
  const APP = [
    [/\bwhastsapp\b/gi, "whatsapp"], [/\bwhatasapp\b/gi, "whatsapp"],
    [/\bwatssap\b/gi, "whatsapp"], [/\bwsp\b/gi, "whatsapp"],
    [/\byuotube\b/gi, "youtube"], [/\byoutub\b/gi, "youtube"],
    [/\bspotifay\b/gi, "spotify"], [/\bspotfiy\b/gi, "spotify"],
    [/\bcrhome\b/gi, "chrome"], [/\bchorme\b/gi, "chrome"],
    [/\bdiscrod\b/gi, "discord"],
  ];
  const TYPOS = [
    [/\binforamcion\b/gi, "información"], [/\binfromacion\b/gi, "información"],
    [/\bvolumne\b/gi, "volumen"], [/\bmusica\b/gi, "música"],
    [/\bcancion\b/gi, "canción"], [/\bpantallla\b/gi, "pantalla"],
  ];
  let result = text;
  const run = (rules) => { for (const [re, rep] of rules) { try { result = result.replace(re, rep); } catch (_) {} } };
  run(APP); run(TYPOS);
  return { text: result, changed: result !== text };
}

/* ────────────────────────────────────────────────
   LISTENING OVERLAY
──────────────────────────────────────────────── */
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

/* ────────────────────────────────────────────────
   MAIN CHAT
──────────────────────────────────────────────── */
function Chat({ propConvId = null, onReady, globalWakeWordState, globalWakeWordEnabled, onToggleWakeWord }) {
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
  const [canvasArtifact, setCanvasArtifact] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { if (globalWakeWordState !== undefined) setWakeWordState(globalWakeWordState); }, [globalWakeWordState]);

  useEffect(() => {
    setConversationId(propConvId); setHistoryLoaded(false);
    if (!propConvId) { setMessages([WELCOME]); return; }
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/history/conversations/${propConvId}/messages`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setMessages(data.map((m) => ({ role: dbRoleToDisplay(m.role), content: m.content || "", intent: m.intent || null, bot: m.bot || null })));
        else setMessages([WELCOME]);
      } catch { setMessages([WELCOME]); }
      finally { setHistoryLoaded(true); }
    };
    load();
  }, [propConvId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const addMessage = (role, content, extra = {}) => {
    setMessages((prev) => { const next = [...prev, { role, content, ...extra }]; setNewMsgIdx(next.length - 1); return next; });
  };

  /* ── sendMessage ── */
  const sendMessage = useCallback(async (text, extra = {}) => {
    const raw = (text || input).trim();
    if (!raw || loading) return;

    const { text: trimmed, changed: wasCorrect } = correctPrompt(raw);
    const wantsQR = shouldShowQR(trimmed);
    const { botName, action } = guessBot(trimmed);

    // FIX: Handle external open commands before sending to backend
    if (handleExternalCommand(trimmed)) {
      addMessage("user", raw, extra);
      addMessage("assistant", `✅ Abriendo en el navegador...`, { bot: "SystemBot" });
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

    const memoryPattern = /\b(memorizá|memoriza|guardá en memoria|guarda en memoria|recordá esto|recuerda esto|guardá esto|guarda esto|memorizate)\b/i;
    const isMemoryRequest = memoryPattern.test(trimmed);

    addMessage("user", raw, extra);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true); setThinkingBot(botName); setThinkingAction(action);

    try {
      if (isMemoryRequest) {
        try {
          const contentToMemorize = trimmed.replace(memoryPattern, "").replace(/^[,:\s]+|[,:\s]+$/g, "").trim() || trimmed;
          await saveMemory(contentToMemorize, "usuario");
        } catch (e) { console.warn("No se pudo guardar memoria:", e.message); }
      }

      const historyForContext = messages.filter((m) => m.role !== "thinking");
      const data = await sendMessageToBot(trimmed, conversationId, historyForContext);
      if (data.conversation_id && !conversationId) setConversationId(data.conversation_id);

      let reply = data.reply || "Sin respuesta.";
      if (isRawIntentJSON(reply)) reply = "Procesando tu solicitud...";
      else reply = stripIntentBlocks(reply);

      addMessage(data.success === false ? "error" : "assistant", reply, {
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

  useEffect(() => { onReady?.(sendMessage); }, [sendMessage, onReady]);

  /* ── File upload — FIX: distinguish PDF from image ── */
  const handleUpload = async (file) => {
    const isPDF = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPDF && !isImage) {
      addMessage("error", `Tipo de archivo no soportado: ${file.type}. Usá imágenes (PNG, JPG, WEBP) o PDF.`);
      return;
    }

    setUploadLabel(`📎 ${file.name} (${isPDF ? "PDF" : "imagen"})`);
    setLoading(true);
    setThinkingBot("VisionBot");
    setThinkingAction(isPDF ? "📄 Analizando PDF..." : "🔍 Analizando imagen...");
    addMessage("user", `[${isPDF ? "PDF" : "Imagen"}: ${file.name}]`, { isFile: true });

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("query", input.trim() || (isPDF ? "Resumí y analizá este PDF detalladamente." : "Describí y analizá esta imagen detalladamente."));
      fd.append("fileType", isPDF ? "pdf" : "image"); // FIX: tell backend what type it is

      const res = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
      const data = await res.json();

      let reply = data.reply || "No se pudo procesar.";
      if (isRawIntentJSON(reply)) reply = `No pude analizar ese ${isPDF ? "PDF" : "archivo"}.`;
      else reply = stripIntentBlocks(reply);

      addMessage(data.success === false ? "error" : "assistant", reply, { intent: data.intent, bot: data.bot });
    } catch (err) {
      addMessage("error", `Error al procesar ${isPDF ? "PDF" : "imagen"}: ${err.message}`);
    }

    setLoading(false); setThinkingBot(null); setThinkingAction(null); setUploadLabel("");
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
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
          return <AssistantMessage key={i} msg={msg} isNew={isNew} onOpenCanvas={setCanvasArtifact} />;
        })}
        {loading && <ThinkingIndicator botName={thinkingBot} action={thinkingAction} />}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      <div className="input-area">
        <div style={{ width: "100%", maxWidth: 760 }}>
          {uploadLabel && (
            <div style={{ padding: "6px 14px", marginBottom: 8, background: "var(--accent-light)", border: "1px solid var(--accent-border)", borderRadius: 8, fontSize: 12, color: "var(--accent)", fontFamily: "'DM Mono',monospace", display: "flex", alignItems: "center", gap: 8 }}>
              {uploadLabel}
              <button onClick={() => setUploadLabel("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginLeft: "auto", fontSize: 14 }}>×</button>
            </div>
          )}

          <div className="input-form" style={{
            position: "relative", transition: "border-color 0.3s, box-shadow 0.3s",
            ...(isListeningMode ? {
              borderColor: wakeWordState === "listening" ? "rgba(239,68,68,0.5)" : "rgba(245,158,11,0.5)",
              boxShadow: wakeWordState === "listening" ? "0 0 0 2px rgba(239,68,68,0.1), 0 0 20px rgba(239,68,68,0.08)" : "0 0 0 2px rgba(245,158,11,0.1)",
            } : {}),
          }}>
            <ListeningOverlay state={wakeWordState} />
            <UploadButton onUpload={handleUpload} disabled={loading} />
            <AudioRecorder onTranscribed={(t) => { if (t.trim()) sendMessage(t, { isAudio: true }); }} disabled={loading} />
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
            <button className="send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()} title="Enviar (Enter)">↑</button>
          </div>

          <div className="input-hint">
            Enter para enviar · 🎤 grabar · 📎 imagen/PDF · 👂 "Jarvis [cmd] enviar"
          </div>
        </div>
      </div>

      {/* Canvas fullscreen modal */}
      {canvasArtifact && <CanvasModal artifact={canvasArtifact} onClose={() => setCanvasArtifact(null)} />}
    </div>
  );
}

export default Chat;