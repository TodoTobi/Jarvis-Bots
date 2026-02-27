/**
 * historyRoutes.js — Chat history API via Supabase
 */

const express = require("express");
const router = express.Router();
const supabase = require("../services/SupabaseService");

// Status
router.get("/history/status", (req, res) => {
    res.json({ connected: supabase.isConnected() });
});

/* ── Projects ── */
router.get("/history/projects", async (req, res, next) => {
    try { res.json(await supabase.getProjects()); } catch (err) { next(err); }
});

router.post("/history/projects", async (req, res, next) => {
    try {
        const { name, color } = req.body;
        res.json(await supabase.createProject(name, color));
    } catch (err) { next(err); }
});

router.put("/history/projects/:id", async (req, res, next) => {
    try {
        res.json(await supabase.updateProject(req.params.id, req.body));
    } catch (err) { next(err); }
});

router.delete("/history/projects/:id", async (req, res, next) => {
    try {
        res.json({ success: await supabase.deleteProject(req.params.id) });
    } catch (err) { next(err); }
});

router.post("/history/projects/reorder", async (req, res, next) => {
    try {
        const { orderedIds } = req.body;
        res.json({ success: await supabase.reorderProjects(orderedIds) });
    } catch (err) { next(err); }
});

/* ── Conversations ── */
router.get("/history/conversations", async (req, res, next) => {
    try {
        const { project_id } = req.query;
        // "all" returns everything, otherwise filter by project
        const data = req.query.all === "true"
            ? await supabase.getAllConversations()
            : await supabase.getConversations(project_id || null);
        res.json(data);
    } catch (err) { next(err); }
});

router.post("/history/conversations", async (req, res, next) => {
    try {
        const { title, project_id } = req.body;
        res.json(await supabase.createConversation(title, project_id || null));
    } catch (err) { next(err); }
});

router.put("/history/conversations/:id", async (req, res, next) => {
    try {
        res.json(await supabase.updateConversation(req.params.id, req.body));
    } catch (err) { next(err); }
});

router.delete("/history/conversations/:id", async (req, res, next) => {
    try {
        res.json({ success: await supabase.deleteConversation(req.params.id) });
    } catch (err) { next(err); }
});

/* ── Messages ── */
router.get("/history/conversations/:id/messages", async (req, res, next) => {
    try {
        res.json(await supabase.getMessages(req.params.id));
    } catch (err) { next(err); }
});

module.exports = router;