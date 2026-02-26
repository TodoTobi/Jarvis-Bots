/**
 * MediaBot.js — Controls media playback on the local PC
 *
 * Handles: YouTube, Spotify, VLC, volume control
 * Uses BatBot internally to execute the actual .bat scripts
 */

const Bot = require("./Bot");
const logger = require("../logs/logger");

// Intent → script key map
const MEDIA_INTENTS = {
    "media_play_youtube": { script: "media_youtube", needsQuery: true },
    "media_play_spotify": { script: "media_spotify", needsQuery: false },
    "media_play_vlc": { script: "media_vlc", needsQuery: true },
    "media_volume_up": { script: "volume_up", needsQuery: false },
    "media_volume_down": { script: "volume_down", needsQuery: false },
    "media_mute": { script: "volume_mute", needsQuery: false },
    "media_pause": { script: "media_pause", needsQuery: false },
    "media_next": { script: "media_next", needsQuery: false },
    "media_prev": { script: "media_prev", needsQuery: false }
};

class MediaBot extends Bot {
    constructor(batBot) {
        super("MediaBot", "Control de reproducción multimedia en PC");
        this.batBot = batBot;
    }

    async run(parameters) {
        const intent = this.requireParam(parameters, "intent");
        const query = this.getParam(parameters, "query", "");
        const volume = this.getParam(parameters, "volume", null);

        const mapping = MEDIA_INTENTS[intent];

        if (!mapping) {
            // Fallback: try to detect YouTube/Spotify from query alone
            if (query.toLowerCase().includes("youtube")) {
                return this._playYouTube(query);
            }
            if (query.toLowerCase().includes("spotify")) {
                return this._openSpotify(query);
            }
            throw new Error(`MediaBot: unrecognized intent "${intent}"`);
        }

        logger.info(`MediaBot handling: ${intent}${query ? " | query: " + query : ""}`);

        // Build args for bat script
        const args = [];
        if (mapping.needsQuery && query) {
            // Encode spaces for URL safety
            args.push(query.replace(/\s+/g, "+"));
        }
        if (volume !== null) {
            args.push(String(volume));
        }

        const result = await this.batBot.run({
            script: mapping.script,
            args
        });

        return result || `✅ ${intent} ejecutado`;
    }

    _playYouTube(query) {
        const cleanQuery = query.replace(/(pon|poneme|pone|reproduce|reproducir|play|busca|buscar)/gi, "").trim();
        return this.batBot.run({
            script: "media_youtube",
            args: [cleanQuery.replace(/\s+/g, "+")]
        });
    }

    _openSpotify(query) {
        return this.batBot.run({
            script: "media_spotify",
            args: []
        });
    }

    static getIntents() {
        return Object.keys(MEDIA_INTENTS);
    }
}

module.exports = MediaBot;