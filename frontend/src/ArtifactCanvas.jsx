/**
 * ArtifactCanvas.jsx — Canvas de Jarvis
 *
 * Renderiza contenido generado por Gemma:
 *  - Diagramas Mermaid
 *  - HTML/CSS/JS en iframe sandboxed
 *  - SVG inline
 *  - Gráficos (Chart.js via HTML)
 *  - Componentes React (JSX evaluado)
 *
 * Props:
 *  type: "mermaid" | "html" | "svg" | "react" | "javascript" | "auto"
 *  code: string con el código a renderizar
 *  title: string opcional
 *  onClose: función para cerrar
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Colores del tema de Jarvis
const THEME = {
    bg: "#0a0f1e",
    panel: "#111827",
    border: "#1e3a5f",
    accent: "#00d4ff",
    text: "#e2e8f0",
    textMuted: "#64748b",
    success: "#10b981",
    error: "#ef4444",
};

/* ══════════════════════════════════════════════════
   MERMAID RENDERER
══════════════════════════════════════════════════ */
function MermaidRenderer({ code }) {
    const ref = useRef(null);
    const [error, setError] = useState(null);
    const [svg, setSvg] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const renderMermaid = async () => {
            try {
                // Cargar Mermaid dinámicamente si no está disponible
                let mermaid = window.mermaid;
                if (!mermaid) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement("script");
                        script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                    mermaid = window.mermaid;
                }

                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    themeVariables: {
                        primaryColor: "#1e3a5f",
                        primaryTextColor: "#e2e8f0",
                        primaryBorderColor: "#00d4ff",
                        lineColor: "#00d4ff",
                        secondaryColor: "#111827",
                        tertiaryColor: "#0a0f1e",
                    },
                });

                const id = `mermaid-${Date.now()}`;
                const { svg: renderedSvg } = await mermaid.render(id, code);
                if (!cancelled) setSvg(renderedSvg);
            } catch (err) {
                if (!cancelled) setError(err.message);
            }
        };

        renderMermaid();
        return () => { cancelled = true; };
    }, [code]);

    if (error) return (
        <div style={{ color: THEME.error, padding: "1rem", fontSize: "0.85rem" }}>
            ❌ Error renderizando diagrama: {error}
            <pre style={{ marginTop: "0.5rem", color: THEME.textMuted, fontSize: "0.75rem" }}>{code}</pre>
        </div>
    );

    if (!svg) return (
        <div style={{ color: THEME.textMuted, padding: "2rem", textAlign: "center" }}>
            Renderizando diagrama...
        </div>
    );

    return (
        <div
            ref={ref}
            style={{ padding: "1rem", background: "#0d1117", borderRadius: "8px", overflow: "auto" }}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}

/* ══════════════════════════════════════════════════
   HTML RENDERER (iframe sandboxed)
══════════════════════════════════════════════════ */
function HtmlRenderer({ code }) {
    const iframeRef = useRef(null);

    // Inyectar Chart.js y otras libs comunes si el código las usa
    const enhancedCode = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0f1e;
    color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh;
    padding: 16px;
  }
