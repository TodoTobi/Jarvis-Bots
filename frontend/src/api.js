const API_URL = "http://localhost:3001";

/* =========================
   CHAT
========================= */

/**
 * Send a message to the bot.
 * @param {string} message        - The user's message
 * @param {string|null} conversationId - Existing conversation ID (null = create new)
 * Returns: { reply, intent, bot, conversation_id, success }
 */
export async function sendMessageToBot(message, conversationId = null) {
    const body = { message };
    if (conversationId) body.conversation_id = conversationId;

    const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Chat request failed");
    }

    return response.json();
}

/* =========================
   BOTS
========================= */

export async function getBots() {
    const response = await fetch(`${API_URL}/api/bots`);
    if (!response.ok) throw new Error("Failed to fetch bots");
    return response.json();
}

export async function activateBot(botName) {
    const response = await fetch(`${API_URL}/api/bot/${botName}/activate`, { method: "POST" });
    if (!response.ok) throw new Error("Failed to activate bot");
    return response.json();
}

export async function deactivateBot(botName) {
    const response = await fetch(`${API_URL}/api/bot/${botName}/deactivate`, { method: "POST" });
    if (!response.ok) throw new Error("Failed to deactivate bot");
    return response.json();
}

export async function getScripts() {
    const response = await fetch(`${API_URL}/api/scripts`);
    if (!response.ok) throw new Error("Failed to fetch scripts");
    return response.json();
}

export async function runScript(script, args = []) {
    const response = await fetch(`${API_URL}/api/script/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, args }),
    });
    if (!response.ok) throw new Error("Script execution failed");
    return response.json();
}

/* =========================
   DEVICES
========================= */

export async function getDevices() {
    const response = await fetch(`${API_URL}/api/devices`);
    if (!response.ok) throw new Error("Failed to fetch devices");
    return response.json();
}

export async function pingDevice(deviceId) {
    const response = await fetch(`${API_URL}/api/device/${deviceId}/ping`);
    if (!response.ok) throw new Error("Ping failed");
    return response.json();
}

export async function sendDeviceCommand(deviceId, action, query = "", value = null) {
    const response = await fetch(`${API_URL}/api/device/${deviceId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, query, value }),
    });
    if (!response.ok) throw new Error("Device command failed");
    return response.json();
}