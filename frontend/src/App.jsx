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

    // currentConvId = the conversation being displayed in <Chat>.
    // null  → new chat (no conversation yet, will be created on first message)
    // uuid  → existing conversation loaded from sidebar
    const [currentConvId, setCurrentConvId] = useState(null);

    // chatKey forces Chat to remount when we switch conversations,
    // so its internal state (messages, historyLoaded) resets cleanly.
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

    /* Called when user clicks a conversation in the sidebar */
    const handleSelectConversation = useCallback((conv) => {
        const id = typeof conv === "string" ? conv : conv?.id;
        setCurrentConvId(id || null);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    /* Called when user clicks "Nueva Conversación" in the sidebar */
    const handleNewConversation = useCallback(() => {
        setCurrentConvId(null);    // no pre-existing id → Chat starts fresh
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
                view={view}
                setView={setView}
                doctorErrors={doctorErrors}
                activeConvId={currentConvId}
                onSelectConv={handleSelectConversation}
                onNewChat={handleNewConversation}
            />
            {renderView()}
        </div>
    );
}

export default App;