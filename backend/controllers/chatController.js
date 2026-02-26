const instructionLoader = require("../utils/InstructionLoader");
const modelService = require("../services/ModelService");
const botManager = require("../bots/BotManager");
const logger = require("../logs/logger");

class ChatController {

    health(req, res) {
        res.json({ status: "OK", timestamp: new Date().toISOString() });
    }

    async handleChat(req, res, next) {
        try {
            const { message } = req.body;

            if (!message || typeof message !== "string") {
                const error = new Error("Invalid message format");
                error.status = 400;
                throw error;
            }

            logger.info(`Incoming message: "${message.substring(0, 100)}"`);

            /* 1️⃣ Build Context */
            const fullContext = instructionLoader.buildFullContext(message);

            /* 2️⃣ Get Intent from Model */
            const intentObject = await modelService.generateIntent(fullContext);

            if (!intentObject || !intentObject.intent) {
                throw new Error("Invalid intent structure from model");
            }

            logger.info(`Model intent: ${intentObject.intent}`);

            /* 3️⃣ Execute Intent via BotManager */
            const executionResult = await botManager.executeIntent(intentObject);

            /* 4️⃣ Persist to Memory */
            try {
                instructionLoader.appendToMemory(
                    `User: ${message}\nIntent: ${intentObject.intent}\nResult: ${executionResult.reply?.substring(0, 200) || "empty"}`
                );
            } catch (memErr) {
                logger.warn(`Memory write failed: ${memErr.message}`);
            }

            return res.json({
                success: !executionResult.error,
                reply: executionResult.reply,
                intent: intentObject.intent
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ChatController();