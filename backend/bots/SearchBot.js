/**
 * SearchBot.js — v3.0
 *
 * Feature 3: sintetiza una respuesta directa a la pregunta usando el modelo,
 * en vez de devolver una lista cruda de links.
 *
 * Flujo:
 *  1. Busca en DuckDuckGo / Bing (igual que v2)
 *  2. Manda los resultados + pregunta original al modelo local
 *  3. El modelo sintetiza una respuesta directa y concisa
 *  4. Al final muestra 1-2 fuentes relevantes (no 5 links)
 *
 * Si el modelo no está disponible, cae al formato v2 (links crudos).
 */

const Bot        = require("./Bot");
const https      = require("https");
const logger     = require("../logs/logger");
const ModelService = require("../services/ModelService");

class SearchBot extends Bot {
  constructor() {
    super("SearchBot", "Búsqueda web real con respuesta sintetizada por el modelo — devuelve respuesta directa + 1-2 fuentes");
  }

  async run(parameters) {
    const query =
      parameters?.query  ||
      parameters?.search ||
      parameters?.text   ||
      parameters?.message || "";

    if (!query || query.trim().length < 2) {
      throw new Error("SearchBot requiere un query de búsqueda");
    }

    const q = query.trim();
    logger.info(`SearchBot v3: searching "${q.substring(0, 100)}"`);

    try {
      const instant    = await this._ddgInstant(q);
      let   webResults = await this._ddgSearch(q);

      if (webResults.length === 0) {
        logger.info("SearchBot: DDG vacío, intentando Bing...");
        webResults = await this._bingSearch(q);
      }

      logger.info(`SearchBot: ${webResults.length} resultados para "${q}"`);

      // Feature 3: sintetizar con el modelo
      try {
        const synthesized = await this._synthesize(q, instant, webResults);
        return synthesized;
      } catch (synthErr) {
        logger.warn(`SearchBot: síntesis falló (${synthErr.message}), usando formato raw`);
        return this._formatRaw(q, instant, webResults);
      }

    } catch (err) {
      logger.error(`SearchBot error: ${err.message}`);
      return `❌ Error al buscar "${q}": ${err.message}\n\nIntentá de nuevo o reformulá la búsqueda.`;
    }
  }

  /* ── Síntesis con el modelo — Feature 3 ─────────────────── */
  async _synthesize(originalQuery, instant, webResults) {
    // Armar contexto compacto para el modelo
    const contextParts = [];

    if (instant?.answer) {
      contextParts.push(`RESPUESTA DIRECTA: ${instant.answer}`);
      if (instant.source) contextParts.push(`Fuente: ${instant.source}`);
    }

    webResults.slice(0, 5).forEach((r, i) => {
      const parts = [`[${i + 1}] ${r.title}`];
      if (r.snippet) parts.push(r.snippet);
      parts.push(`URL: ${r.url}`);
      contextParts.push(parts.join("\n"));
    });

    const context = contextParts.join("\n\n");

    const prompt = `El usuario preguntó: "${originalQuery}"

Tenés estos resultados de búsqueda:

${context}

Respondé la pregunta del usuario de manera directa y concisa, como si fueras un asistente que ya leyó la información. 
Reglas:
- Respondé en el mismo idioma en que fue la pregunta
- Sé directo: si preguntaron cuántos años tiene alguien, decí "X tiene N años, nació el DD/MM/AAAA"
- Máximo 2-3 oraciones para respuestas simples
- Para respuestas complejas máximo 4-5 oraciones
- Al final, en una línea separada, incluí "Fuentes:" con 1-2 URLs relevantes en formato [Título](URL)
- No inventes información que no esté en los resultados
- No repitas la pregunta`;

    const response = await ModelService.generateResponse([
      { role: "user", content: prompt }
    ], {
      maxTokens: 300,
      temperature: 0.3, // baja para respuestas factuales
    });

    if (!response || response.trim().length < 10) {
      throw new Error("respuesta vacía del modelo");
    }

    return response.trim();
  }

  /* ── Formato raw (fallback si el modelo falla) ──────────── */
  _formatRaw(query, instant, webResults) {
    const lines = [`🔍 **Resultados para:** "${query}"\n`];

    if (instant) {
      lines.push(`📌 **Respuesta directa:**`);
      lines.push(instant.answer);
      if (instant.source) lines.push(`🔗 Fuente: [${instant.sourceName || instant.source}](${instant.source})\n`);
      else lines.push("");
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
    }

    return lines.join("\n");
  }

