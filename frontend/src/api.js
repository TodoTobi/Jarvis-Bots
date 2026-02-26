const API_URL = "http://localhost:3001";

/* =========================
   CHAT
========================= */

export async function sendMessageToBot(message) {
    const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Chat request failed");
    }

    return response.json();
}

/* =========================
   BOT STATES
========================= */

export async function getBots() {
    const response = await fetch(`${API_URL}/api/bots`);

    if (!response.ok) {
        throw new Error("Failed to fetch bots");
    }

    return response.json();
}

/* =========================
   BOT CONTROL
========================= */

export async function activateBot(botName) {
    const response = await fetch(
        `${API_URL}/api/bot/${botName}/activate`,
        { method: "POST" }
    );

    if (!response.ok) {
        throw new Error("Failed to activate bot");
    }

    return response.json();
}

export async function deactivateBot(botName) {
    const response = await fetch(
        `${API_URL}/api/bot/${botName}/deactivate`,
        { method: "POST" }
    );

    if (!response.ok) {
        throw new Error("Failed to deactivate bot");
    }

    return response.json();
}