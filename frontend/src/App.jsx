import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import BotsPage from "./BotsPage";
import "./App.css";

function App() {
    const [view, setView] = useState("chat");

    return (
        <div className="app-layout">
            <Sidebar view={view} setView={setView} />
            {view === "chat" ? <Chat /> : <BotsPage />}
        </div>
    );
}

export default App;