/**
 * SearchBot.js — v2.0
 *
 * Búsqueda web REAL con resultados + fuentes como Gemini/ChatGPT.
 *
 * Estrategia:
 *  1. DuckDuckGo Instant Answer API (respuesta directa si existe)
 *  2. DuckDuckGo HTML scraping (resultados con título, snippet, URL)
 *  3. Fallback: intenta Bing HTML scraping si DuckDuckGo falla
 *
 * Devuelve Markdown con:
 *  - Respuesta directa (si DuckDuckGo la tiene)
 *  - Lista numerada de resultados con título, descripción y URL como link
 *
 * IMPORTANTE: este bot NUNCA inventa información.
 * Todo lo que responde viene de resultados web reales.
 */

const Bot = require("./Bot");
const https = require("https");
const logger = require("../logs/logger");

class SearchBot extends Bot {
    constructor() {
        super("SearchBot", "Búsqueda web real — devuelve resultados con fuentes y enlaces verificados");
    }

    async run(parameters) {
        const query =
            parameters?.query ||
            parameters?.search ||
            parameters?.text ||
            parameters?.message ||
            "";

        if (!query || query.trim().length < 2) {
            throw new Error("SearchBot requiere un query de búsqueda");
        }

        const q = query.trim();
        logger.info(`SearchBot: searching "${q.substring(0, 100)}"`);

        try {
            // 1. Instant answer
            const instant = await this._ddgInstant(q);

            // 2. Web results
            let webResults = await this._ddgSearch(q);

            // 3. Fallback a Bing si DDG no dio resultados
            if (webResults.length === 0) {
                logger.info("SearchBot: DDG gave no results, trying Bing...");
                webResults = await this._bingSearch(q);
            }

            logger.info(`SearchBot: found ${webResults.length} results for "${q}"`);
            return this._formatResults(q, instant, webResults);

        } catch (err) {
            logger.error(`SearchBot error: ${err.message}`);
            return `❌ Error al buscar "${q}": ${err.message}\n\nIntentá de nuevo o reformulá la búsqueda.`;
        }
    }

