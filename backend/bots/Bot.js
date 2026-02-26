/**
 * Bot.js — Base class for all JarvisCore bots
 * All bots must extend this class and implement run()
 */

class Bot {
    constructor(name, description = "") {
        this.name = name;
        this.description = description;
        this.active = false;
        this.status = "idle"; // idle | working | error
        this.lastRun = null;
        this.lastError = null;
        this.runCount = 0;
    }

    /* =========================
       LIFECYCLE
    ========================= */

    activate() {
        this.active = true;
        this.status = "idle";
    }

    deactivate() {
        this.active = false;
        this.status = "idle";
    }

    /* =========================
       EXECUTION — must override
    ========================= */

    async run(parameters) {
        throw new Error(`run() must be implemented in ${this.name}`);
    }

    /* =========================
       STATE HELPERS
    ========================= */

    setWorking() {
        this.status = "working";
        this.lastError = null;
    }

    setSuccess() {
        this.status = "idle";
        this.lastError = null;
        this.lastRun = new Date();
        this.runCount++;
    }

    setError(errorMessage) {
        this.status = "error";
        this.lastError = errorMessage;
        this.lastRun = new Date();
    }

    getState() {
        return {
            name: this.name,
            description: this.description,
            active: this.active,
            status: this.status,
            lastRun: this.lastRun,
            lastError: this.lastError,
            runCount: this.runCount
        };
    }

    /* =========================
       PARAMETER VALIDATION
    ========================= */

    requireParam(parameters, key) {
        if (!parameters || parameters[key] === undefined || parameters[key] === null) {
            throw new Error(`${this.name} requires parameter: "${key}"`);
        }
        return parameters[key];
    }

    getParam(parameters, key, fallback = null) {
        return (parameters && parameters[key] !== undefined) ? parameters[key] : fallback;
    }
}

module.exports = Bot;
