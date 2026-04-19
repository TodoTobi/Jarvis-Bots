/**
 * ArtifactCanvas.jsx — v2
 *
 * Renderiza contenido visual generado por Gemma 4:
 *  - Mermaid  → diagramas de flujo, secuencia, ER, etc
 *  - HTML     → diseños completos en iframe sandboxed
 *  - SVG      → ilustraciones inline
 *  - React    → componentes (renderizados en iframe)
 *  - Chart.js → gráficos de datos
 *
 * Uso:
 *   import ArtifactCanvas, { useArtifactDetector } from "./ArtifactCanvas";
 *
 *   // En el componente de chat:
 *   const { artifact, clearArtifact } = useArtifactDetector(botReply);
 *   {artifact && <ArtifactCanvas artifact={artifact} onClose={clearArtifact} />}
 */

import { useState, useEffect, useRef, useCallback } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// ── Hook: detecta automáticamente artefactos en el texto del bot ─────────────
export function useArtifactDetector(text) {
    const [artifact, setArtifact] = useState(null);

    useEffect(() => {
        if (!text) return;
        const detected = detectArtifact(text);
        if (detected) setArtifact(detected);
    }, [text]);

    const clearArtifact = useCallback(() => setArtifact(null), []);

    return { artifact, clearArtifact };
}

// Detecta bloques de código en el texto de respuesta del bot
function detectArtifact(text) {
    const patterns = [
        { regex: /```mermaid\n([\s\S]+?)\n```/,    type: "mermaid" },
        { regex: /```html\n([\s\S]+?)\n```/,       type: "html" },
        { regex: /```svg\n([\s\S]+?)\n```/,        type: "svg" },
        { regex: /```jsx\n([\s\S]+?)\n```/,        type: "react" },
        { regex: /```javascript\n([\s\S]+?)\n```/, type: "javascript" },
        { regex: /```js\n([\s\S]+?)\n```/,         type: "javascript" },
    ];

    for (const { regex, type } of patterns) {
        const match = text.match(regex);
        if (match) {
            return { type, code: match[1].trim() };
        }
    }
    return null;
}

// ── Cargador de Mermaid (CDN) ────────────────────────────────────────────────
let mermaidLoaded = false;
let mermaidLoading = false;
const mermaidCallbacks = [];

function loadMermaid() {
    return new Promise((resolve) => {
        if (mermaidLoaded) { resolve(window.mermaid); return; }
        mermaidCallbacks.push(resolve);
        if (mermaidLoading) return;
        mermaidLoading = true;

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1/mermaid.min.js";
        script.onload = () => {
            window.mermaid.initialize({
                startOnLoad: false,
                theme: "dark",
                themeVariables: {
                    primaryColor: "#3b82f6",
                    primaryTextColor: "#f9fafb",
                    primaryBorderColor: "#1d4ed8",
                    lineColor: "#6b7280",
                    sectionBkgColor: "#1f2937",
                    altSectionBkgColor: "#111827",
                    gridColor: "#374151",
                    secondaryColor: "#1f2937",
                    tertiaryColor: "#111827",
                    background: "#0f172a",
                    mainBkg: "#1e293b",
                    nodeBorder: "#3b82f6",
                    clusterBkg: "#1e293b",
                    titleColor: "#f9fafb",
                    edgeLabelBackground: "#1f2937",
                    activeTaskBkgColor: "#3b82f6",
                    activeTaskBorderColor: "#1d4ed8",
                },
                flowchart: { useMaxWidth: true, htmlLabels: true },
            });
            mermaidLoaded = true;
            mermaidCallbacks.forEach(cb => cb(window.mermaid));
            mermaidCallbacks.length = 0;
        };
        script.onerror = () => {
            console.error("No se pudo cargar Mermaid desde CDN");
            mermaidCallbacks.forEach(cb => cb(null));
            mermaidCallbacks.length = 0;
        };
        document.head.appendChild(script);
    });
}

// ── Renderizadores por tipo ──────────────────────────────────────────────────

