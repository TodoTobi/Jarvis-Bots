import React from "react";
import BotsPanel from "./BotsPanel";

function BotsPage() {
    return (
        <div className="bots-page">
            <div className="bots-header">
                <h1>🤖 Bot Management</h1>
                <p>Controla y monitorea el estado de tus bots en tiempo real</p>
            </div>
            <BotsPanel />
        </div>
    );
}

export default BotsPage;