    // ── DuckDuckGo Instant Answer API ────────────────────────────
    async _ddgInstant(query) {
        return new Promise((resolve) => {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=es-ar`;

            const req = https.get(url, {
                timeout: 7000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json",
                }
            }, (res) => {
                let body = "";
                res.on("data", c => body += c);
                res.on("end", () => {
                    try {
                        const d = JSON.parse(body);
                        const answer = d.AbstractText || d.Answer || "";
                        const source = d.AbstractURL || "";
                        const sourceName = d.AbstractSource || "";
                        if (answer && answer.length > 15) {
                            resolve({ answer, source, sourceName });
                        } else {
                            resolve(null);
                        }
                    } catch { resolve(null); }
                });
            });
            req.on("error", () => resolve(null));
            req.on("timeout", () => { req.destroy(); resolve(null); });
        });
    }

    // ── DuckDuckGo HTML search ────────────────────────────────────
    async _ddgSearch(query) {
        return new Promise((resolve) => {
            const options = {
                hostname: "html.duckduckgo.com",
                path: `/html/?q=${encodeURIComponent(query)}&kl=es-ar`,
                method: "GET",
                timeout: 10000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
                    "Accept-Encoding": "identity",
                    "Referer": "https://duckduckgo.com/",
                }
            };

            const req = https.request(options, (res) => {
                // Handle redirect
                if (res.statusCode === 302 || res.statusCode === 301) {
                    resolve([]);
                    return;
                }

                const chunks = [];
                res.on("data", c => chunks.push(c));
                res.on("end", () => {
                    try {
                        const html = Buffer.concat(chunks).toString("utf8");
                        const results = this._parseDDGResults(html);
                        resolve(results);
                    } catch (e) {
                        logger.warn(`SearchBot DDG parse error: ${e.message}`);
                        resolve([]);
                    }
                });
            });

            req.on("error", (e) => { logger.warn(`SearchBot DDG error: ${e.message}`); resolve([]); });
            req.on("timeout", () => { req.destroy(); resolve([]); });
            req.end();
        });
    }

    _parseDDGResults(html) {
        const results = [];

        // Pattern 1: main result links + snippets
        // DDG HTML structure: <a class="result__a" href="...">Title</a>
        const titleRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const snippetRe = /<a[^>]+class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

        const titles = [];
        let m;
        while ((m = titleRe.exec(html)) !== null && titles.length < 8) {
            const rawUrl = m[1];
            const title = this._clean(m[2]);
            const url = this._resolveUrl(rawUrl);
            if (url && title && !url.includes("duckduckgo.com")) {
                titles.push({ url, title });
            }
        }

        const snippets = [];
        while ((m = snippetRe.exec(html)) !== null && snippets.length < 8) {
            const snippet = this._clean(m[1]);
            if (snippet) snippets.push(snippet);
        }

        for (let i = 0; i < Math.min(titles.length, 6); i++) {
            results.push({
                title: titles[i].title,
                url: titles[i].url,
                snippet: snippets[i] || "",
            });
        }

        // Pattern 2: fallback with result__body
        if (results.length === 0) {
            const blockRe = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
            while ((m = blockRe.exec(html)) !== null && results.length < 6) {
                const block = m[1];
                const linkM = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
                const snippetM = block.match(/class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
                if (linkM) {
                    const url = this._resolveUrl(linkM[1]);
                    const title = this._clean(linkM[2]);
                    if (url && title && !url.includes("duckduckgo")) {
                        results.push({ url, title, snippet: snippetM ? this._clean(snippetM[1]) : "" });
                    }
                }
            }
        }

        return results.slice(0, 5);
    }

    // ── Bing HTML search fallback ─────────────────────────────────
    async _bingSearch(query) {
        return new Promise((resolve) => {
            const options = {
                hostname: "www.bing.com",
                path: `/search?q=${encodeURIComponent(query)}&setlang=es&cc=AR`,
                method: "GET",
                timeout: 10000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "es-AR,es;q=0.9",
                }
            };

            const req = https.request(options, (res) => {
                const chunks = [];
                res.on("data", c => chunks.push(c));
                res.on("end", () => {
                    try {
                        const html = Buffer.concat(chunks).toString("utf8");
                        const results = this._parseBingResults(html);
                        resolve(results);
                    } catch { resolve([]); }
                });
            });
            req.on("error", () => resolve([]));
            req.on("timeout", () => { req.destroy(); resolve([]); });
            req.end();
        });
    }

    _parseBingResults(html) {
        const results = [];

        // Bing uses <li class="b_algo"> for results
        const blockRe = /<li[^>]+class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
        let m;

        while ((m = blockRe.exec(html)) !== null && results.length < 5) {
            const block = m[1];
            const linkM = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
            const snippetM = block.match(/class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);

            if (linkM) {
                const url = linkM[1];
                const title = this._clean(linkM[2]);
                const snippet = snippetM ? this._clean(snippetM[1]) : "";
                if (url && url.startsWith("http") && title) {
                    results.push({ url, title, snippet });
                }
            }
        }

        return results;
    }

    // ── URL resolution ────────────────────────────────────────────
    _resolveUrl(raw) {
        if (!raw) return null;
        try {
            // DuckDuckGo wraps URLs: /l/?uddg=https%3A...
            if (raw.includes("uddg=")) {
                const m = raw.match(/uddg=([^&]+)/);
                if (m) return decodeURIComponent(m[1]);
            }
            if (raw.startsWith("http")) return raw;
            return null;
        } catch { return null; }
    }

    // ── HTML cleanup ──────────────────────────────────────────────
    _clean(str) {
        return str
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    // ── Format Markdown response ─────────────────────────────────
    _formatResults(query, instant, webResults) {
        const lines = [`🔍 **Resultados para:** "${query}"\n`];

        // Respuesta directa de la Wikipedia/DDG knowledge base
        if (instant) {
            lines.push(`📌 **Respuesta directa:**`);
            lines.push(instant.answer);
            if (instant.source) {
                lines.push(`🔗 Fuente: [${instant.sourceName || instant.source}](${instant.source})\n`);
            } else {
                lines.push("");
            }
        }

        if (webResults.length > 0) {
            lines.push(`🌐 **Resultados web:**\n`);
            webResults.forEach((r, i) => {
                lines.push(`**${i + 1}. ${r.title}**`);
                if (r.snippet) lines.push(r.snippet);
                lines.push(`🔗 [Abrir → ${this._getDomain(r.url)}](${r.url})`);
                lines.push("");
            });
        } else if (!instant) {
            lines.push("⚠️ No se encontraron resultados web.");
            lines.push("Intentá reformular la búsqueda o ser más específico.");
        }

        return lines.join("\n");
    }

    _getDomain(url) {
        try { return new URL(url).hostname.replace("www.", ""); }
        catch { return url.substring(0, 30); }
    }
}

module.exports = SearchBot;