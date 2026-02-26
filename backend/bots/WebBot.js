/**
 * WebBot.js — General conversation, search and information retrieval
 * Passes queries through the LLM and returns natural language responses
 */

const Bot = require("./Bot");
const modelService = require("../services/ModelService");
const instructionLoader = require("../utils/InstructionLoader");
const logger = require("../logs/logger");

class WebBot extends Bot {
    constructor() {
        super("WebBot", "Conversación general y búsqueda de información");
    }

    async run(parameters) {
        // Accept multiple param names for flexibility
        const query =
            parameters?.query ||
            parameters?.message ||
            parameters?.prompt ||
            parameters?.text ||
            (parameters && Object.values(parameters).find(v => typeof v === "string")) ||
            "";

        if (!query) {
            throw new Error("WebBot requires a text query parameter");
        }

        logger.info(`WebBot processing: "${query.substring(0, 80)}${query.length > 80 ? "..." : ""}"`);

        const botInstructions = instructionLoader.get("bots");
        const soulInstructions = instructionLoader.get("soul");
        const userProfile = instructionLoader.get("user");

        const prompt = [
            "Eres Jarvis, un asistente de IA modular local.",
            soulInstructions ? `\nPersonalidad:\n${soulInstructions}` : "",
            userProfile ? `\nPerfil del usuario:\n${userProfile}` : "",
            botInstructions ? `\nContexto de bots disponibles:\n${botInstructions}` : "",
            `\nResponde en el mismo idioma que el usuario. Se claro, directo y útil.`,
            `\n---\nConsulta del usuario:\n${query}`
        ].filter(Boolean).join("\n");

        const response = await modelService.generateText(prompt);

        logger.info(`WebBot response: ${response.length} chars`);

        return response || "No obtuve respuesta del modelo.";
    }
}

module.exports = WebBot;