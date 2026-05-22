/**
 * Chat.jsx — rediseño visual estética SISTEMA/Shell
 * Lógica de sendMessage, onReady, artifacts, mermaid, QR: 100% intacta.
 * Cambios: prop `setView` para volver al Shell, header/mensajes/input rediseñados.
 * Wake word: referencias a "jarvis" en UI cambiadas a "sistema".
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageToBot, saveMemory } from "./api";

const API = "http://localhost:3001";

const WELCOME = {
  role: "assistant",
  content:
    "Sistema en línea ✓\n\nHola Tobías, soy **SISTEMA**. ¿En qué puedo ayudarte?\n\nPuedo **buscar en la web**, controlar tu PC, poner música, editar Google Docs y mucho más.\n\nDecí **\"sistema [comando]\"** desde cualquier parte de la app.",
  intent: null,
  bot: null,
};

/* ────────────────────────────────────────────────
   MERMAID LOADER — sin cambios
──────────────────────────────────────────────── */
let _mermaidReady = false;
let _mermaidLoading = false;
const _mermaidQueue = [];
let _mermaidInstance = null;

function loadMermaid() {
  return new Promise((resolve) => {
    if (_mermaidReady && _mermaidInstance) { resolve(_mermaidInstance); return; }
    _mermaidQueue.push(resolve);
    if (_mermaidLoading) return;
    _mermaidLoading = true;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    s.onload = () => {
      try {
        window.mermaid.initialize({
          startOnLoad: false, theme: "dark", securityLevel: "loose",
          suppressErrorRendering: true,
          themeVariables: {
            primaryColor: "#001e30", primaryTextColor: "#e2e8f0",
            primaryBorderColor: "#00d4ff", lineColor: "#00d4ff",
            background: "#04040a", mainBkg: "#0a0a1a", nodeBorder: "#00d4ff", titleColor: "#00d4ff",
          },
        });
        _mermaidInstance = window.mermaid; _mermaidReady = true;
      } catch (e) { console.warn("mermaid init error:", e); }
      _mermaidQueue.forEach(cb => cb(_mermaidInstance));
      _mermaidQueue.length = 0;
    };
    s.onerror = () => { _mermaidQueue.forEach(cb => cb(null)); _mermaidQueue.length = 0; };
    document.head.appendChild(s);
  });
}

/* ────────────────────────────────────────────────
   ARTIFACT DETECTOR — sin cambios
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
   INTENT FILTERS — sin cambios
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
   MARKDOWN RENDERER — lógica intacta, colores actualizados
──────────────────────────────────────────────── */
function LinkBubble({ href, label }) {
  const domain = (() => { try { return new URL(href).hostname.replace("www.", ""); } catch { return href.slice(0, 40); } })();
  const display = label && label !== href ? label : domain;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px 2px 7px", background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", borderRadius: 20, color: "#00d4ff", fontSize: 13, fontWeight: 500, textDecoration: "none", verticalAlign: "middle", margin: "1px 3px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,212,255,0.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,212,255,0.08)"; }}
      title={href}
    >
      <span style={{ fontSize: 11 }}>↗</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>{display}</span>
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
    if (m[1]?.startsWith("**")) parts.push(<strong key={key++} style={{ fontWeight: 600, color: "#00d4ff" }}>{m[2]}</strong>);
    else if (m[1]?.startsWith("*") && !m[1]?.startsWith("**")) parts.push(<em key={key++} style={{ fontStyle: "italic", opacity: 0.8 }}>{m[3]}</em>);
    else if (m[4] !== undefined) parts.push(<code key={key++} style={{ fontFamily: "'JetBrains Mono','DM Mono',monospace", fontSize: "0.82em", padding: "1px 6px", background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, color: "#00d4ff" }}>{m[4]}</code>);
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
      <div key={si} style={{ margin: "10px 0", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,212,255,0.15)", background: "rgba(0,0,0,0.4)" }}>
        {seg.lang && <div style={{ padding: "3px 12px", fontSize: 10, color: "rgba(0,212,255,0.5)", background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.1)", fontFamily: "monospace", letterSpacing: "0.1em" }}>{seg.lang}</div>}
        <pre style={{ margin: 0, padding: "12px 16px", fontSize: 13, lineHeight: 1.65, color: "#a0c8d8", fontFamily: "'JetBrains Mono','DM Mono',monospace", overflowX: "auto", whiteSpace: "pre" }}><code>{seg.content}</code></pre>
      </div>
    );
    const lines = seg.content.split("\n"); const nodes = []; let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { nodes.push(<div key={i} style={{ height: 5 }} />); i++; continue; }
      if (/^### /.test(line)) { nodes.push(<h5 key={i} style={{ margin: "7px 0 2px", fontSize: 13, fontWeight: 600, color: "rgba(0,212,255,0.9)", fontFamily: "'Rajdhani',monospace", letterSpacing: "0.05em" }}>{renderInline(line.slice(4))}</h5>); i++; continue; }
      if (/^## /.test(line)) { nodes.push(<h4 key={i} style={{ margin: "9px 0 3px", fontSize: 14, fontWeight: 600, color: "rgba(0,212,255,0.9)", fontFamily: "'Rajdhani',monospace", letterSpacing: "0.05em" }}>{renderInline(line.slice(3))}</h4>); i++; continue; }
      if (/^# /.test(line)) { nodes.push(<h3 key={i} style={{ margin: "10px 0 4px", fontSize: 16, fontWeight: 700, color: "#00d4ff", fontFamily: "'Rajdhani',monospace", letterSpacing: "0.08em" }}>{renderInline(line.slice(2))}</h3>); i++; continue; }
      if (/^---+$/.test(line.trim())) { nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(0,212,255,0.1)", margin: "8px 0" }} />); i++; continue; }
      if (/^> /.test(line)) { nodes.push(<div key={i} style={{ borderLeft: "2px solid rgba(0,212,255,0.4)", paddingLeft: 12, margin: "3px 0", color: "rgba(0,212,255,0.6)", fontStyle: "italic", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>{renderInline(line.slice(2))}</div>); i++; continue; }
      if (/^[-*•] /.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*•] /.test(lines[i])) { items.push(<div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}><span style={{ color: "#00d4ff", flexShrink: 0, marginTop: 1, fontSize: 10 }}>▸</span><span>{renderInline(lines[i].slice(2))}</span></div>); i++; }
        nodes.push(<div key={`ul${i}`} style={{ margin: "4px 0" }}>{items}</div>); continue;
      }
      if (/^\d+\. /.test(line)) {
        const items = []; let n = 1;
        while (i < lines.length && /^\d+\. /.test(lines[i])) { const content = lines[i].replace(/^\d+\. /, ""); items.push(<div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}><span style={{ color: "#00d4ff", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, minWidth: 18 }}>{n}.</span><span>{renderInline(content)}</span></div>); i++; n++; }
        nodes.push(<div key={`ol${i}`} style={{ margin: "4px 0" }}>{items}</div>); continue;
      }
      nodes.push(<p key={i} style={{ margin: "2px 0", lineHeight: 1.8 }}>{renderInline(line)}</p>); i++;
    }
    return <div key={si}>{nodes}</div>;
  });
}

