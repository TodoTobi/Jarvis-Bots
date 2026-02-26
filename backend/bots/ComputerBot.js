/**
 * ComputerBot.js — Controls the local PC (mouse, keyboard, screen reading)
 *
 * Uses:
 *  - Python + pyautogui for mouse/keyboard control
 *  - A vision-capable AI (Claude or OpenAI GPT-4V) to see the screen
 *
 * Requirements:
 *  - pip install pyautogui pillow
 *  - VISION_API_KEY in .env (Anthropic or OpenAI key)
 *  - VISION_PROVIDER=claude|openai (default: claude)
 *  - COMPUTER_CONTROL_ENABLED=true in .env (safety switch)
 *
 * How it works:
 *  1. Takes a screenshot of the current screen
 *  2. Sends it to the vision AI with the task description
 *  3. The AI returns step-by-step actions (click x,y | type text | key shortcut | done)
 *  4. ComputerBot executes each action via Python
 *  5. Repeats screenshot→plan→act until task is done or max steps reached
 */

const Bot = require("./Bot");
const { exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const logger = require("../logs/logger");

// Max action loop iterations (safety limit)
const MAX_STEPS = 15;

class ComputerBot extends Bot {
    constructor() {
        super("ComputerBot", "Control del PC: mouse, teclado, automatización de tareas");
        this.enabled = process.env.COMPUTER_CONTROL_ENABLED === "true";
        this.visionKey = process.env.VISION_API_KEY || "";
        this.visionProvider = process.env.VISION_PROVIDER || "claude";
        this.screenshotDir = path.resolve(__dirname, "../../screenshots");
        fs.mkdirSync(this.screenshotDir, { recursive: true });
    }

    /* =========================
       MAIN ENTRY
    ========================= */

    async run(parameters) {
        if (!this.enabled) {
            return "⚠ Computer control está desactivado. Activalo en Configuración → COMPUTER_CONTROL_ENABLED=true";
        }

        if (!this.visionKey) {
            return "⚠ Vision API key no configurada. Agregá VISION_API_KEY en Configuración.";
        }

        const task = parameters?.task || parameters?.query || "";
        if (!task) throw new Error("ComputerBot requiere parámetro 'task'");

        logger.info(`ComputerBot: starting task → "${task}"`);
        return await this._executeTask(task);
    }

    /* =========================
       TASK EXECUTION LOOP
    ========================= */

    async _executeTask(task) {
        const log = [];
        let step = 0;
        let done = false;

        while (step < MAX_STEPS && !done) {
            step++;
            logger.info(`ComputerBot step ${step}/${MAX_STEPS}`);

            // 1. Screenshot
            const screenshotPath = await this._screenshot();
            if (!screenshotPath) {
                log.push("❌ No se pudo capturar la pantalla");
                break;
            }

            // 2. Ask vision AI what to do next
            const plan = await this._planNextAction(task, screenshotPath, log);

            if (!plan || !plan.action) {
                log.push("❌ El modelo visual no devolvió una acción válida");
                break;
            }

            logger.info(`ComputerBot plan: ${JSON.stringify(plan)}`);

            // 3. Execute action
            if (plan.action === "done") {
                log.push(`✅ Tarea completada: ${plan.message || "OK"}`);
                done = true;
                break;
            }

            if (plan.action === "error") {
                log.push(`❌ Error: ${plan.message}`);
                break;
            }

            const actionResult = await this._executeAction(plan);
            log.push(`[${step}] ${plan.description || plan.action}: ${actionResult}`);

            // Small delay between actions
            await new Promise(r => setTimeout(r, plan.delay || 800));
        }

        if (!done && step >= MAX_STEPS) {
            log.push(`⚠ Límite de ${MAX_STEPS} pasos alcanzado`);
        }

        return log.join("\n");
    }

    /* =========================
       VISION AI — PLAN NEXT ACTION
    ========================= */

    async _planNextAction(task, screenshotPath, previousLog) {
        const imageData = fs.readFileSync(screenshotPath);
        const base64 = imageData.toString("base64");

        const systemPrompt = `Sos un agente de control de PC. Analizás capturas de pantalla y determinás la siguiente acción para completar una tarea.
Respondé ÚNICAMENTE con un JSON válido:
{"action": "click|type|key|scroll|done|error", "x": 123, "y": 456, "text": "texto a escribir", "keys": "ctrl+c", "scrollY": 3, "message": "descripción", "description": "qué hace esta acción", "delay": 500}

Acciones disponibles:
- click: clic en coordenadas x,y (incluí "button": "left"|"right"|"double")
- type: escribir texto en "text" (el foco ya debe estar en el campo)
- key: presionar combinación de teclas en "keys" (ej: "ctrl+v", "enter", "tab")
- scroll: scroll en y (scrollY positivo = abajo, negativo = arriba)
- done: tarea completada, incluí "message" con el resultado
- error: no es posible completar la tarea, incluí "message" con el motivo

La pantalla es 1920x1080 por defecto. Analizá los elementos visibles y su posición.`;

        const userPrompt = `Tarea a completar: ${task}

${previousLog.length > 0 ? `Acciones realizadas hasta ahora:\n${previousLog.slice(-5).join("\n")}\n\n` : ""}
Analizá la pantalla actual y decime cuál es la siguiente acción.`;

        try {
            if (this.visionProvider === "openai") {
                return await this._planWithOpenAI(systemPrompt, userPrompt, base64);
            } else {
                return await this._planWithClaude(systemPrompt, userPrompt, base64);
            }
        } catch (err) {
            logger.error(`ComputerBot vision error: ${err.message}`);
            return { action: "error", message: err.message };
        }
    }

    async _planWithClaude(systemPrompt, userPrompt, base64) {
        const response = await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
                model: "claude-opus-4-6",
                max_tokens: 500,
                system: systemPrompt,
                messages: [{
                    role: "user",
                    content: [
                        { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
                        { type: "text", text: userPrompt }
                    ]
                }]
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.visionKey,
                    "anthropic-version": "2023-06-01"
                },
                timeout: 30000
            }
        );

        const raw = response.data?.content?.[0]?.text || "";
        return this._parseActionJSON(raw);
    }

    async _planWithOpenAI(systemPrompt, userPrompt, base64) {
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o",
                max_tokens: 500,
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user", content: [
                            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
                            { type: "text", text: userPrompt }
                        ]
                    }
                ]
            },
            {
                headers: { "Authorization": `Bearer ${this.visionKey}`, "Content-Type": "application/json" },
                timeout: 30000
            }
        );

        const raw = response.data?.choices?.[0]?.message?.content || "";
        return this._parseActionJSON(raw);
    }

    _parseActionJSON(raw) {
        try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch { }
        return null;
    }

    /* =========================
       EXECUTE ACTION VIA PYTHON
    ========================= */

    async _executeAction(plan) {
        const script = this._buildPythonAction(plan);
        if (!script) return "Acción no reconocida";

        return new Promise((resolve) => {
            exec(`python -c "${script.replace(/"/g, '\\"')}"`, { timeout: 10000 }, (err, stdout, stderr) => {
                if (err) {
                    logger.warn(`ComputerBot action error: ${err.message}`);
                    resolve(`Error: ${err.message.substring(0, 100)}`);
                } else {
                    resolve(stdout.trim() || "OK");
                }
            });
        });
    }

    _buildPythonAction(plan) {
        switch (plan.action) {
            case "click":
                const button = plan.button === "right" ? "right" : "left";
                const clicks = plan.button === "double" ? 2 : 1;
                return `import pyautogui; pyautogui.click(${plan.x}, ${plan.y}, clicks=${clicks}, button='${button}'); print('clicked ${plan.x},${plan.y}')`;

            case "type":
                const safeText = (plan.text || "").replace(/'/g, "\\'");
                return `import pyautogui; import time; time.sleep(0.1); pyautogui.typewrite('${safeText}', interval=0.04); print('typed ${(plan.text || "").substring(0, 20)}')`;

            case "key":
                const keys = (plan.keys || "").split("+").map(k => k.trim().toLowerCase());
                if (keys.length === 1) {
                    return `import pyautogui; pyautogui.press('${keys[0]}'); print('pressed ${keys[0]}')`;
                } else {
                    const keyList = keys.map(k => `'${k}'`).join(", ");
                    return `import pyautogui; pyautogui.hotkey(${keyList}); print('hotkey ${plan.keys}')`;
                }

            case "scroll":
                return `import pyautogui; pyautogui.scroll(${plan.scrollY || 3}); print('scrolled ${plan.scrollY}')`;

            default:
                return null;
        }
    }

    /* =========================
       SCREENSHOT
    ========================= */

    async _screenshot() {
        const filePath = path.join(this.screenshotDir, `screen_${Date.now()}.png`);
        return new Promise((resolve) => {
            const script = `import pyautogui; from PIL import Image; img = pyautogui.screenshot(); img.save('${filePath.replace(/\\/g, "/")}'); print('${filePath.replace(/\\/g, "/")}')`;
            exec(`python -c "${script.replace(/"/g, '\\"')}"`, { timeout: 10000 }, (err, stdout) => {
                if (err || !stdout.trim()) { resolve(null); return; }
                resolve(stdout.trim());
            });
        });
    }

    /* =========================
       QUICK SCREENSHOT (for UI)
    ========================= */

    async takeScreenshot() {
        return await this._screenshot();
    }
}

module.exports = ComputerBot;