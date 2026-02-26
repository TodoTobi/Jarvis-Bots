import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import BotsPage from "./BotsPage";
import DevicesPage from "./DevicesPage";
import "./App.css";

function App() {
    const [view, setView] = useState("chat");

    const renderView = () => {
        switch (view) {
            case "bots": return <BotsPage />;
            case "devices": return <DevicesPage />;
            default: return <Chat />;
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