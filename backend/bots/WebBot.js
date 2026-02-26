const modelService = require("../services/ModelService");
const instructionLoader = require("../utils/InstructionLoader");
const logger = require("../logs/logger");

class WebBot {
    constructor() {
        this.name = "WebBot";
    }

    async run(parameters) {
        if (!parameters || typeof parameters !== "object") {
            throw new Error("Invalid parameters for WebBot");
        }

        // Accept 'query' or fallback to any string value in parameters
        const query =
            parameters.query ||
            parameters.message ||
            parameters.prompt ||
            parameters.text ||
            Object.values(parameters).find(v => typeof v === "string") ||
            JSON.stringify(parameters);

        if (!query) {
            throw new Error("WebBot requires a text query parameter");
        }

        logger.info(`WebBot processing: "${query.substring(0, 80)}..."`);

        /* =========================
           BUILD BOT-SPECIFIC CONTEXT
        ========================= */

        const botInstructions = instructionLoader.get("bots");

        const prompt = `You are WebBot, a specialized AI assistant.
Your task is to interpret the user's request and provide a helpful, clear response.
Respond in the same language as the user query.

${botInstructions ? "Context:\n" + botInstructions + "\n\n" : ""}User Query:
${query}

Respond clearly and directly. Do NOT wrap your response in JSON.`;

        /* =========================
           CALL CENTRAL MODEL SERVICE
        ========================= */

        const response = await modelService.generateText(prompt);

        logger.info(`WebBot response received (${response.length} chars)`);

        return response;
    }
}

module.exports = WebBot;