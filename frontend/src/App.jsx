import React, { useState, useEffect, useCallback } from "react";
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

    const [currentConvId, setCurrentConvId] = useState(() => {
        return localStorage.getItem("jarvis_current_conv") || null;
    });
    const [chatKey, setChatKey] = useState(0);

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

    const handleSelectConversation = useCallback((id) => {
        setCurrentConvId(id);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    const handleNewConversation = useCallback((id) => {
        setCurrentConvId(id);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    const renderView = () => {
        switch (view) {
            case "bots": return <BotsPage />;
            case "devices": return <DevicesPage />;
            case "instructions": return <InstructionsPage />;
            case "settings": return <SettingsPage />;
            case "doctor": return <DoctorPage />;
            case "chat":
                return (
                    <Chat
                        key={chatKey}
                        propConvId={currentConvId}
                    />
                );
            case "dashboard":
            default:
                return <Dashboard setView={setView} />;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar
                currentConvId={currentConvId}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
            />
            {renderView()}
        </div>
    );
}

export default App;