function MermaidRenderer({ code }) {
    const containerRef = useRef(null);
    const [error, setError] = useState(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const render = async () => {
            const mermaid = await loadMermaid();
            if (cancelled || !mermaid || !containerRef.current) return;
            try {
                const id = `mermaid-${Date.now()}`;
                const { svg } = await mermaid.render(id, code);
                if (!cancelled && containerRef.current) {
                    containerRef.current.innerHTML = svg;
                    setLoaded(true);
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
        };
        render();
        return () => { cancelled = true; };
    }, [code]);

    if (error) return (
        <div style={{ padding: "16px", color: "#ef4444", fontSize: "13px" }}>
            <p>❌ Error al renderizar diagrama:</p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", opacity: 0.8 }}>{error}</pre>
            <p style={{ opacity: 0.6 }}>Código Mermaid crudo:</p>
            <pre style={{ background: "#1f2937", padding: "8px", borderRadius: "6px", overflowX: "auto", fontSize: "12px" }}>{code}</pre>
        </div>
    );

    return (
        <div style={{ position: "relative" }}>
            {!loaded && (
                <div style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>
                    ⏳ Renderizando diagrama...
                </div>
            )}
            <div ref={containerRef} style={{
                display: loaded ? "block" : "none",
                padding: "16px",
                overflowX: "auto",
            }} />
        </div>
    );
}

function HtmlRenderer({ code }) {
    // Inyectar tema oscuro y estilos base en el HTML
    const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0f172a;
    color: #f9fafb;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    padding: 16px;
  }
  a { color: #60a5fa; }
  input, textarea, select, button {
    font-family: inherit;
    background: #1e293b;
    color: #f9fafb;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 6px 12px;
  }
  button { cursor: pointer; }
  button:hover { background: #2d3748; }
</style>
</head>
<body>
${code}
</body>
</html>`;

    return (
        <iframe
            srcDoc={wrappedHtml}
            sandbox="allow-scripts allow-same-origin"
            style={{
                width: "100%",
                minHeight: "400px",
                border: "none",
                background: "#0f172a",
                borderRadius: "8px",
            }}
            onLoad={(e) => {
                // Ajustar altura al contenido
                try {
                    const iframe = e.target;
                    iframe.style.height = (iframe.contentDocument.body.scrollHeight + 32) + "px";
                } catch (_) {}
            }}
        />
    );
}

function SvgRenderer({ code }) {
    // Limpiar el SVG y asegurarse que tenga viewBox
    const cleanSvg = code.includes("viewBox") ? code : code.replace("<svg", '<svg viewBox="0 0 800 600"');
    return (
        <div style={{ padding: "16px", overflowX: "auto" }}>
            <div dangerouslySetInnerHTML={{ __html: cleanSvg }} style={{ maxWidth: "100%", textAlign: "center" }} />
        </div>
    );
}

function CodeRenderer({ code, type }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div style={{ position: "relative" }}>
            <button onClick={copy} style={{
                position: "absolute", top: "8px", right: "8px",
                padding: "4px 10px", fontSize: "12px",
                background: "#1e293b", color: "#9ca3af",
                border: "1px solid #374151", borderRadius: "4px",
            }}>
                {copied ? "✓ Copiado" : "Copiar"}
            </button>
            <pre style={{
                background: "#0f172a",
                color: "#e2e8f0",
                padding: "16px",
                overflowX: "auto",
                fontSize: "13px",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineHeight: "1.5",
                borderRadius: "0",
                margin: 0,
            }}>
                <code>{code}</code>
            </pre>
        </div>
    );
}

// ── Botón "Generar en Canvas" ────────────────────────────────────────────────
export function CanvasButton({ prompt, type = "auto", onResult }) {
    const [loading, setLoading] = useState(false);

    const generate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/gemma/canvas`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, type }),
            });
            const data = await res.json();
            if (data.success) {
                onResult?.({ type: data.type, code: data.code });
            }
        } catch (e) {
            console.error("[Canvas] Error:", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button onClick={generate} disabled={loading} style={{
            padding: "6px 14px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
        }}>
            {loading ? "⏳ Generando..." : "🎨 Mostrar en Canvas"}
        </button>
    );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ArtifactCanvas({ artifact, onClose, title }) {
    const [fullscreen, setFullscreen] = useState(false);

    if (!artifact) return null;

    const { type, code } = artifact;

    const typeLabels = {
        mermaid: "📊 Diagrama",
        html: "🌐 Diseño HTML",
        svg: "🎨 Ilustración SVG",
        react: "⚛️ Componente",
        javascript: "📈 Código JS",
    };

    const renderContent = () => {
        switch (type) {
            case "mermaid":    return <MermaidRenderer code={code} />;
            case "html":       return <HtmlRenderer code={code} />;
            case "svg":        return <SvgRenderer code={code} />;
            case "react":
            case "javascript": return <CodeRenderer code={code} type={type} />;
            default:           return <CodeRenderer code={code} type={type} />;
        }
    };

    const containerStyle = fullscreen ? {
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
    } : {
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #1e293b",
        background: "#0f172a",
        marginTop: "12px",
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                background: "#1e293b",
                borderBottom: "1px solid #334155",
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9" }}>
                        {typeLabels[type] || "🎨 Canvas"}
                    </span>
                    {title && (
                        <span style={{ fontSize: "12px", color: "#64748b" }}>— {title}</span>
                    )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        onClick={() => setFullscreen(!fullscreen)}
                        title={fullscreen ? "Reducir" : "Pantalla completa"}
                        style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px", padding: "2px 6px" }}
                    >
                        {fullscreen ? "⊡" : "⊞"}
                    </button>
                    <button
                        onClick={() => navigator.clipboard.writeText(code)}
                        title="Copiar código"
                        style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}
                    >
                        📋
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            title="Cerrar canvas"
                            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px", padding: "2px 6px" }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Contenido */}
            <div style={{ overflow: "auto", flexGrow: 1 }}>
                {renderContent()}
            </div>

            {/* Footer con código fuente colapsable */}
            <details style={{ borderTop: "1px solid #1e293b", flexShrink: 0 }}>
                <summary style={{
                    padding: "8px 16px",
                    fontSize: "12px",
                    color: "#64748b",
                    cursor: "pointer",
                    userSelect: "none",
                    background: "#0f172a",
                }}>
                    Ver código fuente ({type})
                </summary>
                <pre style={{
                    margin: 0,
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: "#94a3b8",
                    background: "#0a0f1a",
                    overflowX: "auto",
                    maxHeight: "200px",
                }}>
                    {code}
                </pre>
            </details>
        </div>
    );
}