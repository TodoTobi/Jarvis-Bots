// App.jsx
import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import BotsPage from "./BotsPage";
import DevicesPage from "./DevicesPage";
import Dashboard from "./Dashboard";
import InstructionsPage from "./InstructionsPage";
import SettingsPage from "./SettingsPage";
import "./App.css";

function App() {
    const [view, setView] = useState("dashboard");

    const renderView = () => {
        switch (view) {
            case "bots": return <BotsPage />;
            case "devices": return <DevicesPage />;
            case "chat": return <Chat />;
            case "instructions": return <InstructionsPage />;
            case "settings": return <SettingsPage />;
            case "dashboard":
            default: return <Dashboard setView={setView} />;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar view={view} setView={setView} />
            {renderView()}
        </div>
    );
}

export default App;