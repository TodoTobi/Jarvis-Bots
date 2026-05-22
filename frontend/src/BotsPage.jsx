import React from "react";
import BotsPanel from "./BotsPanel";
import ShellBackButton from "./components/ShellBackButton";

function BotsPage({ setView }) {
    return (
        <div className="bots-page">
            <ShellBackButton setView={setView} />
            <div className="bots-header">
                <h1>🤖 Bot Management</h1>
                <p>Controla y monitorea el estado de tus bots en tiempo real</p>
            </div>
            <BotsPanel />
        </div>
    );
}

export default BotsPage;
