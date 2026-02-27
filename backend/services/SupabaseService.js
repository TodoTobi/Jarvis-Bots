/**
 * SupabaseService.js — Persistent chat history via Supabase
 *
 * Setup:
 *  1. Create project at https://supabase.com
 *  2. Run supabase_schema.sql in the SQL Editor
 *  3. Add to backend/config/.env:
 *     SUPABASE_URL=https://xxxxxxxx.supabase.co
 *     SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const logger = require("../logs/logger");

let supabase = null;

function getClient() {
    if (supabase) return supabase;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
        logger.warn("SupabaseService: SUPABASE_URL or SUPABASE_ANON_KEY not set. History disabled.");
        return null;
    }

    try {
        const { createClient } = require("@supabase/supabase-js");
        supabase = createClient(url, key);
        logger.info("SupabaseService: connected");
        return supabase;
    } catch (err) {
        logger.warn(`SupabaseService: @supabase/supabase-js not installed. Run: npm install @supabase/supabase-js\n${err.message}`);
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
        const { data, error } = await db
            .from("projects")
            .select("*")
            .order("order_index", { ascending: true });
        if (error) { logger.warn(`SupabaseService.getProjects: ${error.message}`); return []; }
        return data || [];
    }

    async createProject(name, color = "#10a37f") {
        const db = getClient();
        if (!db) return null;
        const { data, error } = await db
            .from("projects")
            .insert([{ name, color, order_index: Date.now() }])
            .select()
            .single();
        if (error) { logger.warn(`SupabaseService.createProject: ${error.message}`); return null; }
        return data;
    }

    async updateProject(id, updates) {
        const db = getClient();
        if (!db) return null;
        const { data, error } = await db
            .from("projects")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) { logger.warn(`SupabaseService.updateProject: ${error.message}`); return null; }
        return data;
    }

    async deleteProject(id) {
        const db = getClient();
        if (!db) return false;
        const { error } = await db.from("projects").delete().eq("id", id);
        if (error) { logger.warn(`SupabaseService.deleteProject: ${error.message}`); return false; }
        return true;
    }

    async reorderProjects(orderedIds) {
        const db = getClient();
        if (!db) return false;
        const updates = orderedIds.map((id, idx) => ({ id, order_index: idx }));
        for (const upd of updates) {
            await db.from("projects").update({ order_index: upd.order_index }).eq("id", upd.id);
        }
        return true;
    }

    /* ══════════════════════════════
       CONVERSATIONS
    ══════════════════════════════ */

    async getAllConversations() {
        const db = getClient();
        if (!db) return [];
        const { data, error } = await db
            .from("conversations")
            .select("*")
            .order("updated_at", { ascending: false });
        if (error) { logger.warn(`SupabaseService.getAllConversations: ${error.message}`); return []; }
        return data || [];
    }

    async getConversations(projectId = null) {
        const db = getClient();
        if (!db) return [];
        let query = db.from("conversations").select("*").order("updated_at", { ascending: false });
        if (projectId) query = query.eq("project_id", projectId);
        else query = query.is("project_id", null);
        const { data, error } = await query;
        if (error) { logger.warn(`SupabaseService.getConversations: ${error.message}`); return []; }
        return data || [];
    }

    async createConversation(title = "Nueva conversación", projectId = null) {
        const db = getClient();
        if (!db) return null;
        const { data, error } = await db
            .from("conversations")
            .insert([{ title, project_id: projectId }])
            .select()
            .single();
        if (error) { logger.warn(`SupabaseService.createConversation: ${error.message}`); return null; }
        return data;
    }

    async updateConversation(id, updates) {
        const db = getClient();
        if (!db) return null;
        const { data, error } = await db
            .from("conversations")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single();
        if (error) { logger.warn(`SupabaseService.updateConversation: ${error.message}`); return null; }
        return data;
    }

    async deleteConversation(id) {
        const db = getClient();
        if (!db) return false;
        const { error } = await db.from("conversations").delete().eq("id", id);
        if (error) { logger.warn(`SupabaseService.deleteConversation: ${error.message}`); return false; }
        return true;
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
        const { data, error } = await db
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });
        if (error) { logger.warn(`SupabaseService.getMessages: ${error.message}`); return []; }
        return data || [];
    }

    async saveMessage(conversationId, role, content, intent = null, bot = null) {
        const db = getClient();
        if (!db) return null;
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
    }
}

module.exports = new SupabaseService();