/* ────────────────────────────────────────────────
   MERMAID / HTML / SVG / CODE CANVAS — sin cambios de lógica
──────────────────────────────────────────────── */
function sanitizeMermaidCode(code) {
  if (!code) return "";
  return code.split("\n").map(line => {
    line = line.replace(/;+$/, "");
    line = line.replace(/(\w[\w\d]*)\[([^\]"]+)\]/g, (match, id, label) => {
      if (/\s|\(|\)/.test(label) && !label.startsWith('"')) return `${id}["${label.replace(/"/g, "'")}"]`;
      return match;
    });
    return line;
  }).join("\n");
}

function MermaidCanvas({ code }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const idRef = useRef(`mmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;
    let cancelled = false;
    const sanitized = sanitizeMermaidCode(code);
    loadMermaid().then(async (mermaid) => {
      if (cancelled || !mermaid || !containerRef.current) { setStatus("fallback"); return; }
      try {
        const { svg } = await mermaid.render(idRef.current, sanitized);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) { svgEl.style.maxWidth = "100%"; svgEl.style.height = "auto"; svgEl.removeAttribute("height"); }
          setStatus("ok");
        }
      } catch (e) { if (!cancelled) { console.warn("mermaid render error:", e.message?.substring(0, 80)); setStatus("fallback"); } }
    });
    return () => { cancelled = true; };
  }, [code]);

  if (status === "fallback") return (
    <div style={{ background: "#04040a", borderRadius: 6, padding: 16, overflow: "auto", maxHeight: 400, border: "1px solid rgba(0,212,255,0.1)" }}>
      <div style={{ fontSize: 10, color: "rgba(0,212,255,0.4)", marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.1em" }}>// mermaid · código fuente</div>
      <pre style={{ margin: 0, fontSize: 12, color: "#a0c8d8", fontFamily: "monospace", whiteSpace: "pre", overflowX: "auto" }}>{code}</pre>
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: 40 }}>
      {status === "loading" && (
        <div style={{ padding: 16, color: "rgba(0,212,255,0.5)", fontSize: 12, textAlign: "center", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em" }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 6 }}>⟳</span>renderizando...
        </div>
      )}
      <div ref={containerRef} style={{ display: status === "ok" ? "block" : "none", padding: 16, overflowX: "auto", background: "#04040a", borderRadius: 6 }} />
    </div>
  );
}

function HtmlCanvas({ code }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(360);
  const fullDoc = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{background:#04040a;color:#c0d8e0;font-family:'JetBrains Mono',monospace;font-size:14px;line-height:1.6;padding:16px}a{color:#00d4ff}input,textarea,select{background:#0a0a1a;color:#c0d8e0;border:1px solid rgba(0,212,255,0.2);border-radius:4px;padding:6px 10px;outline:none;font:inherit}button{font:inherit;cursor:pointer;padding:6px 14px;border-radius:4px;border:1px solid rgba(0,212,255,0.3);background:rgba(0,212,255,0.08);color:#00d4ff;font-weight:600}button:hover{background:rgba(0,212,255,0.15)}canvas{max-width:100%}</style>
</head><body>${code.replace(/<html[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*<\/html>/i, "")}</body></html>`;

  useEffect(() => {
    const iframe = iframeRef.current; if (!iframe) return;
    const blob = new Blob([fullDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    iframe.src = url;
    iframe.onload = () => {
      try { const h = iframe.contentDocument?.body?.scrollHeight || 360; setHeight(Math.max(200, Math.min(h + 40, 700))); } catch { setHeight(360); }
      URL.revokeObjectURL(url);
    };
  }, [fullDoc]);

  return <iframe ref={iframeRef} sandbox="allow-scripts" style={{ width: "100%", height, border: "none", display: "block", borderRadius: 6, background: "#04040a" }} title="html-canvas" />;
}

function SvgCanvas({ code }) {
  const clean = code.includes("viewBox") ? code : code.replace("<svg", '<svg viewBox="0 0 800 400"');
  return (
    <div style={{ padding: 16, background: "#04040a", borderRadius: 6, overflowX: "auto", textAlign: "center" }}>
      <div dangerouslySetInnerHTML={{ __html: clean }} style={{ maxWidth: "100%", display: "inline-block" }} />
    </div>
  );
}

function CodeCanvas({ code, type }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ position: "relative", background: "#04040a", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,212,255,0.12)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.1)" }}>
        <span style={{ fontSize: 10, color: "rgba(0,212,255,0.5)", fontFamily: "monospace", letterSpacing: "0.1em" }}>{type}</span>
        <button onClick={copy} style={{ background: "none", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: "2px 10px", fontSize: 10, color: copied ? "#00d4ff" : "rgba(0,212,255,0.4)", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.05em" }}>
          {copied ? "✓ copiado" : "copiar"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: 16, fontSize: 13, lineHeight: 1.65, color: "#a0c8d8", fontFamily: "'JetBrains Mono',monospace", overflowX: "auto", whiteSpace: "pre" }}><code>{code}</code></pre>
    </div>
  );
}

/* ────────────────────────────────────────────────
   CANVAS PANEL — sin cambios de lógica, estética actualizada
──────────────────────────────────────────────── */
const CANVAS_META = {
  mermaid:    { label: "diagrama", color: "#6366f1" },
  html:       { label: "interfaz web", color: "#00d4ff" },
  svg:        { label: "svg", color: "#f59e0b" },
  react:      { label: "componente", color: "#06b6d4" },
  javascript: { label: "script js", color: "#eab308" },
  css:        { label: "css", color: "#ec4899" },
};

function CanvasPanel({ artifact, onExpand }) {
  const meta = CANVAS_META[artifact.type] || { label: "código", color: "#00d4ff" };
  const [tab, setTab] = useState("preview");
  const hasPreview = ["mermaid", "html", "svg"].includes(artifact.type);

  const renderPreview = () => {
    switch (artifact.type) {
      case "mermaid": return <MermaidCanvas code={artifact.code} />;
      case "html":    return <HtmlCanvas code={artifact.code} />;
      case "svg":     return <SvgCanvas code={artifact.code} />;
      default:        return <CodeCanvas code={artifact.code} type={artifact.type} />;
    }
  };

  return (
    <div style={{ margin: "12px 0", borderRadius: 6, overflow: "hidden", border: `1px solid ${meta.color}33`, background: "rgba(4,4,10,0.9)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: `${meta.color}0a`, borderBottom: `1px solid ${meta.color}1a` }}>
        <span style={{ fontSize: 10, color: meta.color, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.15em" }}>// {meta.label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasPreview && (
            <div style={{ display: "flex", background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: 2, gap: 2 }}>
              {["preview", "code"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "rgba(0,212,255,0.1)" : "transparent", border: "none", borderRadius: 3, padding: "2px 8px", color: tab === t ? "#00d4ff" : "rgba(0,212,255,0.35)", fontSize: 9, fontWeight: tab === t ? 600 : 400, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.05em", transition: "all 0.15s" }}>{t}</button>
              ))}
            </div>
          )}
          <button onClick={() => onExpand?.(artifact)} style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}30`, borderRadius: 4, padding: "2px 10px", color: meta.color, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer", letterSpacing: "0.05em" }}>fullscreen</button>
        </div>
      </div>
      <div style={{ maxHeight: 480, overflow: "auto" }}>
        {tab === "preview" ? renderPreview() : <CodeCanvas code={artifact.code} type={artifact.type} />}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   CANVAS FULLSCREEN MODAL — sin cambios de lógica
──────────────────────────────────────────────── */
function CanvasModal({ artifact, onClose }) {
  const [tab, setTab] = useState("preview");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!artifact) return null;
  const meta = CANVAS_META[artifact.type] || { label: "código", color: "#00d4ff" };
  const renderContent = () => {
    switch (artifact.type) {
      case "mermaid": return <MermaidCanvas code={artifact.code} />;
      case "html":    return <HtmlCanvas code={artifact.code} />;
      case "svg":     return <SvgCanvas code={artifact.code} />;
      default:        return <CodeCanvas code={artifact.code} type={artifact.type} />;
    }
  };
  const hasPreview = ["mermaid", "html", "svg"].includes(artifact.type);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeSlideUp 0.2s ease" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "95vw", maxWidth: 1200, height: "90vh", display: "flex", flexDirection: "column", background: "#04040a", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: `${meta.color}08`, borderBottom: `1px solid ${meta.color}18`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: meta.color, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.15em" }}>// {meta.label}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {hasPreview && (
              <div style={{ display: "flex", background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: 2 }}>
                {["preview", "code"].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "rgba(0,212,255,0.1)" : "transparent", border: "none", borderRadius: 3, padding: "3px 12px", color: tab === t ? "#00d4ff" : "rgba(0,212,255,0.35)", fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>{t}</button>
                ))}
              </div>
            )}
            <button onClick={() => navigator.clipboard.writeText(artifact.code)} style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: "3px 10px", color: "rgba(0,212,255,0.5)", fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>copiar</button>
            <button onClick={onClose} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "3px 10px", color: "#ef4444", fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>✕ cerrar</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "preview" ? renderContent() : <CodeCanvas code={artifact.code} type={artifact.type} />}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   THINKING INDICATOR — rediseñado: línea cian pulsante
──────────────────────────────────────────────── */
function ThinkingIndicator({ botName, action }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const PHRASES = ["analizando...", "consultando bots...", "procesando...", "pensando...", "buscando..."];
  useEffect(() => {
    const iv = setInterval(() => setPhraseIdx(p => (p + 1) % PHRASES.length), 2200);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ padding: "14px 24px 10px", animation: "fadeSlideUp 0.25s ease both" }}>
      {/* Línea cian pulsante */}
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #00d4ff, transparent)", animation: "thinkLine 1.5s ease-in-out infinite", marginBottom: 8, borderRadius: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {botName && botName !== "unknown" && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.5)", letterSpacing: "0.15em", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 3, padding: "1px 8px" }}>{botName}</span>
        )}
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "rgba(0,212,255,0.4)", letterSpacing: "0.1em" }}>
          {action || PHRASES[phraseIdx]}
        </span>
        <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#00d4ff", display: "block", animation: "thinkDot 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s`, opacity: 0.6 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   TYPEWRITER — sin cambios
──────────────────────────────────────────────── */
function useTypewriter(text, speed = 8) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!text) return;
    setDisplayed(""); setDone(false); let i = 0;
    ref.current = setInterval(() => {
      i++; setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(ref.current); setDone(true); }
    }, speed);
    return () => clearInterval(ref.current);
  }, [text, speed]);
  return { displayed, done };
}

