/**
 * ModelService.js — v6.1 FIXED
 *
 * FIXES vs v6.0:
 *  1. BÚSQUEDA WEB: agregadas keywords "internet", "web", "en línea", "online" como triggers de SearchBot
 *     Antes: "buscá en internet X" no matcheaba nada → iba al LLM que lo mandaba a WebBot (chat)
 *     Ahora: cualquier mención de internet/web/online con contenido → SearchBot
 *
 *  2. CAPACIDADES: nueva regla que detecta "qué podés hacer", "qué sos capaz", "ayuda", etc.
 *     → intent especial "capabilities" manejado en BotManager
 *
 *  3. VOZ → ACCIÓN: el problema de voz NO está en ModelService sino en cómo el frontend
 *     manda el texto transcripto. ModelService procesa exactamente igual voz que texto.
 *     Ver nota en sttRoutes sobre asegurarse que el frontend mande a /api/chat.
 */

const axios = require("axios");
const logger = require("../logs/logger");

// ════════════════════════════════════════════════════════
//  QUICK_RULES — clasificador por keywords (sin LLM)
// ════════════════════════════════════════════════════════
const QUICK_RULES = [


    // ── WhatsApp QR ──────────────────────────────────────────────────────────
    {
        patterns: [/qr.*whatsapp|whatsapp.*qr|vincular.*whatsapp|whatsapp.*vincular|mostr[aá].*qr|mand[aá].*qr|pas[aá].*qr/i],
        result: () => ({ intent: "whatsapp_qr", parameters: {} })
    },

    // ── CAPACIDADES — "qué podés hacer", "qué sos capaz", "ayuda", "help" ───
    // ✅ FIX NUEVO: detectar pedidos de lista de capacidades
    {
        patterns: [
            /qu[eé]\s+(pod[eé]s|pued[ae]s|sab[eé]s|sabes)\s+(hacer|hac[eé]r)/i,
            /qu[eé]\s+(?:sos|er[ae]s)\s+capaz/i,
            /(?:lista|listame|dime|decime|mostr[aá]me)\s+(?:tus\s+)?(?:capacidades|funciones|comandos|habilidades)/i,
            /(?:tus\s+)?(?:capacidades|funciones|comandos|habilidades)/i,
            /c[oó]mo\s+(?:te\s+)?uso|c[oó]mo\s+funcionas/i,
            /^(?:ayuda|help|menu|menú)$/i,
            /qu[eé]\s+(?:cosas?\s+)?(?:pod[eé]s|pued[ae]s)\s+(?:hacer|hac[eé]r)/i,
        ],
        result: () => ({ intent: "capabilities", parameters: {} })
    },

    // ── Volumen EXACTO ────────────────────────────────────────────────────────
    {
        patterns: [/(?:pon[eé]?|seteá?|set[eé]a?|subí?|baj[aá]?)?\s*(?:vol[uú]?m[eé]?n?|bol[uú]m[eé]n?|vol)\s*(?:al?|en|a)?\s*(\d+)/i],
        result: (m) => {
            const match = m.match(/(\d+)/);
            const level = match ? parseInt(match[1]) : null;
            if (level !== null && level >= 0 && level <= 100) {
                return { intent: "volume", parameters: { action: "set_volume", level } };
            }
            return null;
        }
    },

    // ── Volumen subir/bajar sin número ───────────────────────────────────────
    {
        patterns: [/sub[ií].*(?:vol[uú]?m[eé]?n?|bol[uú]m[eé]n?)|m[aá]s.*(?:vol|soni[dq]o)|(?:vol[uú]?m[eé]?n?|soni[dq]o).*arriba|aument[aá].*vol/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "volume_up", args: [] } })
    },
    {
        patterns: [/baj[aá].*(?:vol[uú]?m[eé]?n?|bol[uú]m[eé]n?)|men[uo]s.*(?:vol|soni[dq]o)|(?:vol[uú]?m[eé]?n?|soni[dq]o).*abajo/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "volume_down", args: [] } })
    },
    {
        patterns: [/silenci[aá]r?|mut[eé][ao]?|sin\s+soni[dq]o|apag[aá].*soni[dq]o/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "volume_mute", args: [] } })
    },

    // ── YouTube con búsqueda específica ──────────────────────────────────────
    {
        patterns: [/(?:pon[eé]?m[eé]?|busca[r]?|pone[r]?|reproduce[r]?|play|abr[ií][r]?).*?(?:en\s+)?(?:y[ouo][ut][ut][ub][be]e?|you\s*tube)\s+(?:el?\s+)?(?:video\s+)?(?:de\s+|llamado?\s+|titulado?\s+)?(.+)/i],
        result: (m) => {
            const match = m.match(/(?:y[ouo][ut][ut][ub][be]e?|you\s*tube)\s+(?:el?\s+)?(?:video\s+)?(?:de\s+|llamado?\s+|titulado?\s+)?(.+)/i);
            const query = match ? match[1].trim() : "";
            return { intent: "bat_exec", parameters: { script: "media_youtube", args: query ? [query.replace(/\s+/g, "+")] : [] } };
        }
    },
    // YouTube sin query (solo abrir)
    {
        patterns: [/abr[ií][r]?\s+(?:y[ouo][ut][ut][ub][be]e?|you\s*tube)|(?:y[ouo][ut][ut][ub][be]e?)\s*$/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "media_youtube", args: [] } })
    },

    // ── Búsqueda web con resultados ───────────────────────────────────────────
    // ✅ FIX: Agregadas variantes con "internet", "web", "online", "en línea"
    {
        patterns: [
            /buscá?(?:me|nos|r)?[\s,]+(?:en[\s]+(?:la[\s]+)?(?:web|google|internet|bing|duckduckgo)[\s]+)?(.+)/i,
            /search[ea]?[\s]+(.+)/i,
            /googl[eé][aá]?[\s]+(.+)/i,
            /cu[aá]ntos[\s]+a[ñn]os[\s]+(?:tiene|tenía|tenia|cumple)[\s]+(.+)/i,
            /qu[eé][\s]+(?:edad|a[ñn]os)[\s]+tiene[\s]+(.+)/i,
            /qui[eé]n[\s]+(?:es|fue|era|son)[\s]+(.+)/i,
            /qu[eé][\s]+es[\s]+(?:el|la|los|las|un|una)?[\s]*(.+)/i,
            /cu[aá]ndo[\s]+(?:naci[oó]|muri[oó]|fue|empez[oó])[\s]+(.+)/i,
            // ✅ NUEVOS: internet / web / online como keyword de búsqueda
            /(?:busca[r]?|buscame|encuentra[r]?)[\s]+(?:en[\s]+)?(?:internet|la[\s]+web|online|en[\s]+l[ií]nea)[\s]+(.+)/i,
            /(?:en[\s]+)?(?:internet|la[\s]+web|online)[\s]+(?:busca[r]?|encuentra[r]?|qué[\s]+(?:dice|dicen|hay))[\s]+(?:sobre[\s]+|acerca[\s]+de[\s]+)?(.+)/i,
            /inform[aá](?:cion|ción)[\s]+(?:sobre|acerca[\s]+de|de)[\s]+(.+)/i,
            /(?:dime|decime|mostr[aá]me)[\s]+(?:sobre|acerca[\s]+de)[\s]+(.+)/i,
        ],
        result: (m) => {
            const match =
                m.match(/buscá?(?:me|nos|r)?[\s,]+(?:en[\s]+(?:la[\s]+)?(?:web|google|internet|bing|duckduckgo)[\s]+)?(.+)/i) ||
                m.match(/search[ea]?[\s]+(.+)/i) ||
                m.match(/googl[eé][aá]?[\s]+(.+)/i) ||
                m.match(/cu[aá]ntos[\s]+a[ñn]os[\s]+(?:tiene|tenía|tenia|cumple)[\s]+(.+)/i) ||
                m.match(/qui[eé]n[\s]+(?:es|fue|era)[\s]+(.+)/i) ||
                m.match(/qu[eé][\s]+es[\s]+(?:el|la|un|una)?[\s]*(.+)/i) ||
                m.match(/cu[aá]ndo[\s]+\w+[\s]+(.+)/i) ||
                m.match(/(?:busca[r]?|buscame|encuentra[r]?)[\s]+(?:en[\s]+)?(?:internet|la[\s]+web|online|en[\s]+l[ií]nea)[\s]+(.+)/i) ||
                m.match(/(?:en[\s]+)?(?:internet|la[\s]+web|online)[\s]+(?:busca[r]?|encuentra[r]?|qué[\s]+(?:dice|dicen|hay))[\s]+(?:sobre[\s]+|acerca[\s]+de[\s]+)?(.+)/i) ||
                m.match(/inform[aá](?:cion|ción)[\s]+(?:sobre|acerca[\s]+de|de)[\s]+(.+)/i) ||
                m.match(/(?:dime|decime|mostr[aá]me)[\s]+(?:sobre|acerca[\s]+de)[\s]+(.+)/i);
            const query = match ? match[1].trim() : m.trim();
            // Excluir YouTube (regla aparte)
            if (/y[ouo][ut][ut][ub][be]e?/.test(query)) return null;
            return { intent: "search_web", parameters: { query } };
        }
    },

    // ── ChatGPT en navegador ─────────────────────────────────────────────────
    {
        patterns: [/(?:abr[ií][r]?|abre|entr[aá][r]?|abrir)\s+(?:chat\s*gpt|chatgpt)\s*(?:y\s+(?:preguntal[eé]|pregunt[aá]|decil[eé]|consultá)\s+)?(.*)$/i],
        result: (m) => {
            const match = m.match(/chatgpt\s*(?:y\s+(?:preguntal[eé]|pregunt[aá]|decil[eé]|consultá)\s+)?(.+)/i);
            const query = match ? match[1].trim() : "";
            return {
                intent: "bat_exec",
                parameters: { script: "app_chatgpt", args: query ? [encodeURIComponent(query)] : [] }
            };
        }
    },

    // ── Antigravity ──────────────────────────────────────────────────────────
    {
        patterns: [/(?:abr[ií][r]?|abre)\s+anti\s*gravity(?:\s+(?:con|y|la\s+carpeta|folder)\s+(.+))?/i],
        result: (m) => {
            const match = m.match(/anti\s*gravity(?:\s+(?:con|y|la\s+carpeta|folder)\s+(.+))?/i);
            const folder = match ? (match[1] || "").trim() : "";
            return {
                intent: "bat_exec",
                parameters: { script: "app_antigravity", args: folder ? [folder] : [] }
            };
        }
    },

    // ── Navegadores específicos ───────────────────────────────────────────────
    {
        patterns: [/abr[ií][r]?\s+chrome|chrome\s+(?:con|en)/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_chrome", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+firefox|firefox\s+(?:con|en)/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_firefox", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+brave|brave\s+browser/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_brave", args: [] } })
    },

    // ── Spotify ─────────────────────────────────────────────────────────────
    {
        patterns: [/abr[ií][r]?\s+spoti(?:fy)?|poneme?\s+spoti|m[uú]sica.*spotify|\bspotify\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "media_spotify", args: [] } })
    },

    // ── VLC ──────────────────────────────────────────────────────────────────
    {
        patterns: [/abr[ií][r]?\s+vlc|\bvlc\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "media_vlc", args: [] } })
    },

    // ── Media controls ───────────────────────────────────────────────────────
    {
        patterns: [/paus[aá][r]?|detener?\s+m[uú]sica|para[r]?\s+(?:la\s+)?m[uú]sica|stop\s+m[uú]sica/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "media_pause", args: [] } })
    },
    {
        patterns: [/siguiente\s+canci[oó]n|next\s+track|siguiente\s+tema|skip|saltar/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "media_next", args: [] } })
    },
    {
        patterns: [/anterior\s+canci[oó]n|prev\s+track|volver\s+canci[oó]n|atras\s+canci/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "media_prev", args: [] } })
    },

    // ── Apps de desarrollo ───────────────────────────────────────────────────
    {
        patterns: [/abr[ií][r]?\s+(?:vs\s*code|vscode|visual\s+studio\s+code|\bcode\b)(?:\s+(.+))?/i],
        result: (m) => {
            const match = m.match(/(?:vscode|vs\s*code|code)\s+(.+)/i);
            const p = match ? match[1].trim() : "";
            return { intent: "bat_exec", parameters: { script: "app_vscode", args: p ? [p] : [] } };
        }
    },
    {
        patterns: [/abr[ií][r]?\s+cursor|\bcursor\s+(?:ide|editor)\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_cursor", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+postman|\bpostman\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_postman", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+(?:terminal|cmd|consola|command\s+prompt)|abr[ií][r]?\s+(?:la\s+)?terminal/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_terminal", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+powershell|\bpowershell\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_powershell", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+github\s+desktop|github\s+desktop/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_github_desktop", args: [] } })
    },

    // ── Apps generales ───────────────────────────────────────────────────────
    {
        patterns: [/abr[ií][r]?\s+discord|\bdiscord\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_discord", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+fortnite|\bfortnite\b/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_fortnite", args: [] } })
    },
    {
        patterns: [/abr[ií][r]?\s+(?:el\s+)?(?:navegador|browser)|abr[ií][r]?\s+(?:internet|web)/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "app_browser", args: [] } })
    },

    // ── Sistema ──────────────────────────────────────────────────────────────
    {
        patterns: [/bloque[aá][r]?\s+(?:pc|pantalla|compu)|lock\s+pc/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "system_lock", args: [] } })
    },
    {
        patterns: [/(?:sac[aá]|tom[aá]|hac[eé]).*captura|captura.*pantalla|\bscreenshot\b|print\s+screen/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "system_screenshot", args: [] } })
    },
    {
        patterns: [/modo\s+nocturno|modo.*noche|night\s+mode|dark\s+mode|luz.*baja/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "system_night_mode", args: [] } })
    },
    {
        patterns: [/dormir.*(?:pc|compu)|suspensi[oó]n|sleep.*pc/i],
        result: () => ({ intent: "bat_exec", parameters: { script: "system_sleep", args: [] } })
    },

    // ── Control PC ───────────────────────────────────────────────────────────
    {
        patterns: [/tom[aá].*control.*pc|automatiz[aá]|mover.*mouse/i],
        result: (m) => ({ intent: "computer_control", parameters: { task: m } })
    },

    // ── ADB Android ──────────────────────────────────────────────────────────
    {
        patterns: [/youtube.*celu|celu.*youtube/i],
        result: () => ({ intent: "net_adb_youtube", parameters: { device: "phone_tobias", query: "" } })
    },
    {
        patterns: [/captura.*celu|screenshot.*celu|celu.*captura/i],
        result: () => ({ intent: "net_adb_screenshot", parameters: { device: "phone_tobias" } })
    },

    /**
 * QUICK_RULES ADICIONALES — DriveBot
 * ──────────────────────────────────────────────────────────
 * Pegá estas reglas DENTRO del array QUICK_RULES en ModelService.js,
 * ANTES de la última regla (la de .bat genérico).
 *
 * Cubren todos los casos de uso de DriveBot:
 *   - Mover/copiar al Drive Sync
 *   - Buscar archivos en la PC
 *   - Listar Drive
 *   - Crear carpetas
 *   - Eliminar archivos
 * ──────────────────────────────────────────────────────────
 */

    // ── MOVER AL DRIVE SYNC ─────────────────────────────────────────────────────
    {
        patterns: [
            /(?:pas[aá]me|mand[aá]me|mand[aá]|mov[eé][r]?|pas[aá])\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+)?(?:drive|google\s+drive|la\s+nube|nube)/i,
            /(?:sub[ií][r]?|upload)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+)?(?:drive|google\s+drive|la\s+nube)/i,
            /(?:al?\s+)?(?:drive|google\s+drive)\s+(?:el\s+|la\s+)?(.+)/i,
        ],
        result: (m) => {
            const match =
                m.match(/(?:pas[aá]me|mand[aá]me|mand[aá]|mov[eé][r]?|pas[aá])\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+)?(?:drive|google\s+drive|la\s+nube|nube)/i) ||
                m.match(/(?:sub[ií][r]?|upload)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+)?(?:drive|google\s+drive|la\s+nube)/i) ||
                m.match(/(?:al?\s+)?(?:drive|google\s+drive)\s+(?:el\s+|la\s+)?(.+)/i);
            const filename = match ? match[1].trim() : m.trim();
            return {
                intent: "move_to_drive",
                parameters: { action: "move_to_drive", filename, skipShortcuts: true }
            };
        }
    },

    // ── COPIAR AL DRIVE (sin borrar original) ───────────────────────────────────
    {
        patterns: [
            /cop[ií][aá][r]?\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+)?(?:drive|google\s+drive|la\s+nube)/i,
            /(?:hac[eé][r]?\s+una?\s+copia|copi[aá])\s+(?:de\s+)?(.+?)\s+(?:al?\s+|en\s+el\s+)?(?:drive|google\s+drive)/i,
        ],
        result: (m) => {
            const match =
                m.match(/cop[ií][aá][r]?\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:al?\s+)?(?:drive|google\s+drive)/i) ||
                m.match(/(?:una?\s+copia|copi[aá])\s+(?:de\s+)?(.+?)\s+(?:al?\s+|en\s+el\s+)?(?:drive|google\s+drive)/i);
            const filename = match ? match[1].trim() : m.trim();
            return {
                intent: "copy_to_drive",
                parameters: { action: "copy_to_drive", filename, skipShortcuts: true }
            };
        }
    },

    // ── BUSCAR ARCHIVO EN LA PC ──────────────────────────────────────────────────
    {
        patterns: [
            /(?:busca[r]?|encontra[r]?|d[oó]nde\s+(?:est[aá]|qued[oó]|guard[eé]?))\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:archivo\s+|carpeta\s+|pdf\s+|doc\s+|imagen\s+|video\s+|exe\s+)?(.+?)(?:\s+en\s+la\s+pc)?$/i,
            /(?:en\s+(?:la\s+)?pc|en\s+mi\s+(?:compu|computadora|pc))\s+(.+)/i,
            /d[oó]nde\s+(?:est[aá]|guard[eé]?)\s+(.+)/i,
        ],
        result: (m) => {
            const match =
                m.match(/(?:busca[r]?|encontra[r]?|d[oó]nde\s+\w+)\s+(?:el\s+|la\s+)?(?:archivo\s+|carpeta\s+|pdf\s+|doc\s+|imagen\s+|video\s+|exe\s+)?(.+?)(?:\s+en\s+la\s+pc)?$/i) ||
                m.match(/d[oó]nde\s+(?:est[aá]|guard[eé]?)\s+(.+)/i);
            // Excluir si ya matcheó otra regla (ej: búsqueda web)
            if (!match) return null;
            const query = match[1].trim();
            // Si tiene "en internet", "en google", etc → no es búsqueda de archivo
            if (/en\s+(?:internet|google|bing|la\s+web|online)/i.test(query)) return null;
            return {
                intent: "file_search",
                parameters: { action: "search", query, filename: query }
            };
        }
    },

    // ── LISTAR DRIVE ─────────────────────────────────────────────────────────────
    {
        patterns: [
            /(?:qu[eé]\s+hay|lista[r]?|mostr[aá][r]?|ver)\s+(?:en\s+)?(?:el\s+)?(?:drive|google\s+drive|la\s+nube)/i,
            /(?:archivos|contenido)\s+(?:del?\s+)?(?:drive|google\s+drive)/i,
        ],
        result: () => ({
            intent: "list_drive",
            parameters: { action: "list_drive" }
        })
    },

    // ── CREAR CARPETA ────────────────────────────────────────────────────────────
    {
        patterns: [
            /cre[aá][r]?\s+(?:una?\s+)?carpeta\s+(?:llamada?\s+|con\s+nombre\s+)?(.+?)(?:\s+en\s+(.+))?$/i,
            /nueva\s+carpeta\s+(?:llamada?\s+|con\s+nombre\s+)?(.+)/i,
        ],
        result: (m) => {
            const match =
                m.match(/cre[aá][r]?\s+(?:una?\s+)?carpeta\s+(?:llamada?\s+|con\s+nombre\s+)?(.+?)(?:\s+en\s+(.+))?$/i) ||
                m.match(/nueva\s+carpeta\s+(?:llamada?\s+)?(.+)/i);
            const name = match ? match[1].trim() : m.trim();
            const location = match?.[2]?.trim() || null;
            const inDrive = /drive|nube/i.test(m);
            return {
                intent: "folder_create",
                parameters: { action: "create_folder", name, destination: location || (inDrive ? null : null), inDrive }
            };
        }
    },

    // ── ELIMINAR ARCHIVO ─────────────────────────────────────────────────────────
    {
        patterns: [
            /(?:elimin[aá][r]?|borr[aá][r]?|borra[r]?|remov[eé][r]?)\s+(?:el\s+|la\s+)?(?:archivo\s+|carpeta\s+)?(.+)/i,
        ],
        result: (m) => {
            const match = m.match(/(?:elimin[aá][r]?|borr[aá][r]?|borra[r]?|remov[eé][r]?)\s+(?:el\s+|la\s+)?(?:archivo\s+|carpeta\s+)?(.+)/i);
            const filename = match ? match[1].trim() : m.trim();
            return {
                intent: "file_delete",
                parameters: { action: "delete_file", filename }
            };
        }
    },

    // ── .bat genérico ─────────────────────────────────────────────────────────
    {
        patterns: [/\.bat\b/i],
        result: (m) => {
            const s = m.match(/([a-z_]+)\.bat/i);
            return { intent: "bat_exec", parameters: { script: (s?.[1] || "media_youtube").toLowerCase(), args: [] } };
        }
    },

    // ── CERRAR apps ─────────────────────────────────────────────────────────
    {
        patterns: [/cerr[aá][r]?\s+(?:el\s+)?youtube|clos[eo]?\s+youtube/i],
        result: () => ({ intent: "close_youtube", parameters: {} })
    },
    {
        patterns: [/cerr[aá][r]?\s+(?:el\s+)?spotify|clos[eo]?\s+spotify/i],
        result: () => ({ intent: "close_spotify", parameters: {} })
    },
    {
        patterns: [/cerr[aá][r]?\s+(?:el\s+)?discord|clos[eo]?\s+discord/i],
        result: () => ({ intent: "close_discord", parameters: {} })
    },
    {
        patterns: [/cerr[aá][r]?\s+(?:el\s+)?(?:chrome|google\s+chrome)|clos[eo]?\s+chrome/i],
        result: () => ({ intent: "close_chrome", parameters: {} })
    },
    {
        patterns: [/cerr[aá][r]?\s+(?:vs\s*code|vscode|visual\s+studio)|clos[eo]?\s+(?:vs\s*code|vscode)/i],
        result: () => ({ intent: "close_vscode", parameters: {} })
    },
    {
        patterns: [/cerr[aá][r]?\s+(?:el\s+)?vlc|clos[eo]?\s+vlc/i],
        result: () => ({ intent: "close_vlc", parameters: {} })
    },

    // ── GOOGLE DOCS — Crear nuevo documento ──────────────────────────────────
    {
        patterns: [
            /cre[aá][r]?\s+(?:un[ao]?\s+)?(?:nuevo\s+)?(?:documento|doc)\s+(?:en\s+)?(?:google\s+)?(?:docs?|drive)?/i,
            /(?:nuevo|new)\s+(?:documento|doc)\s+(?:en\s+)?(?:google\s+)?(?:docs?)?/i,
            /cre[aá][r]?\s+(?:un[ao]?\s+)?(?:tesis|ensayo|informe|reporte|resumen)\s+(?:en\s+(?:el\s+)?(?:docs|google\s+docs|drive))?/i,
        ],
        result: (m) => {
            const titleMatch =
                m.match(/(?:llamado?|titulado?|con\s+(?:el\s+)?t[íi]tulo)\s+(.+)/i) ||
                m.match(/(?:tesis|ensayo|informe|reporte|resumen)\s+(?:\S+\s+)?(?:sobre|de|acerca\s+de)\s+(.+)/i) ||
                m.match(/(?:sobre|de)\s+(.+)/i);
            const title = titleMatch ? titleMatch[1].trim() : "Nuevo documento";
            return {
                intent: "google_docs_create",
                parameters: { action: "create_doc", title }
            };
        }
    },

    // ── GOOGLE DOCS — Duplicar ─────────────────────────────────────────────
    {
        patterns: [
            /duplic[aá][r]?\s+(?:el\s+)?(?:documento|doc|archivo)\s+(.+)/i,
            /hac[eé][r]?\s+(?:una?\s+)?copia\s+(?:del?\s+)?(?:documento|doc)\s+(.+)/i,
            /cop[ií][aá][r]?\s+(?:el\s+)?(?:documento|doc)\s+(.+)/i,
        ],
        result: (m) => {
            const match = m.match(/(?:duplic[aá][r]?|copi[aá][r]?|copia)\s+(?:el\s+)?(?:documento|doc|archivo)?\s+(.+)/i);
            const docName = match?.[1]?.trim() || null;
            return { intent: "google_docs_duplicate", parameters: { action: "duplicate_doc", docName } };
        }
    },

    // ── GOOGLE DOCS — Escribir/Editar ───────────────────────────────────────
    {
        patterns: [
            /(?:escrib[ií][r]?|edit[aá][r]?|agregá?[r]?|pon[eé][r]?)\s+(?:en\s+(?:el\s+)?(?:documento|doc)\s+)(.+)/i,
            /(?:en\s+(?:el\s+)?(?:documento|doc)\s+\S+)\s+(?:escrib[ií][r]?|pon[eé][r]?|agreg[aá][r]?)\s+(.+)/i,
            /(?:al?\s+documento|al?\s+doc)\s+(.+?)\s+(?:escrib[ií][r]?|agreg[aá][r]?|pon[eé][r]?)\s+(.+)/i,
        ],
        result: (m) => {
            // Intentar separar nombre de doc y contenido
            const match1 = m.match(/(?:escrib[ií]|edit[aá]|agreg[aá]|pon[eé])\s+(.+?)\s+en\s+(?:el\s+)?(?:documento|doc)\s+(.+)/i);
            const match2 = m.match(/en\s+(?:el\s+)?(?:documento|doc)\s+(.+?)\s+(?:escrib[ií]|pon[eé]|agreg[aá])\s+(.+)/i);
            let docName = null, content = null;
            if (match2) { docName = match2[1]?.trim(); content = match2[2]?.trim(); }
            else if (match1) { content = match1[1]?.trim(); docName = match1[2]?.trim(); }
            else { content = m.replace(/(?:escrib[ií]|edit[aá]|agreg[aá]|pon[eé])\s+/i, "").trim(); }
            return { intent: "google_docs_write", parameters: { action: "write_doc", docName, content } };
        }
    },

    // ── GOOGLE DOCS — Duplicar Y escribir (workflow combinado) ─────────────
    {
        patterns: [
            /duplic[aá][r]?\s+.+\s+y\s+(?:escrib[ií]|pon[eé]|edit[aá]|agreg[aá])\s+.+/i,
            /(?:crea?\s+una?\s+copia|hac[eé]\s+una?\s+copia)\s+.+\s+y\s+(?:escrib[ií]|pon[eé])\s+.+/i,
        ],
        result: (m) => {
            const dupMatch = m.match(/duplic[aá][r]?\s+(?:el\s+)?(?:documento\s+)?(.+?)\s+y\s+/i);
            const writeMatch = m.match(/y\s+(?:escrib[ií]|pon[eé]|edit[aá])\s+(.+)/i);
            return {
                intent: "google_docs_duplicate_and_write",
                parameters: {
                    action: "duplicate_and_write",
                    docName: dupMatch?.[1]?.trim() || null,
                    content: writeMatch?.[1]?.trim() || null,
                }
            };
        }
    },

    // ── GOOGLE DOCS — Listar ───────────────────────────────────────────────
    {
        patterns: [
            /(?:mostr[aá]|list[aá]|ver|dame)\s+(?:mis\s+)?(?:documentos|docs)\s+(?:de\s+)?(?:google|drive)?/i,
            /(?:qu[eé]\s+)?(?:documentos|docs)\s+(?:tengo|hay)\s+(?:en\s+)?(?:google|drive|docs)?/i,
        ],
        result: () => ({ intent: "google_docs_list", parameters: { action: "list_docs" } })
    },

    // ── GOOGLE DOCS — Leer ────────────────────────────────────────────────
    {
        patterns: [
            /(?:le[eé][r]?|mostr[aá][r]?|abr[ií][r]?)\s+(?:el\s+contenido\s+(?:del?\s+)?)?(?:documento|doc)\s+(.+)/i,
            /qu[eé]\s+(?:dice|contiene|hay)\s+(?:en\s+)?(?:el\s+)?(?:documento|doc)\s+(.+)/i,
        ],
        result: (m) => {
            const match = m.match(/(?:documento|doc)\s+(.+)/i);
            return { intent: "google_docs_read", parameters: { action: "read_doc", docName: match?.[1]?.trim() || null } };
        }
    },

    // ── ANTIGRAVITY con tarea para el agente ───────────────────────────────
    {
        patterns: [
            /abr[ií][r]?\s+anti\s*gravity\s+y\s+(?:dile?|pide?|preguntale?|que)\s+(.+)/i,
            /anti\s*gravity.*(?:busca[r]?|detect[aá]|encuentr[ae]|rev[ií]s[aá]|analiz[aá])\s+(.+)/i,
        ],
        result: (m) => {
            const match = m.match(/(?:dile?|pide?|preguntale?|que)\s+(.+)/i)
                || m.match(/(?:busca[r]?|detect[aá]|encuentr[ae]|rev[ií]s[aá]|analiz[aá])\s+(.+)/i);
            const task = match?.[1]?.trim() || m;
            return {
                intent: "antigravity_agent",
                parameters: { task, message: task, _originalMessage: m }
            };
        }
    },
];