</style>
</head>
<body>
${code.includes("<html") ? code : code}
</body>
</html>`;

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        doc.open();
        doc.write(enhancedCode);
        doc.close();
    }, [enhancedCode]);

    return (
        <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin"
            style={{
                width: "100%",
                height: "100%",
                minHeight: "400px",
                border: "none",
                borderRadius: "8px",
                background: THEME.bg,
            }}
            title="canvas-preview"
        />
    );
}

/* ══════════════════════════════════════════════════
   SVG RENDERER
══════════════════════════════════════════════════ */
function SvgRenderer({ code }) {
    return (
        <div
            style={{
                padding: "1rem",
                background: "#0d1117",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "200px",
            }}
            dangerouslySetInnerHTML={{ __html: code }}
        />
    );
}

/* ══════════════════════════════════════════════════
   CODE VIEWER (fallback)
══════════════════════════════════════════════════ */
function CodeViewer({ code, type }) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ position: "relative" }}>
            <button
                onClick={copy}
                style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    background: copied ? THEME.success : THEME.border,
                    color: THEME.text,
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    zIndex: 1,
                }}
            >
                {copied ? "✓ Copiado" : "Copiar"}
            </button>
            <pre style={{
                background: "#0d1117",
                color: "#e2e8f0",
                padding: "1.5rem 1rem",
                borderRadius: "8px",
                overflow: "auto",
                fontSize: "0.8rem",
                lineHeight: "1.6",
                maxHeight: "500px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
            }}>
                <code>{code}</code>
            </pre>
        </div>
    );
}

/* ══════════════════════════════════════════════════
   ARTIFACT CANVAS (componente principal)
══════════════════════════════════════════════════ */
export default function ArtifactCanvas({ type, code, title, onClose, onSend }) {
    const [activeTab, setActiveTab] = useState("preview");
    const [canvasType, setCanvasType] = useState(type || "auto");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState(100);

    // Auto-detectar tipo si es "auto"
    useEffect(() => {
        if (type !== "auto" && type) return;
        if (!code) return;

        if (code.trim().startsWith("<svg") || code.includes("<svg ")) setCanvasType("svg");
        else if (code.includes("graph ") || code.includes("flowchart") ||
                 code.includes("sequenceDiagram") || code.includes("classDiagram") ||
                 code.includes("erDiagram") || code.includes("gantt") ||
                 code.includes("gitGraph")) setCanvasType("mermaid");
        else if (code.includes("<html") || code.includes("<div") ||
                 code.includes("<canvas") || code.includes("Chart(")) setCanvasType("html");
        else setCanvasType("code");
    }, [code, type]);

    const typeLabel = {
        mermaid: "📊 Diagrama",
        html: "🌐 Web",
        svg: "🎨 SVG",
        react: "⚛️ React",
        code: "📝 Código",
        javascript: "⚡ JS",
        auto: "🔮 Auto",
    };

    const renderContent = () => {
        if (activeTab === "code") return <CodeViewer code={code} type={canvasType} />;

        switch (canvasType) {
            case "mermaid": return <MermaidRenderer code={code} />;
            case "html":
            case "react":
            case "javascript": return <HtmlRenderer code={code} />;
            case "svg": return <SvgRenderer code={code} />;
            default: return <CodeViewer code={code} type={canvasType} />;
        }
    };

    const styles = {
        overlay: {
            position: isFullscreen ? "fixed" : "relative",
            top: isFullscreen ? 0 : "auto",
            left: isFullscreen ? 0 : "auto",
            right: isFullscreen ? 0 : "auto",
            bottom: isFullscreen ? 0 : "auto",
            zIndex: isFullscreen ? 9999 : "auto",
            background: isFullscreen ? "rgba(0,0,0,0.95)" : "transparent",
            display: "flex",
            alignItems: isFullscreen ? "center" : "stretch",
            justifyContent: isFullscreen ? "center" : "stretch",
            padding: isFullscreen ? "20px" : 0,
        },
        container: {
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: "12px",
            overflow: "hidden",
            width: isFullscreen ? "95vw" : "100%",
            maxHeight: isFullscreen ? "90vh" : "600px",
            display: "flex",
            flexDirection: "column",
            boxShadow: `0 0 30px rgba(0, 212, 255, 0.1)`,
        },
        header: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: `1px solid ${THEME.border}`,
            background: "#0d1628",
        },
        headerLeft: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
        },
        typeBadge: {
            background: "#1e3a5f",
            color: THEME.accent,
            border: `1px solid ${THEME.border}`,
            borderRadius: "20px",
            padding: "2px 10px",
            fontSize: "0.7rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
        },
        titleText: {
            color: THEME.text,
            fontSize: "0.85rem",
            fontWeight: 500,
        },
        headerRight: {
            display: "flex",
            alignItems: "center",
            gap: "6px",
        },
        tabs: {
            display: "flex",
            borderBottom: `1px solid ${THEME.border}`,
            background: "#0d1628",
            padding: "0 14px",
        },
        tab: (active) => ({
            padding: "8px 14px",
            background: "transparent",
            border: "none",
            borderBottom: active ? `2px solid ${THEME.accent}` : "2px solid transparent",
            color: active ? THEME.accent : THEME.textMuted,
            cursor: "pointer",
            fontSize: "0.78rem",
            fontWeight: active ? 600 : 400,
            transition: "all 0.2s",
        }),
        content: {
            flex: 1,
            overflow: "auto",
            padding: "14px",
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top left",
        },
        iconBtn: {
            background: "transparent",
            border: `1px solid ${THEME.border}`,
            color: THEME.textMuted,
            borderRadius: "6px",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "0.75rem",
            transition: "all 0.2s",
        },
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={styles.headerLeft}>
                        <span style={styles.typeBadge}>{typeLabel[canvasType] || typeLabel.auto}</span>
                        {title && <span style={styles.titleText}>{title}</span>}
                    </div>
                    <div style={styles.headerRight}>
                        {/* Zoom controls */}
                        <button style={styles.iconBtn} onClick={() => setZoom(z => Math.max(50, z - 10))}>−</button>
                        <span style={{ color: THEME.textMuted, fontSize: "0.7rem", minWidth: "35px", textAlign: "center" }}>
                            {zoom}%
                        </span>
                        <button style={styles.iconBtn} onClick={() => setZoom(z => Math.min(200, z + 10))}>+</button>
                        <button style={styles.iconBtn} onClick={() => setZoom(100)} title="Reset zoom">⟳</button>

                        {/* Fullscreen */}
                        <button
                            style={styles.iconBtn}
                            onClick={() => setIsFullscreen(f => !f)}
                            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                        >
                            {isFullscreen ? "⊡" : "⊞"}
                        </button>

                        {/* Enviar al chat */}
                        {onSend && (
                            <button
                                style={{ ...styles.iconBtn, color: THEME.accent, borderColor: THEME.accent }}
                                onClick={() => onSend(code, canvasType)}
                                title="Enviar código al chat"
                            >
                                ↑
                            </button>
                        )}

                        {/* Cerrar */}
                        {onClose && (
                            <button
                                style={{ ...styles.iconBtn, color: THEME.error, borderColor: THEME.error }}
                                onClick={onClose}
                                title="Cerrar canvas"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div style={styles.tabs}>
                    <button style={styles.tab(activeTab === "preview")} onClick={() => setActiveTab("preview")}>
                        Vista previa
                    </button>
                    <button style={styles.tab(activeTab === "code")} onClick={() => setActiveTab("code")}>
                        Código
                    </button>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════
   HOOK: useArtifactDetector
   Detecta si la respuesta del chat contiene código
   que debería renderizarse en el Canvas
══════════════════════════════════════════════════ */
export function useArtifactDetector(message) {
    if (!message) return null;

    const checks = [
        { regex: /```mermaid\n([\s\S]+?)\n```/, type: "mermaid" },
        { regex: /```html\n([\s\S]+?)\n```/, type: "html" },
        { regex: /```svg\n([\s\S]+?)\n```/, type: "svg" },
        { regex: /```jsx\n([\s\S]+?)\n```/, type: "react" },
        { regex: /```(?:javascript|js)\n([\s\S]+?)\n```/, type: "javascript" },
    ];

    for (const { regex, type } of checks) {
        const match = message.match(regex);
        if (match) {
            return { type, code: match[1], raw: match[0] };
        }
    }

    // Detectar SVG inline
    if (message.includes("<svg") && message.includes("</svg>")) {
        const svgMatch = message.match(/<svg[\s\S]+?<\/svg>/);
        if (svgMatch) return { type: "svg", code: svgMatch[0] };
    }

    return null;
}