/* ────────────────────────────────────────────────
   QR WIDGET — sin cambios de lógica
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
          setCountdown(p => { if (p <= 1) { clearInterval(countdownRef.current); fetchQR(); return 60; } return p - 1; });
        }, 1000);
      } else if (data.status === "connected") { setStatus("connected"); setQrData(null); }
      else { setStatus(data.status || "waiting"); }
    } catch { setStatus("error"); }
  }, []);
  useEffect(() => {
    fetchQR();
    const iv = setInterval(() => { if (status !== "connected") fetchQR(); }, 8000);
    return () => { clearInterval(iv); clearInterval(countdownRef.current); };
  }, [fetchQR, status]);
  if (status === "connected") return <div style={{ margin: "8px 0", padding: "10px 14px", background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 6, fontSize: 12, color: "#00d4ff", fontFamily: "'JetBrains Mono',monospace" }}>✓ whatsapp conectado</div>;
  if (!qrData) return <div style={{ margin: "8px 0", padding: "10px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 6 }}><span style={{ fontSize: 12, color: "rgba(0,212,255,0.4)", fontFamily: "'JetBrains Mono',monospace" }}>{status === "waiting" ? "activá WhatsAppBot en Bots..." : "generando QR..."}</span></div>;
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ fontSize: 11, color: "rgba(0,212,255,0.4)", marginBottom: 8, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em" }}>// escanear con WhatsApp → dispositivos vinculados</div>
      <div style={{ display: "inline-block", padding: 8, background: "#fff", borderRadius: 6, border: "1px solid rgba(0,212,255,0.2)" }}>
        <img src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`} alt="QR" style={{ width: 180, height: 180, display: "block" }} />
      </div>
      <div style={{ fontSize: 10, color: countdown < 15 ? "#ef4444" : "rgba(0,212,255,0.3)", marginTop: 6, fontFamily: "'JetBrains Mono',monospace" }}>expira en {countdown}s</div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   ASSISTANT MESSAGE — rediseño: terminal, sin burbuja
──────────────────────────────────────────────── */
function AssistantMessage({ msg, isNew, onOpenCanvas }) {
  const { displayed, done } = useTypewriter(isNew ? msg.content : null, 8);
  const text = isNew ? displayed : msg.content || "";
  const isError = msg.role === "error";
  const rawContent = msg.content || "";
  const artifact = rawContent ? detectArtifact(rawContent) : null;
  const cleanText = (() => {
    if (!artifact || !rawContent) return rawContent;
    try { return rawContent.replace(artifact.raw, "").trim(); } catch { return rawContent; }
  })();
  const displayText = isNew && !done ? (text || "") : (cleanText || "");
  const showArtifact = !!(artifact?.code && typeof artifact.code === "string");

  return (
    <div style={{ display: "flex", justifyContent: "flex-start", padding: "10px 24px", animation: isNew ? "fadeSlideUp 0.25s ease both" : "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, maxWidth: "84%", minWidth: 0 }}>
        {/* Indicador lateral cian — sin avatar */}
        <div style={{ width: 2, background: isError ? "#ef4444" : "rgba(0,212,255,0.4)", borderRadius: 1, flexShrink: 0, marginTop: 4, alignSelf: "stretch", minHeight: 20 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Meta: bot + corrección */}
          {msg.bot && msg.bot !== "unknown" && !isError && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.4)", letterSpacing: "0.15em", marginBottom: 6 }}>
              // {msg.bot}
            </div>
          )}
          {msg.correction && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "rgba(245,158,11,0.7)", marginBottom: 8, letterSpacing: "0.05em" }}>
              ✏ entendí: <em style={{ color: "#f59e0b", fontStyle: "normal" }}>"{msg.correction}"</em>
            </div>
          )}
          {/* Contenido */}
          <div style={{
            fontSize: 14, lineHeight: 1.8,
            color: isError ? "#f87171" : "#c8dce4",
            fontFamily: isError ? "'JetBrains Mono',monospace" : "'Rajdhani',sans-serif",
            fontWeight: isError ? 400 : 500,
            wordBreak: "break-word",
          }}>
            {isError ? displayText : renderMarkdown(displayText)}
            {isNew && !done && !isError && (
              <span style={{ display: "inline-block", width: 7, height: 14, background: "#00d4ff", marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.7s step-end infinite", opacity: 0.8 }} />
            )}
          </div>
          {/* Artifact */}
          {showArtifact && <CanvasPanel artifact={artifact} onExpand={onOpenCanvas} />}
          {msg.showQR && (done || !isNew) && <InlineWhatsAppQR />}
          {/* Intent */}
          {msg.intent && !isError && (
            <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.25)", letterSpacing: "0.1em", opacity: done || !isNew ? 1 : 0, transition: "opacity 0.4s ease" }}>
              ↳ {msg.intent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   USER MESSAGE — rediseño: burbuja derecha cian tenue
──────────────────────────────────────────────── */
function UserMessage({ msg, isNew }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 24px", animation: isNew ? "fadeSlideUp 0.2s ease both" : "none" }}>
      <div style={{ maxWidth: "68%" }}>
        <div style={{
          background: "rgba(0,212,255,0.07)",
          border: "1px solid rgba(0,212,255,0.18)",
          borderRadius: "12px 12px 3px 12px",
          padding: "10px 16px",
          fontSize: 14,
          lineHeight: 1.7,
          color: "#d0e8f0",
          fontFamily: "'Rajdhani',sans-serif",
          fontWeight: 500,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}>
          {msg.content}
          {msg.isAudio && <span style={{ marginLeft: 8, fontSize: 10, color: "rgba(0,212,255,0.4)", fontFamily: "'JetBrains Mono',monospace" }}> // voz</span>}
          {msg.isFile && <span style={{ marginLeft: 8, fontSize: 10, color: "rgba(0,212,255,0.4)", fontFamily: "'JetBrains Mono',monospace" }}> // archivo</span>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   AUDIO RECORDER — lógica intacta
──────────────────────────────────────────────── */
function AudioRecorder({ onTranscribed, disabled }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [floatError, setFloatError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordingRef = useRef(false);
  const recognitionRef = useRef(null);

  const showError = (msg) => { setFloatError(msg); setTimeout(() => setFloatError(null), 3500); };
  const getMimeType = () => { const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]; return types.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm"; };

  const transcribeAudio = useCallback(async (blob) => {
    if (!blob || blob.size < 500) { showError("audio demasiado corto"); setProcessing(false); return; }
    setProcessing(true);
    try {
      const fd = new FormData();
      const mimeType = blob.type || "audio/webm";
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, `rec.${ext}`);
      const res = await fetch(`${API}/api/stt/transcribe`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.errorCode === "USE_BROWSER_STT" || !data.success) showError("usá el ícono 🎤 y hablá directamente");
      else if (!data.text?.trim()) showError("no se detectó voz");
      else onTranscribed(data.text.trim());
    } catch { showError("error de conexión"); }
    setProcessing(false);
  }, [onTranscribed]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false; setRecording(false);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") mr.stop();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  const startBrowserSTT = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showError("usá Chrome para STT"); return; }
    const recognition = new SR();
    recognition.lang = "es-AR"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onresult = e => { const text = e.results[0][0].transcript.trim(); if (text) onTranscribed(text); setRecording(false); recordingRef.current = false; };
    recognition.onerror = e => { if (e.error !== "aborted") showError(`error STT: ${e.error}`); setRecording(false); recordingRef.current = false; };
    recognition.onend = () => { if (recordingRef.current) { setRecording(false); recordingRef.current = false; } };
    recognition.start(); recordingRef.current = true; setRecording(true);
  }, [onTranscribed]);

  const stopBrowserSTT = useCallback(() => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    recordingRef.current = false; setRecording(false);
  }, []);

  const startMediaRecorder = useCallback(async () => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (err) { showError(err.name === "NotAllowedError" ? "permiso denegado" : `mic no disponible: ${err.message}`); return; }
    streamRef.current = stream; chunksRef.current = [];
    const mimeType = getMimeType();
    let mr; try { mr = new MediaRecorder(stream, { mimeType }); } catch { mr = new MediaRecorder(stream); }
    mediaRecorderRef.current = mr;
    mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => { const finalMime = mr.mimeType || mimeType; const blob = new Blob(chunksRef.current, { type: finalMime }); transcribeAudio(blob); };
    mr.onerror = () => { showError("error durante grabación"); setRecording(false); recordingRef.current = false; };
    mr.start(100); recordingRef.current = true; setRecording(true);
  }, [transcribeAudio]);

  const handleClick = useCallback(() => {
    if (disabled || processing) return;
    if (recordingRef.current) { if (recognitionRef.current) stopBrowserSTT(); else stopRecording(); }
    else { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (SR) startBrowserSTT(); else startMediaRecorder(); }
  }, [disabled, processing, stopBrowserSTT, stopRecording, startBrowserSTT, startMediaRecorder]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={handleClick} disabled={disabled || processing} title={recording ? "click para enviar" : "grabar voz"}
        style={{ width: 30, height: 30, borderRadius: 4, border: recording ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(0,212,255,0.15)", background: recording ? "rgba(239,68,68,0.12)" : "transparent", color: recording ? "#ef4444" : "rgba(0,212,255,0.4)", cursor: disabled || processing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "all 0.15s", animation: recording ? "pulseMic 1s ease-in-out infinite" : "none" }}>
        {processing ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 12 }}>⟳</span> : recording ? "⏹" : "🎤"}
      </button>
      {recording && <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: 9, padding: "3px 8px", borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.05em", zIndex: 10 }}>● escuchando... click para enviar</div>}
      {floatError && <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.95)", color: "#fff", fontSize: 10, padding: "5px 10px", borderRadius: 4, whiteSpace: "nowrap", zIndex: 100, pointerEvents: "none", maxWidth: 260, textAlign: "center", fontFamily: "'JetBrains Mono',monospace" }}>⚠ {floatError}</div>}
      {recording && <div style={{ position: "absolute", inset: -4, borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", animation: "ringPulse 1s ease-in-out infinite", pointerEvents: "none" }} />}
    </div>
  );
}

/* ────────────────────────────────────────────────
   UPLOAD BUTTON — lógica intacta
──────────────────────────────────────────────── */
function UploadButton({ onUpload, disabled }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ""; onUpload(f); } }} />
      <button onClick={() => ref.current?.click()} disabled={disabled} title="adjuntar imagen o PDF"
        style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid rgba(0,212,255,0.15)", background: "transparent", color: "rgba(0,212,255,0.4)", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, transition: "all 0.15s" }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.color = "#00d4ff"; e.currentTarget.style.borderColor = "rgba(0,212,255,0.4)"; } }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(0,212,255,0.4)"; e.currentTarget.style.borderColor = "rgba(0,212,255,0.15)"; }}>
        📎
      </button>
    </>
  );
}

/* ────────────────────────────────────────────────
   HELPERS — sin cambios de lógica
──────────────────────────────────────────────── */
function shouldShowQR(msg) {
  const l = msg.toLowerCase();
  return (l.includes("whatsapp") || l.includes("wsp")) && (l.includes("qr") || l.includes("conectar") || l.includes("vincular"));
}
function dbRoleToDisplay(r) { if (r === "user") return "user"; if (r === "error") return "error"; return "assistant"; }
function guessBot(msg) {
  const l = msg.toLowerCase();
  if (l.includes("buscá") || l.includes("busca") || l.includes("google") || l.includes("web") || l.includes("quién") || l.includes("qué es")) return { botName: "SearchBot", action: "buscando en la web..." };
  if (l.includes("youtube") || l.includes("spotify") || l.includes("música")) return { botName: "MediaBot", action: "controlando multimedia..." };
  if (l.includes("whatsapp") || l.includes("wsp")) return { botName: "WhatsAppBot", action: "procesando whatsapp..." };
  if (l.includes("docs") || l.includes("documento") || l.includes("google")) return { botName: "ComputerBot", action: "trabajando en docs..." };
  if (l.includes("screenshot") || l.includes("captura") || l.includes("volumen")) return { botName: "BatBot", action: "ejecutando en el sistema..." };
  if (l.includes("diagrama") || l.includes("gráfico") || l.includes("chart") || l.includes("mermaid")) return { botName: "WebBot", action: "generando diagrama..." };
  if (l.includes("diseñ") || l.includes("interfaz") || l.includes("html")) return { botName: "WebBot", action: "diseñando interfaz..." };
  return { botName: null, action: null };
}
function handleExternalCommand(text) {
  const l = text.toLowerCase();
  const OPENS = { youtube: "https://youtube.com", spotify: "https://open.spotify.com", discord: "https://discord.com/app", gmail: "https://mail.google.com", "google docs": "https://docs.google.com", "google drive": "https://drive.google.com", github: "https://github.com" };
  if (/\b(abrí|abrir|open|lanzar|launch|ir a)\b/i.test(l)) { for (const [site, url] of Object.entries(OPENS)) { if (l.includes(site)) { window.open(url, "_blank"); return true; } } }
  return false;
}
function correctPrompt(text) {
  if (!text) return { text: "", changed: false };
  const rules = [
    [/\bwhastsapp\b/gi, "whatsapp"], [/\bwhatsa?pp?\b/gi, "whatsapp"], [/\bwsp\b/gi, "whatsapp"],
    [/\byuotube\b/gi, "youtube"], [/\byoutub\b/gi, "youtube"],
    [/\bspotif[ay]+\b/gi, "spotify"], [/\bchr?ome\b/gi, "chrome"], [/\bdiscrod\b/gi, "discord"],
    [/\bvolumne\b/gi, "volumen"], [/\bmusica\b/gi, "música"], [/\bcancion\b/gi, "canción"],
  ];
  let result = text;
  for (const [re, rep] of rules) { try { result = result.replace(re, rep); } catch {} }
  return { text: result, changed: result !== text };
}

/* ────────────────────────────────────────────────
   MAIN CHAT — prop setView agregada para volver al Shell
──────────────────────────────────────────────── */
function Chat({
  propConvId = null,
  onReady,
  globalWakeWordState,
  globalWakeWordEnabled,
  onToggleWakeWord,
  setView,          // ← NUEVO: para volver al Shell
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
  const [canvasArtifact, setCanvasArtifact] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
        if (Array.isArray(data) && data.length > 0)
          setMessages(data.map(m => ({ role: dbRoleToDisplay(m.role), content: m.content || "", intent: m.intent || null, bot: m.bot || null })));
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
    setMessages(prev => { const next = [...prev, { role, content, ...extra }]; setNewMsgIdx(next.length - 1); return next; });
  };

  /* ── sendMessage — INTACTO ── */
  const sendMessage = useCallback(async (text, extra = {}) => {
    const raw = (text || input).trim();
    if (!raw || loading) return;

    const { text: trimmed, changed: wasCorrect } = correctPrompt(raw);
    const wantsQR = shouldShowQR(trimmed);
    const { botName, action } = guessBot(trimmed);

    if (handleExternalCommand(trimmed)) {
      addMessage("user", raw, extra);
      addMessage("assistant", "✓ abriendo en el navegador...", { bot: "SystemBot" });
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
        } catch (e) { console.warn("no se pudo guardar memoria:", e.message); }
      }

      const historyForContext = messages.filter(m => m.role !== "thinking");
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
      addMessage("error", `error de conexión: ${err.message}`);
    }

    setLoading(false); setThinkingBot(null); setThinkingAction(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [input, loading, conversationId, messages]);

  useEffect(() => { onReady?.(sendMessage); }, [sendMessage, onReady]);

  /* ── handleUpload — INTACTO ── */
  const handleUpload = async (file) => {
    const isPDF = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPDF && !isImage) { addMessage("error", `tipo no soportado: ${file.type}`); return; }
    setUploadLabel(`${file.name}`);
    setLoading(true); setThinkingBot("GemmaBot"); setThinkingAction(isPDF ? "analizando PDF..." : "analizando imagen...");
    addMessage("user", `[${isPDF ? "PDF" : "imagen"}: ${file.name}]`, { isFile: true });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("query", input.trim() || (isPDF ? "Resumí y analizá este PDF detalladamente." : "Describí y analizá esta imagen detalladamente."));
      fd.append("fileType", isPDF ? "pdf" : "image");
      const res = await fetch(`${API}/api/gemma/analyze`, { method: "POST", body: fd });
      const data = await res.json();
      let reply = data.reply || data.error || "No se pudo procesar.";
      if (isRawIntentJSON(reply)) reply = `no pude analizar ese ${isPDF ? "PDF" : "archivo"}.`;
      else reply = stripIntentBlocks(reply);
      addMessage(data.success === false ? "error" : "assistant", reply, { intent: data.intent, bot: data.bot || "GemmaBot" });
    } catch (err) { addMessage("error", `error al procesar: ${err.message}`); }
    setLoading(false); setThinkingBot(null); setThinkingAction(null); setUploadLabel("");
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const isListening = wakeWordState === "listening";
  const isProcessing = wakeWordState === "processing";
  const wakeWordEnabled = globalWakeWordEnabled ?? true;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;700&family=JetBrains+Mono:wght@300;400&display=swap');

        /* ── Reset chat ─── */
        .chat-sistema * { box-sizing: border-box; }

        /* ── Layout raíz ── */
        .chat-sistema {
          position: fixed;
          inset: 0;
          background: #04040a;
          display: flex;
          flex-direction: column;
          font-family: 'Rajdhani', sans-serif;
          z-index: 10;
        }

        /* ── Grilla de fondo ── */
        .chat-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,212,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,.025) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        /* ── Header ── */
        .chat-hdr {
          position: relative;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          height: 48px;
          border-bottom: 1px solid rgba(0,212,255,0.08);
          background: rgba(4,4,10,0.95);
          flex-shrink: 0;
        }
        .chat-hdr-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .chat-hdr-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* ── Botón volver al Shell ── */
        .btn-shell {
          width: 34px;
          height: 34px;
          border-radius: 5px;
          border: 1px solid rgba(0,212,255,0.2);
          background: rgba(0,212,255,0.05);
          color: rgba(0,212,255,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          outline: none;
        }
        .btn-shell:hover {
          border-color: rgba(0,212,255,0.5);
          background: rgba(0,212,255,0.12);
          color: #00d4ff;
          box-shadow: 0 0 12px rgba(0,212,255,0.15);
        }

        /* ── Mensajes ── */
        .chat-msgs {
          flex: 1;
          overflow-y: auto;
          position: relative;
          z-index: 2;
          padding: 12px 0 8px;
          scroll-behavior: smooth;
        }
        .chat-msgs::-webkit-scrollbar { width: 3px; }
        .chat-msgs::-webkit-scrollbar-track { background: transparent; }
        .chat-msgs::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }

        /* ── Input area ── */
        .chat-inp-wrap {
          position: relative;
          z-index: 5;
          padding: 12px 20px 16px;
          background: rgba(4,4,10,0.95);
          border-top: 1px solid rgba(0,212,255,0.08);
          flex-shrink: 0;
        }
        .chat-inp-inner {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          max-width: 800px;
          margin: 0 auto;
          border: 1px solid rgba(0,212,255,0.18);
          border-radius: 6px;
          padding: 8px 10px;
          background: rgba(0,0,0,0.3);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .chat-inp-inner:focus-within {
          border-color: rgba(0,212,255,0.35);
          box-shadow: 0 0 20px rgba(0,212,255,0.06);
        }
        .chat-inp-inner.listening {
          border-color: rgba(239,68,68,0.4);
          box-shadow: 0 0 20px rgba(239,68,68,0.08);
          animation: listeningPulse 1.5s ease-in-out infinite;
        }
        .chat-inp-inner.processing {
          border-color: rgba(0,212,255,0.4);
          box-shadow: 0 0 20px rgba(0,212,255,0.1);
        }
        @keyframes listeningPulse {
          0%,100% { box-shadow: 0 0 10px rgba(239,68,68,0.06); }
          50%      { box-shadow: 0 0 24px rgba(239,68,68,0.2); }
        }

        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: #c8dce4;
          font-family: 'Rajdhani', sans-serif;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.5;
          min-height: 24px;
          max-height: 200px;
          padding: 0;
          overflow-y: auto;
        }
        .chat-textarea::placeholder {
          color: rgba(0,212,255,0.2);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.05em;
        }
        .chat-textarea::-webkit-scrollbar { width: 2px; }
        .chat-textarea::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); }

        .btn-send {
          width: 32px;
          height: 32px;
          border-radius: 4px;
          border: 1px solid rgba(0,212,255,0.3);
          background: rgba(0,212,255,0.1);
          color: #00d4ff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
          font-size: 16px;
          outline: none;
        }
        .btn-send:hover:not(:disabled) {
          background: rgba(0,212,255,0.2);
          box-shadow: 0 0 12px rgba(0,212,255,0.2);
        }
        .btn-send:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        .chat-hint {
          max-width: 800px;
          margin: 6px auto 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          color: rgba(0,212,255,0.2);
          letter-spacing: 0.1em;
          text-align: center;
        }

        /* ── Upload label ── */
        .upload-label {
          max-width: 800px;
          margin: 0 auto 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          border: 1px solid rgba(0,212,255,0.15);
          border-radius: 4px;
          background: rgba(0,212,255,0.04);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(0,212,255,0.5);
          letter-spacing: 0.08em;
        }
        .upload-label button {
          background: none;
          border: none;
          color: rgba(0,212,255,0.3);
          cursor: pointer;
          margin-left: auto;
          font-size: 14px;
          line-height: 1;
          padding: 0;
        }

        /* ── Animaciones ── */
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin        { to { transform:rotate(360deg); } }
        @keyframes pulseMic    { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
        @keyframes ringPulse   { 0%,100%{opacity:.8;transform:scale(1)} 50%{opacity:.3;transform:scale(1.1)} }
        @keyframes thinkLine   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes thinkDot    { 0%,80%,100%{transform:scale(.6);opacity:.3} 40%{transform:scale(1);opacity:1} }
      `}</style>

      <div className="chat-sistema">
        <div className="chat-grid" />

        {/* ── HEADER ── */}
        <div className="chat-hdr">
          <div className="chat-hdr-left">
            {/* Botón volver al Shell — siempre visible, BUG 1 */}
            <button
              className="btn-shell"
              onClick={() => setView?.("shell")}
              title="Volver al Shell"
              aria-label="Volver al Shell"
            >
              {/* Icono casa / home SVG minimalista */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
                <path d="M9 22V12h6v10"/>
              </svg>
            </button>

            <div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color: "rgba(0,212,255,0.85)", letterSpacing: "0.2em" }}>SISTEMA</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.3)", letterSpacing: "0.1em", marginTop: 1 }}>gemma-4 · lm-studio · :3001</div>
            </div>
          </div>

          <div className="chat-hdr-right">
            {conversationId && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.2)", letterSpacing: "0.1em" }}>#{conversationId.slice(-6)}</span>
            )}
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.2)", letterSpacing: "0.08em" }}>{messages.length - 1} msgs</span>
            {/* Toggle sidebar historial */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              title="Historial"
              style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid rgba(0,212,255,0.12)", background: sidebarOpen ? "rgba(0,212,255,0.08)" : "transparent", color: sidebarOpen ? "#00d4ff" : "rgba(0,212,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            {/* Toggle wake word */}
            <button
              onClick={() => onToggleWakeWord?.(!wakeWordEnabled)}
              title={wakeWordEnabled ? "wake word activo" : "wake word inactivo"}
              style={{ width: 30, height: 30, borderRadius: 4, border: isListening ? "1px solid rgba(239,68,68,0.5)" : wakeWordEnabled ? "1px solid rgba(0,212,255,0.25)" : "1px solid rgba(0,212,255,0.08)", background: isListening ? "rgba(239,68,68,0.1)" : wakeWordEnabled ? "rgba(0,212,255,0.06)" : "transparent", color: isListening ? "#ef4444" : wakeWordEnabled ? "rgba(0,212,255,0.6)" : "rgba(0,212,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "all 0.2s", animation: isListening ? "pulseMic 1.5s ease-in-out infinite" : "none" }}
            >
              {isListening ? "●" : isProcessing ? "⟳" : wakeWordEnabled ? "◎" : "○"}
            </button>
          </div>
        </div>

        {/* ── MENSAJES ── */}
        <div className="chat-msgs">
          {propConvId && !historyLoaded && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: "rgba(0,212,255,0.3)", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em" }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 8 }}>⟳</span>cargando historial...
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

        {/* ── INPUT ── */}
        <div className="chat-inp-wrap">
          {uploadLabel && (
            <div className="upload-label">
              <span>// {uploadLabel}</span>
              <button onClick={() => setUploadLabel("")}>×</button>
            </div>
          )}
          <div className={`chat-inp-inner${isListening ? " listening" : isProcessing ? " processing" : ""}`}>
            <UploadButton onUpload={handleUpload} disabled={loading} />
            <AudioRecorder onTranscribed={t => { if (t.trim()) sendMessage(t, { isAudio: true }); }} disabled={loading} />
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening ? "● escuchando... decí 'enviar' para terminar" :
                isProcessing ? "⟳ procesando audio..." :
                "escribí o decí → sistema [comando]"
              }
              disabled={loading || isListening}
              rows={1}
              autoFocus
            />
            <button className="btn-send" onClick={() => sendMessage()} disabled={loading || !input.trim()} title="enviar (Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
          <div className="chat-hint">enter · 🎤 voz · 📎 archivo · ◎ "sistema [comando]"</div>
        </div>
      </div>

      {/* ── Canvas fullscreen modal ── */}
      {canvasArtifact && <CanvasModal artifact={canvasArtifact} onClose={() => setCanvasArtifact(null)} />}
    </>
  );
}

export default Chat;