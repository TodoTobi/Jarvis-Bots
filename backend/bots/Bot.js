class Bot {
    constructor(name) {
        this.name = name;
        this.active = false;
        this.status = "idle";
        this.lastRun = null;
        this.lastError = null;
    }

    activate() {
        this.active = true;
        this.status = "active";
    }

    deactivate() {
        this.active = false;
        this.status = "inactive";
    }

    async run(input) {
        throw new Error("run() must be implemented in child class");
    }

    setError(error) {
        this.status = "error";
        this.lastError = error;
    }

    setSuccess() {
        this.status = "idle";
        this.lastError = null;
        this.lastRun = new Date();
    }

    getState() {
        return {
            name: this.name,
            active: this.active,
            status: this.status,
            lastRun: this.lastRun,
            lastError: this.lastError
        };
    }
}

module.exports = Bot;