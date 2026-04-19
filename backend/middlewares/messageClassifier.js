/**
 * messageClassifier.js — Response type classifier
 *
 * Problem: The backend returns everything as plain text strings.
 * The frontend has to guess whether to render Mermaid, HTML, code, etc.
 *
 * This middleware wraps chatController.handleChat and enriches the response
 * with a `responseType` field that the frontend can use for direct rendering
 * decisions, plus a `artifacts` array listing detected code blocks.
 *
 * Usage in server.js (wrap the chat route):
 *   const { classifyResponse } = require("./middleware/messageClassifier");
 *   router.post("/chat", chatController.handleChat, classifyResponse);
 *
 * Or use standalone in chatController before res.json():
 *   const { classify } = require("../middleware/messageClassifier");
 *   const classified = classify(result.reply);
 *   return res.json({ ...response, ...classified });
 */

"use strict";

/* ── Artifact detection patterns ──────────────────────── */
const ARTIFACT_PATTERNS = [
    { type: "mermaid",    re: /```mermaid\n([\s\S]+?)```/g,          label: "Diagrama Mermaid" },
    { type: "html",       re: /```html\n([\s\S]+?)```/g,             label: "Interfaz HTML" },
    { type: "svg",        re: /```svg\n([\s\S]+?)```/g,              label: "Gráfico SVG" },
    { type: "jsx",        re: /```jsx\n([\s\S]+?)```/g,              label: "Componente React" },
    { type: "javascript", re: /```(?:javascript|js)\n([\s\S]+?)```/g, label: "Script JavaScript" },
    { type: "css",        re: /```css\n([\s\S]+?)```/g,              label: "Estilos CSS" },
    { type: "python",     re: /```python\n([\s\S]+?)```/g,           label: "Script Python" },
    { type: "sql",        re: /```sql\n([\s\S]+?)```/g,              label: "Query SQL" },
    { type: "bash",       re: /```(?:bash|sh|shell)\n([\s\S]+?)```/g, label: "Script Shell" },
    { type: "json",       re: /```json\n([\s\S]+?)```/g,             label: "JSON" },
    { type: "markdown",   re: /```(?:md|markdown)\n([\s\S]+?)```/g,  label: "Markdown" },
];

/* ── Renderable types (trigger canvas in frontend) ────── */
const RENDERABLE_TYPES = new Set(["mermaid", "html", "svg", "jsx", "javascript"]);

/* ── Action patterns — commands that should be executed ─ */
const ACTION_PATTERNS = [
    { intent: "open_url",   re: /\[OPEN_URL:(https?:\/\/[^\]]+)\]/,    extract: (m) => ({ url: m[1] }) },
    { intent: "whatsapp_qr", re: /\[WHATSAPP_QR:([^\]]+)\]/,          extract: (m) => ({ qr: m[1] }) },
    { intent: "connected",  re: /\[WHATSAPP_CONNECTED:([^\]]+)\]/,     extract: (m) => ({ phone: m[1] }) },
    { intent: "screenshot", re: /\[SCREENSHOT:([^\]]+)\]/,             extract: (m) => ({ path: m[1] }) },
];

/**
 * classify(replyText) → { responseType, artifacts, actions, cleanText }
 *
 * responseType:
 *   "text"      — plain conversational reply
 *   "code"      — has code blocks but none are renderable
 *   "artifact"  — has at least one renderable block (Mermaid, HTML, SVG, JSX, JS)
 *   "mixed"     — text + code/artifact combo
 *   "action"    — contains embedded action tags
 *   "error"     — marked as error
 *
 * artifacts: array of { type, code, label, raw, renderable }
 * actions:   array of { intent, data }
 * cleanText: reply with artifact raw blocks removed (for display alongside canvas)
 */
function classify(replyText) {
    if (!replyText || typeof replyText !== "string") {
        return { responseType: "text", artifacts: [], actions: [], cleanText: "" };
    }

    const artifacts = [];
    const actions   = [];
    let   cleanText = replyText;
    let   hasRenderable = false;
    let   hasCode       = false;

    // ── Detect artifacts ───────────────────────────────────────────────────
    for (const { type, re, label } of ARTIFACT_PATTERNS) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(replyText)) !== null) {
            const code       = match[1].trim();
            const raw        = match[0];
            const renderable = RENDERABLE_TYPES.has(type);
            if (renderable) hasRenderable = true;
            else hasCode = true;

            artifacts.push({ type, code, label, raw, renderable });
            // Remove the raw block from cleanText (leave surrounding prose)
            cleanText = cleanText.replace(raw, "").trim();
        }
    }

    // ── Detect inline actions ──────────────────────────────────────────────
    for (const { intent, re, extract } of ACTION_PATTERNS) {
        const match = replyText.match(re);
        if (match) {
            actions.push({ intent, data: extract(match) });
            cleanText = cleanText.replace(match[0], "").trim();
        }
    }

    // ── Determine responseType ─────────────────────────────────────────────
    let responseType = "text";
    if (actions.length > 0) {
        responseType = "action";
    } else if (hasRenderable && cleanText.trim().length > 30) {
        responseType = "mixed";   // prose + renderable artifact
    } else if (hasRenderable) {
        responseType = "artifact";
    } else if (hasCode) {
        responseType = cleanText.trim().length > 20 ? "mixed" : "code";
    }

    return { responseType, artifacts, actions, cleanText };
}

/**
 * Express middleware — enriches the JSON response with classifier output.
 * Must be used AFTER the controller sends its data via res.json().
 * Since Express doesn't support post-response middleware natively,
 * this is designed to be called INSIDE the controller before res.json().
 *
 * Usage inside chatController.handleChat():
 *   const { classify } = require("../middleware/messageClassifier");
 *   const classified = classify(result.reply);
 *   return res.json({
 *     success: !result.error,
 *     reply: result.reply,
 *     intent: intentObject.intent,
 *     bot: ...,
 *     conversation_id: convId,
 *     // ↓ enriched fields
 *     responseType: classified.responseType,
 *     artifacts: classified.artifacts.map(a => ({ type: a.type, label: a.label, renderable: a.renderable })),
 *     actions: classified.actions,
 *     cleanReply: classified.cleanText,
 *   });
 */
function classifyMiddleware(req, res, next) {
    // Intercept res.json to enrich the payload
    const originalJson = res.json.bind(res);
    res.json = function(data) {
        if (data && typeof data.reply === "string") {
            const classified = classify(data.reply);
            data.responseType = classified.responseType;
            // Don't send full code in artifacts array (frontend re-detects from reply)
            data.artifacts    = classified.artifacts.map(({ type, label, renderable }) => ({ type, label, renderable }));
            data.actions      = classified.actions;
            data.cleanReply   = classified.cleanText;
        }
        return originalJson(data);
    };
    next();
}

module.exports = { classify, classifyMiddleware, RENDERABLE_TYPES };