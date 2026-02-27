import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import BotsPage from "./BotsPage";
import DevicesPage from "./DevicesPage";
import Dashboard from "./Dashboard";
import InstructionsPage from "./InstructionsPage";
import SettingsPage from "./SettingsPage";
import DoctorPage from "./DoctorPage";
import "./App.css";

function App() {
    const [view, setView] = useState("dashboard");
    const [doctorErrors, setDoctorErrors] = useState(0);

    // Poll doctor errors count silently every 30s to show badge
    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch("http://localhost:3001/api/doctor/scan");
                const data = await res.json();
                setDoctorErrors(data.summary?.errors || 0);
            } catch { }
        };
        check();
        const iv = setInterval(check, 30000);
        return () => clearInterval(iv);
    }, []);

    const renderView = () => {
        switch (view) {
            case "bots": return <BotsPage />;
            case "devices": return <DevicesPage />;
            case "chat": return <Chat />;
            case "instructions": return <InstructionsPage />;
            case "settings": return <SettingsPage />;
            case "doctor": return <DoctorPage />;
            case "dashboard":
            default: return <Dashboard setView={setView} />;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar view={view} setView={setView} doctorErrors={doctorErrors} />
            {renderView()}
        </div>
    );
}

export default App;