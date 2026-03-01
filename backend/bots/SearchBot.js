/**
 * SearchBot.js — Búsqueda web real con resultados + fuentes
 *
 * Usa DuckDuckGo Instant Answers API (gratis, sin key) como primer opción.
 * Si no encuentra resultados útiles, hace scraping de DuckDuckGo HTML.
 * Devuelve resultados con título, snippet y URL.
 */

const Bot = require("./Bot");
const https = require("https");
const http = require("http");
const logger = require("../logs/logger");

class SearchBot extends Bot {
    constructor() {
        super("SearchBot", "Búsqueda web real — devuelve resultados con fuentes y enlaces");
    }

    async run(parameters) {
        const query =
            parameters?.query ||
            parameters?.search ||
            parameters?.text ||
            "";

        if (!query) throw new Error("SearchBot requiere parámetro 'query'");

        logger.info(`SearchBot: searching "${query.substring(0, 80)}"`);

        // 1. Try DuckDuckGo Instant Answer API
        const instantResult = await this._duckduckgoInstant(query);
        if (instantResult) {
            logger.info(`SearchBot: instant answer found`);
        }

        // 2. Scrape DuckDuckGo HTML for real results
        const webResults = await this._duckduckgoSearch(query);

        return this._formatResults(query, instantResult, webResults);
    }

    async _duckduckgoInstant(query) {
        return new Promise((resolve) => {
            const encoded = encodeURIComponent(query);
            const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

            const req = https.get(url, { timeout: 8000 }, (res) => {
                let data = "";
                res.on("data", c => data += c);
                res.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        const answer = parsed.AbstractText || parsed.Answer || "";
                        const source = parsed.AbstractURL || parsed.AbstractSource || "";
                        if (answer && answer.length > 20) {
                            resolve({ answer, source, type: parsed.Type });
                        } else {
                            resolve(null);
                        }
                    } catch {
                        resolve(null);
                    }
                });
            });
            req.on("error", () => resolve(null));
            req.on("timeout", () => { req.destroy(); resolve(null); });
        });
    }

    async _duckduckgoSearch(query) {
        return new Promise((resolve) => {
            const encoded = encodeURIComponent(query);
            const options = {
                hostname: "html.duckduckgo.com",
                path: `/html/?q=${encoded}`,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html",
                    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8"
                },
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", c => data += c);
                res.on("end", () => {
                    try {
                        const results = this._parseSearchResults(data);
                        resolve(results);
                    } catch {
                        resolve([]);
                    }
                });
            });

            req.on("error", () => resolve([]));
            req.on("timeout", () => { req.destroy(); resolve([]); });
            req.end();
        });
    }

    _parseSearchResults(html) {
        const results = [];

        // Match result blocks
        const resultPattern = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let match;

        while ((match = resultPattern.exec(html)) !== null && results.length < 6) {
            const url = this._decodeUrl(match[1]);
            const title = this._stripHtml(match[2]).trim();
            const snippet = this._stripHtml(match[3]).trim();

            if (url && title && !url.includes("duckduckgo.com")) {
                results.push({ title, url, snippet });
            }
        }

        // Fallback: simpler pattern
        if (results.length === 0) {
            const titlePattern = /<h2 class="result__title">\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            const snippetPattern = /<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

            const titles = [];
            while ((match = titlePattern.exec(html)) !== null && titles.length < 6) {
                const url = this._decodeUrl(match[1]);
                const title = this._stripHtml(match[2]).trim();
                if (url && title) titles.push({ url, title });
            }

            const snippets = [];
            while ((match = snippetPattern.exec(html)) !== null && snippets.length < 6) {
                snippets.push(this._stripHtml(match[1]).trim());
            }

            titles.forEach((t, i) => {
                results.push({ ...t, snippet: snippets[i] || "" });
            });
        }

        return results.slice(0, 5);
    }

    _decodeUrl(raw) {
        try {
            // DuckDuckGo wraps URLs: /l/?uddg=https%3A...
            if (raw.includes("uddg=")) {
                const m = raw.match(/uddg=([^&]+)/);
                if (m) return decodeURIComponent(m[1]);
            }
            if (raw.startsWith("http")) return raw;
            return null;
        } catch {
            return null;
        }
    }

    _stripHtml(str) {
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

    _formatResults(query, instant, webResults) {
        const lines = [`🔍 **Resultados para: "${query}"**\n`];

        if (instant) {
            lines.push(`📌 **Respuesta directa:**`);
            lines.push(instant.answer);
            if (instant.source) lines.push(`🔗 Fuente: ${instant.source}`);
            lines.push("");
        }

        if (webResults.length > 0) {
            lines.push(`🌐 **Resultados web:**\n`);
            webResults.forEach((r, i) => {
                lines.push(`**${i + 1}. ${r.title}**`);
                if (r.snippet) lines.push(r.snippet);
                lines.push(`🔗 ${r.url}`);
                lines.push("");
            });
        } else if (!instant) {
            lines.push("No se encontraron resultados. Intentá reformular la búsqueda.");
        }

        return lines.join("\n");
    }
}

module.exports = SearchBot;