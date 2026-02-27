/**
 * SupabaseService.js — Persistent chat history via Supabase
 *
 * FIXES:
 *  - Single initialization attempt with clear state machine (PENDING → OK | FAILED | DISABLED)
 *  - Warning logged exactly ONCE per server run, never repeated
 *  - Async _init() called at startup so first chat doesn't block
 *  - _testConnection() does a real lightweight query to verify credentials
 *  - All methods guard against uninitialized client without re-logging
 *
 * Setup:
 *  1. npm install @supabase/supabase-js      ← must run this first
 *  2. Create project at https://supabase.com
 *  3. Run supabase_schema.sql in SQL Editor
 *  4. Add to backend/config/.env:
 *       SUPABASE_URL=https://xxxxxxxx.supabase.co
 *       SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const logger = require("../logs/logger");

// State machine — avoids any repeated initialization attempts
const STATE = { PENDING: "pending", OK: "ok", FAILED: "failed", DISABLED: "disabled" };

class SupabaseService {
    constructor() {
        this._client = null;
        this._state = STATE.PENDING;
        this._initPromise = null;

        // Begin async initialization immediately — don't block the constructor
        this._initPromise = this._init();
    }

    /* ══════════════════════════════
       INITIALIZATION
    ══════════════════════════════ */

    async _init() {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY;

        // Missing config → disabled, no error
        if (!url || !key) {
            this._state = STATE.DISABLED;
            logger.info("SupabaseService: SUPABASE_URL/KEY not set → history disabled (optional feature)");
            return;
        }

        // Validate URL format
        if (!url.startsWith("http")) {
            this._state = STATE.FAILED;
            logger.warn(`SupabaseService: SUPABASE_URL invalid format: "${url}"`);
            return;
        }

        // Try to load the package
        let createClient;
        try {
            ({ createClient } = require("@supabase/supabase-js"));
        } catch (err) {
            this._state = STATE.FAILED;
            logger.warn(
                "SupabaseService: @supabase/supabase-js no está instalado.\n" +
                "  → Ejecutá en la terminal del backend:\n" +
                "       npm install @supabase/supabase-js\n" +
                "  → Luego reiniciá el servidor.\n" +
                "  (El historial de chat quedará desactivado hasta entonces)"
            );
            return;
        }

        // Create client
        try {
            this._client = createClient(url, key, {
                auth: { autoRefreshToken: false, persistSession: false }
            });
        } catch (err) {
            this._state = STATE.FAILED;
            logger.warn(`SupabaseService: error creando cliente: ${err.message}`);
            return;
        }

        // Test real connectivity with a lightweight query
        const ok = await this._testConnection();
        if (ok) {
            this._state = STATE.OK;
            logger.info(`SupabaseService: conectado ✅ → ${url}`);
        } else {
            this._state = STATE.FAILED;
            this._client = null;
            logger.warn(
                "SupabaseService: cliente creado pero no se pudo conectar a la base de datos.\n" +
                "  → Verificá que SUPABASE_URL y SUPABASE_ANON_KEY sean correctos.\n" +
                "  → Verificá que hayas ejecutado supabase_schema.sql en el proyecto."
            );
        }
    }

    async _testConnection() {
        try {
            // Minimal query — just checks the connection is alive
            const { error } = await this._client
                .from("conversations")
                .select("id")
                .limit(1);

            // "relation does not exist" means schema not applied yet — still "connected"
            if (error && !error.message.includes("does not exist")) {
                logger.warn(`SupabaseService test query error: ${error.message}`);
                return false;
            }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService test connection threw: ${err.message}`);
            return false;
        }
    }

    /* ══════════════════════════════
       PUBLIC STATUS
    ══════════════════════════════ */

    isConnected() {
        return this._state === STATE.OK;
    }

    getState() {
        return this._state;
    }

    /** Wait for initialization to complete (used by chatController if needed) */
    async ready() {
        await this._initPromise;
        return this.isConnected();
    }

    /* ══════════════════════════════
       INTERNAL GUARD
    ══════════════════════════════ */

    _db() {
        if (!this._client) return null;
        return this._client;
    }

    /* ══════════════════════════════
       PROJECTS
    ══════════════════════════════ */

    async getProjects() {
        const db = this._db();
        if (!db) return [];
        try {
            const { data, error } = await db
                .from("projects")
                .select("*")
                .order("order_index", { ascending: true });
            if (error) { logger.warn(`SupabaseService.getProjects: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getProjects: ${err.message}`);
            return [];
        }
    }

    async createProject(name, color = "#10a37f") {
        const db = this._db();
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
            logger.warn(`SupabaseService.createProject: ${err.message}`);
            return null;
        }
    }

    async updateProject(id, updates) {
        const db = this._db();
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
            logger.warn(`SupabaseService.updateProject: ${err.message}`);
            return null;
        }
    }

    async deleteProject(id) {
        const db = this._db();
        if (!db) return false;
        try {
            const { error } = await db.from("projects").delete().eq("id", id);
            if (error) { logger.warn(`SupabaseService.deleteProject: ${error.message}`); return false; }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService.deleteProject: ${err.message}`);
            return false;
        }
    }

    async reorderProjects(orderedIds) {
        const db = this._db();
        if (!db) return false;
        try {
            for (let i = 0; i < orderedIds.length; i++) {
                await db.from("projects").update({ order_index: i }).eq("id", orderedIds[i]);
            }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService.reorderProjects: ${err.message}`);
            return false;
        }
    }

    /* ══════════════════════════════
       CONVERSATIONS
    ══════════════════════════════ */

    async getAllConversations() {
        const db = this._db();
        if (!db) return [];
        try {
            const { data, error } = await db
                .from("conversations")
                .select("*")
                .order("updated_at", { ascending: false });
            if (error) { logger.warn(`SupabaseService.getAllConversations: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getAllConversations: ${err.message}`);
            return [];
        }
    }

    async getConversations(projectId = null) {
        const db = this._db();
        if (!db) return [];
        try {
            let query = db.from("conversations").select("*").order("updated_at", { ascending: false });
            if (projectId) query = query.eq("project_id", projectId);
            else query = query.is("project_id", null);
            const { data, error } = await query;
            if (error) { logger.warn(`SupabaseService.getConversations: ${error.message}`); return []; }
            return data || [];
        } catch (err) {
            logger.warn(`SupabaseService.getConversations: ${err.message}`);
            return [];
        }
    }

    async createConversation(title = "Nueva conversación", projectId = null) {
        const db = this._db();
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
            logger.warn(`SupabaseService.createConversation: ${err.message}`);
            return null;
        }
    }

    async updateConversation(id, updates) {
        const db = this._db();
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
            logger.warn(`SupabaseService.updateConversation: ${err.message}`);
            return null;
        }
    }

    async deleteConversation(id) {
        const db = this._db();
        if (!db) return false;
        try {
            const { error } = await db.from("conversations").delete().eq("id", id);
            if (error) { logger.warn(`SupabaseService.deleteConversation: ${error.message}`); return false; }
            return true;
        } catch (err) {
            logger.warn(`SupabaseService.deleteConversation: ${err.message}`);
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
        const db = this._db();
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
            logger.warn(`SupabaseService.getMessages: ${err.message}`);
            return [];
        }
    }

    async saveMessage(conversationId, role, content, intent = null, bot = null) {
        const db = this._db();
        if (!db) return null;
        try {
            const { data, error } = await db
                .from("messages")
                .insert([{ conversation_id: conversationId, role, content, intent, bot }])
                .select()
                .single();
            if (error) { logger.warn(`SupabaseService.saveMessage: ${error.message}`); return null; }
            // Update conversation timestamp
            await db.from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", conversationId);
            return data;
        } catch (err) {
            logger.warn(`SupabaseService.saveMessage: ${err.message}`);
            return null;
        }
    }
}

module.exports = new SupabaseService();