function quickClassify(text) {
    const t = text.trim();
    for (const rule of QUICK_RULES) {
        for (const pattern of rule.patterns) {
            if (pattern.test(t)) {
                const r = rule.result(t);
                if (r === null) continue;
                logger.info(`QuickClassify: "${t.substring(0, 60)}" → ${r.intent}:${JSON.stringify(r.parameters).substring(0, 80)}`);
                return r;
            }
        }
    }
    return null;
}

// ════════════════════════════════════════════════════════

class ModelService {
    constructor() {
        this.baseURL = (process.env.LM_API_URL || "").replace(/\/$/, "");
        this.apiKey = process.env.LM_API_TOKEN || "";
        this.model = process.env.LM_MODEL || "";
        if (!this.baseURL) throw new Error("LM_API_URL not defined in .env");
        this._axiosConfig = {
            headers: {
                "Content-Type": "application/json",
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            timeout: 90000
        };
        this._checkConnection().catch(() => { });
    }

    async _checkConnection() {
        try {
            const res = await axios.get(`${this.baseURL}/models`, { ...this._axiosConfig, timeout: 5000 });
            const models = res.data?.data || [];
            logger.info(`ModelService: connected. Models: ${models.map(m => m.id).join(", ") || "(none)"}`);
        } catch (err) {
            logger.error(`ModelService: Cannot reach LM Studio — ${err.message}`);
        }
    }

    _buildBody(messages, opts = {}) {
        const body = { messages, temperature: opts.temperature ?? 0.1, max_tokens: opts.max_tokens ?? 200 };
        if (this.model) body.model = this.model;
        return body;
    }

    async generateIntent(fullContext) {
        const userMsgMatch = fullContext.match(/\[MENSAJE DEL USUARIO\]\s*([\s\S]+?)(?:\[|$)/);
        const userMsg = (userMsgMatch ? userMsgMatch[1].trim() : fullContext.trim()).substring(0, 1000);

        // 1. Clasificador rápido por keywords
        const quick = quickClassify(userMsg);
        if (quick) return this._validateIntent(quick);

        // 2. Fallback LLM
        logger.info(`ModelService: no quick match, querying LLM: "${userMsg.substring(0, 60)}"`);
        const systemPrompt = `You are a JSON-only intent classifier for a voice assistant. Output ONLY valid JSON.
The user may make typos — infer the closest real intent.
Format: {"intent":"chat_response","parameters":{"query":"text"},"priority":"normal"}
No markdown, no explanation. Only JSON.`;

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMsg.substring(0, 200) }
                    ],
                    { temperature: 0.0, max_tokens: 80 }
                ),
                this._axiosConfig
            );
            const raw = response.data?.choices?.[0]?.message?.content || "";
            logger.info(`ModelService raw: ${raw.substring(0, 100)}`);
            return this._validateIntent(this._safeParse(raw, userMsg));
        } catch (err) {
            logger.error(`ModelService LLM error: ${err.message}`);
            // Fallback inteligente: si el mensaje menciona docs, forzar Google Docs
            if (/(?:docs|google\s+docs|documento|crea[r]?\s+\w+\s+en)/i.test(userMsg)) {
                const titleM = userMsg.match(/(?:sobre|de|acerca\s+de)\s+(.+)/i);
                return { intent: "google_docs_create", parameters: { action: "create_doc", title: titleM ? titleM[1].trim() : "Nuevo documento" }, priority: "normal" };
            }
            return { intent: "chat_response", parameters: { query: userMsg }, priority: "normal" };
        }
    }

    async generateText(prompt, opts = {}) {
        const baseInstructions = `Sos Jarvis, asistente IA local de Tobías. Respondé SIEMPRE en español rioplatense. Sé directo y conciso.
IMPORTANTE: El usuario a veces escribe con errores de tipeo por escribir rápido. Intentá siempre entender lo que quiso decir aunque esté mal escrito. No comentes sobre los errores.
NUNCA empieces tu respuesta con saludos como "Hola", "¡Hola!", "Buenas", "¿En qué puedo ayudarte?", "Claro" o similares. Respondé directamente al pedido sin preámbulos ni cortesías.`;

        const systemPrompt = opts.extraInstructions
            ? baseInstructions + "\n" + opts.extraInstructions
            : baseInstructions;

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                this._buildBody(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt.replace(/```/g, "").trim().substring(0, 3000) }
                    ],
                    { temperature: 0.5, max_tokens: 1024 }
                ),
                this._axiosConfig
            );
            const text = response.data?.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty text response from model");
            return text.trim();
        } catch (err) {
            logger.error(`ModelService generateText: ${err.message}`);
            throw new Error(`Error al generar respuesta: ${err.message}`);
        }
    }

    _safeParse(raw, fallbackQuery) {
        const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        try { return JSON.parse(cleaned); } catch { }
        const match = cleaned.match(/\{[\s\S]*?\}/);
        if (match) { try { return JSON.parse(match[0]); } catch { } }
        return { intent: "chat_response", parameters: { query: fallbackQuery || raw.trim() }, priority: "normal" };
    }

    _validateIntent(obj) {
        if (!obj || typeof obj !== "object") return { intent: "chat_response", parameters: {}, priority: "normal" };
        const intent = typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : "chat_response";
        return {
            intent,
            parameters: (obj.parameters && typeof obj.parameters === "object") ? obj.parameters : {},
            priority: ["low", "normal", "high"].includes(obj.priority) ? obj.priority : "normal"
        };
    }
}

module.exports = new ModelService();