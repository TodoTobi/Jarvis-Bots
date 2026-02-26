const logger = require("../logs/logger");

class DoctorBot {
    constructor() {
        this.name = "DoctorBot";
    }

    async run(parameters) {
        if (!parameters || typeof parameters !== "object") {
            throw new Error("Invalid parameters for DoctorBot");
        }

        const { failedBot, error } = parameters;

        logger.info(`DoctorBot diagnosing: ${failedBot || "unknown"} → ${error || "no error info"}`);

        // Simulate diagnostic processing
        await new Promise(resolve => setTimeout(resolve, 300));

        const report = [];

        if (failedBot && error) {
            report.push(`⚠ Bot "${failedBot}" reported error: ${error}`);
            report.push(`📋 Recommendation: Check connectivity, parameters, and model availability.`);
        } else {
            report.push("✅ All systems operational. No issues detected.");
        }

        const result = report.join("\n");

        logger.info(`DoctorBot diagnosis complete: ${result}`);

        return result;
    }
}

module.exports = DoctorBot;