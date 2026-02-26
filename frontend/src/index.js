import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Error boundary shows a visible error instead of blank page
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    height: "100vh", background: "#171717", color: "#fff",
                    flexDirection: "column", gap: "12px", fontFamily: "monospace",
                    padding: "40px", textAlign: "center"
                }}>
                    <div style={{ fontSize: "32px" }}>⚠</div>
                    <div style={{ fontSize: "15px", color: "#ef4444", maxWidth: "600px" }}>
                        {this.state.error.message}
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
                        Abrí la consola del navegador (F12 → Console) para ver el detalle completo
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: "16px", padding: "9px 22px",
                            background: "#10a37f", color: "#fff", border: "none",
                            borderRadius: "8px", cursor: "pointer", fontWeight: "600",
                            fontSize: "14px"
                        }}
                    >
                        Reintentar
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);