  /* ── DuckDuckGo Instant Answer ──────────────────────────── */
  async _ddgInstant(query) {
    return new Promise((resolve) => {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=es-ar`;
      const req = https.get(url, {
        timeout: 7000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json" }
      }, (res) => {
        let body = "";
        res.on("data", c => body += c);
        res.on("end", () => {
          try {
            const d = JSON.parse(body);
            const answer = d.AbstractText || d.Answer || "";
            const source = d.AbstractURL || "";
            const sourceName = d.AbstractSource || "";
            if (answer && answer.length > 15) resolve({ answer, source, sourceName });
            else resolve(null);
          } catch { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
    });
  }

  /* ── DuckDuckGo HTML ────────────────────────────────────── */
  async _ddgSearch(query) {
    return new Promise((resolve) => {
      const options = {
        hostname: "html.duckduckgo.com",
        path: `/html/?q=${encodeURIComponent(query)}&kl=es-ar`,
        method: "GET", timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
          "Accept-Encoding": "identity",
          "Referer": "https://duckduckgo.com/",
        }
      };
      const req = https.request(options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) { resolve([]); return; }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          try { resolve(this._parseDDGResults(Buffer.concat(chunks).toString("utf8"))); }
          catch (e) { logger.warn(`SearchBot DDG parse: ${e.message}`); resolve([]); }
        });
      });
      req.on("error", () => resolve([]));
      req.on("timeout", () => { req.destroy(); resolve([]); });
      req.end();
    });
  }

  _parseDDGResults(html) {
    const results = [];
    const titleRe   = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a[^>]+class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    const titles = []; let m;
    while ((m = titleRe.exec(html)) !== null && titles.length < 8) {
      const url = this._resolveUrl(m[1]);
      const title = this._clean(m[2]);
      if (url && title && !url.includes("duckduckgo.com")) titles.push({ url, title });
    }
    const snippets = [];
    while ((m = snippetRe.exec(html)) !== null && snippets.length < 8) {
      const s = this._clean(m[1]);
      if (s) snippets.push(s);
    }
    for (let i = 0; i < Math.min(titles.length, 6); i++) {
      results.push({ title: titles[i].title, url: titles[i].url, snippet: snippets[i] || "" });
    }
    if (results.length === 0) {
      const blockRe = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
      while ((m = blockRe.exec(html)) !== null && results.length < 6) {
        const block = m[1];
        const linkM = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const snipM = block.match(/class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
        if (linkM) {
          const url = this._resolveUrl(linkM[1]);
          const title = this._clean(linkM[2]);
          if (url && title && !url.includes("duckduckgo")) results.push({ url, title, snippet: snipM ? this._clean(snipM[1]) : "" });
        }
      }
    }
    return results.slice(0, 5);
  }

  /* ── Bing fallback ──────────────────────────────────────── */
  async _bingSearch(query) {
    return new Promise((resolve) => {
      const options = {
        hostname: "www.bing.com",
        path: `/search?q=${encodeURIComponent(query)}&setlang=es&cc=AR`,
        method: "GET", timeout: 10000,
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
          try { resolve(this._parseBingResults(Buffer.concat(chunks).toString("utf8"))); }
          catch { resolve([]); }
        });
      });
      req.on("error", () => resolve([]));
      req.on("timeout", () => { req.destroy(); resolve([]); });
      req.end();
    });
  }

  _parseBingResults(html) {
    const results = [];
    const blockRe = /<li[^>]+class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = blockRe.exec(html)) !== null && results.length < 5) {
      const block = m[1];
      const linkM = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snipM = block.match(/class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
      if (linkM) {
        const url = linkM[1];
        const title = this._clean(linkM[2]);
        const snippet = snipM ? this._clean(snipM[1]) : "";
        if (url && url.startsWith("http") && title) results.push({ url, title, snippet });
      }
    }
    return results;
  }

  /* ── Helpers ────────────────────────────────────────────── */
  _resolveUrl(raw) {
    if (!raw) return null;
    try {
      if (raw.includes("uddg=")) { const m = raw.match(/uddg=([^&]+)/); if (m) return decodeURIComponent(m[1]); }
      if (raw.startsWith("http")) return raw;
      return null;
    } catch { return null; }
  }

  _clean(str) {
    return str
      .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }

  _getDomain(url) {
    try { return new URL(url).hostname.replace("www.", ""); }
    catch { return url.substring(0, 30); }
  }
}

module.exports = SearchBot;