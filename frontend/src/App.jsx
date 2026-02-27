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

    // ── Conversation state (shared between Sidebar and Chat) ──
    const [activeConv, setActiveConv] = useState(null);  // { id, title }
    const [chatKey, setChatKey] = useState(0);     // Force Chat remount on new conv

    // Poll doctor errors silently
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

    // Called when user clicks a conversation in the sidebar
    const handleSelectConv = useCallback((conv) => {
        setActiveConv(conv);
        setChatKey(k => k + 1);  // remount Chat so it loads the conversation's messages
        setView("chat");
    }, []);

    // Called when user clicks "New Chat" button
    const handleNewChat = useCallback(() => {
        setActiveConv(null);
        setChatKey(k => k + 1);
        setView("chat");
    }, []);

    // Called from Chat when a new conversation_id is created by the backend
    const handleConversationCreated = useCallback((conv) => {
        setActiveConv(conv);
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
                        conversationId={activeConv?.id || null}
                        onConversationCreated={handleConversationCreated}
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
                activeConvId={activeConv?.id}
                onSelectConv={handleSelectConv}
                onNewChat={handleNewChat}
            />
            {renderView()}
        </div>
    );
}

export default App;