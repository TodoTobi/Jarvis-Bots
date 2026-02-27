/**
 * SupabaseService.js — Persistent chat history via Supabase
 *
 * FIX: El package correcto es @supabase/supabase-js (NO "supabase")
 *
 * Setup:
 *  1. En la terminal del backend: npm install @supabase/supabase-js
 *  2. Creá el proyecto en https://supabase.com
 *  3. Ejecutá supabase_schema.sql en el SQL Editor de Supabase
 *  4. En backend/config/.env agregar:
 *     SUPABASE_URL=https://xxxxxxxx.supabase.co
 *     SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const logger = require("../logs/logger");

let supabaseClient = null;
let connectionAttempted = false;

function getClient() {
    // Ya hay cliente inicializado
    if (supabaseClient) return supabaseClient;

    // Evitar reintentos infinitos si ya falló
    if (connectionAttempted) return null;
    connectionAttempted = true;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
        logger.warn("SupabaseService: SUPABASE_URL o SUPABASE_ANON_KEY no configurados en .env → Historial desactivado.");
        return null;
    }

    // Validar formato de URL
    if (!url.includes("supabase.co") && !url.includes("supabase.") && !url.startsWith("http")) {
        logger.warn(`SupabaseService: SUPABASE_URL con formato inválido: "${url}"`);
        return null;
    }

    try {
        // El paquete correcto es @supabase/supabase-js, NO "supabase"
        const { createClient } = require("@supabase/supabase-js");
        supabaseClient = createClient(url, key, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        logger.info(`SupabaseService: cliente inicializado → ${url}`);
        return supabaseClient;
    } catch (err) {
        if (err.code === "MODULE_NOT_FOUND") {
            logger.warn(
                "SupabaseService: @supabase/supabase-js NO está instalado.\n" +
                "  → Ejecutá en la terminal del backend:\n" +
                "     cd backend && npm install @supabase/supabase-js\n" +
                "  → Luego reiniciá el servidor."
            );
        } else {
            logger.warn(`SupabaseService: error al inicializar cliente: ${err.message}`);
        }
        return null;
    }
}

class SupabaseService {

    isConnected() {
        return !!getClient();
    }

    /* ══════════════════════════════
       PROJECTS
    ══════════════════════════════ */

    async getProjects() {
        const db = getClient();
        if (!db) return [];
        try {
            const { data, error } = await db
                .from("projects")
                .select("*")
                .order("order_index", { ascending: true });
            if (error) { logger.warn(`SupabaseService.getProjects: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getProjects exception: ${err.message}`);
            return [];
        }
    }

    async createProject(name, color = "#10a37f") {
        const db = getClient();
        if (!db) return null;
        try {
            const { data, error } = await db
                .from("projects")
                .insert([{ name, color, order_index: Date.now() }])
                .select()
                .single();
            if (error) { logger.warn(`SupabaseService.createProject: ${error.message}`); return null; }
            return data;
        } catch (err) {
            logger.warn(`SupabaseService.createProject exception: ${err.message}`);
            return null;
        }
    }

    async updateProject(id, updates) {
        const db = getClient();
        if (!db) return null;
        try {
            const { data, error } = await db
                .from("projects")
                .update(updates)
                .eq("id", id)
                .select()
                .single();
            if (error) { logger.warn(`SupabaseService.updateProject: ${error.message}`); return null; }
            return data;
        } catch (err) {
            logger.warn(`SupabaseService.updateProject exception: ${err.message}`);
            return null;
        }
    }

    async deleteProject(id) {
        const db = getClient();
        if (!db) return false;
        try {
            const { error } = await db.from("projects").delete().eq("id", id);
            if (error) { logger.warn(`SupabaseService.deleteProject: ${error.message}`); return false; }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService.deleteProject exception: ${err.message}`);
            return false;
        }
    }

    async reorderProjects(orderedIds) {
        const db = getClient();
        if (!db) return false;
        try {
            for (let i = 0; i < orderedIds.length; i++) {
                await db.from("projects").update({ order_index: i }).eq("id", orderedIds[i]);
            }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService.reorderProjects exception: ${err.message}`);
            return false;
        }
    }

    /* ══════════════════════════════
       CONVERSATIONS
    ══════════════════════════════ */

    async getAllConversations() {
        const db = getClient();
        if (!db) return [];
        try {
            const { data, error } = await db
                .from("conversations")
                .select("*")
                .order("updated_at", { ascending: false });
            if (error) { logger.warn(`SupabaseService.getAllConversations: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getAllConversations exception: ${err.message}`);
            return [];
        }
    }

    async getConversations(projectId = null) {
        const db = getClient();
        if (!db) return [];
        try {
            let query = db.from("conversations").select("*").order("updated_at", { ascending: false });
            if (projectId) query = query.eq("project_id", projectId);
            else query = query.is("project_id", null);
            const { data, error } = await query;
            if (error) { logger.warn(`SupabaseService.getConversations: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getConversations exception: ${err.message}`);
            return [];
        }
    }

    async createConversation(title = "Nueva conversación", projectId = null) {
        const db = getClient();
        if (!db) return null;
        try {
            const { data, error } = await db
                .from("conversations")
                .insert([{ title, project_id: projectId }])
                .select()
                .single();
            if (error) { logger.warn(`SupabaseService.createConversation: ${error.message}`); return null; }
            return data;
        } catch (err) {
            logger.warn(`SupabaseService.createConversation exception: ${err.message}`);
            return null;
        }
    }

    async updateConversation(id, updates) {
        const db = getClient();
        if (!db) return null;
        try {
            const { data, error } = await db
                .from("conversations")
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq("id", id)
                .select()
                .single();
            if (error) { logger.warn(`SupabaseService.updateConversation: ${error.message}`); return null; }
            return data;
        } catch (err) {
            logger.warn(`SupabaseService.updateConversation exception: ${err.message}`);
            return null;
        }
    }

    async deleteConversation(id) {
        const db = getClient();
        if (!db) return false;
        try {
            const { error } = await db.from("conversations").delete().eq("id", id);
            if (error) { logger.warn(`SupabaseService.deleteConversation: ${error.message}`); return false; }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService.deleteConversation exception: ${err.message}`);
            return false;
        }
    }

    async autoTitleConversation(id, firstMessage) {
        const title = firstMessage.substring(0, 50).trim() || "Nueva conversación";
        return this.updateConversation(id, { title });
    }

    /* ══════════════════════════════
       MESSAGES
    ══════════════════════════════ */

    async getMessages(conversationId) {
        const db = getClient();
        if (!db) return [];
        try {
            const { data, error } = await db
                .from("messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: true });
            if (error) { logger.warn(`SupabaseService.getMessages: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getMessages exception: ${err.message}`);
            return [];
        }
    }

    async saveMessage(conversationId, role, content, intent = null, bot = null) {
        const db = getClient();
        if (!db) return null;
        try {
            const { data, error } = await db
                .from("messages")
                .insert([{ conversation_id: conversationId, role, content, intent, bot }])
                .select()
                .single();
            if (error) { logger.warn(`SupabaseService.saveMessage: ${error.message}`); return null; }
            // Update conversation updated_at
            await db.from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", conversationId);
            return data;
        } catch (err) {
            logger.warn(`SupabaseService.saveMessage exception: ${err.message}`);
            return null;
        }
    }
}

module.exports = new SupabaseService();