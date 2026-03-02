const API_URL = "http://localhost:3001";

/* =========================
   CHAT
========================= */
export async function sendMessageToBot(message, conversationId = null, history = []) {
    const body = { message };
    if (conversationId) body.conversation_id = conversationId;

    // Enviar las últimas 20 mensajes como contexto para que el modelo recuerde la conversación
    if (history.length > 0) {
        const recentHistory = history.slice(-20)
            .map(m => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.content || "",
            }))
            .filter(m => m.content && m.role !== "error");
        body.history = recentHistory;
    }

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
   MEMORY PERMANENTE
========================= */
export async function saveMemory(content, tag = "general") {
    const response = await fetch(`${API_URL}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, tag }),
    });
    if (!response.ok) throw new Error("Failed to save memory");
    return response.json();
}

export async function getMemories() {
    const response = await fetch(`${API_URL}/api/memory`);
    if (!response.ok) throw new Error("Failed to fetch memories");
    return response.json();
}

export async function deleteMemory(id) {
    const response = await fetch(`${API_URL}/api/memory/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Failed to delete memory");
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