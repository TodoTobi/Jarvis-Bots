/**
 * VisionBot.js — Processes audio, PDF, and images using a vision-capable AI
 *
 * Requirements:
 *  - VISION_API_KEY in .env (Anthropic or OpenAI key)
 *  - VISION_PROVIDER=claude|openai (default: claude)
 *  - pip install openai-whisper (for local audio transcription, optional)
 *
 * Capabilities:
 *  - Describe/analyze images (jpg, png, webp)
 *  - Read and summarize PDFs
 *  - Transcribe audio files (via Whisper or external API)
 *  - Answer questions about uploaded content
 */

const Bot = require("./Bot");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const logger = require("../logs/logger");

class VisionBot extends Bot {
    constructor() {
        super("VisionBot", "Análisis de imágenes, PDFs y audio con IA visual");
        this.visionKey = process.env.VISION_API_KEY || "";
        this.visionProvider = process.env.VISION_PROVIDER || "claude";
        this.tmpDir = path.resolve(__dirname, "../../tmp");
        fs.mkdirSync(this.tmpDir, { recursive: true });
    }

    async run(parameters) {
        if (!this.visionKey) {
            return "⚠ Vision API key no configurada. Agregá VISION_API_KEY en Configuración → Avanzado.";
        }

        const { action, filePath, url, query, data, mimeType } = parameters;

        switch (action || "analyze") {
            case "analyze_image":
                return await this._analyzeImage(data || filePath || url, mimeType || "image/png", query);
            case "analyze_pdf":
                return await this._analyzePDF(data || filePath, query);
            case "transcribe_audio":
                return await this._transcribeAudio(data || filePath, mimeType || "audio/ogg");
            case "describe_screen":
                return await this._describeCurrentScreen(query);
            default:
                return await this._analyzeImage(data || filePath || url, mimeType || "image/jpeg", query || "Describí detalladamente esta imagen");
        }
    }

    /* =========================
       IMAGE ANALYSIS
    ========================= */

    async _analyzeImage(source, mimeType, query) {
        const safeQuery = query || "Describí detalladamente el contenido de esta imagen.";
        let base64;

        if (source?.startsWith("data:")) {
            base64 = source.split(",")[1];
        } else if (source && fs.existsSync(source)) {
            base64 = fs.readFileSync(source).toString("base64");
        } else if (source?.startsWith("http")) {
            const res = await axios.get(source, { responseType: "arraybuffer" });
            base64 = Buffer.from(res.data).toString("base64");
        } else {
            return "❌ No se proporcionó una imagen válida.";
        }

        logger.info(`VisionBot: analyzing image (${(base64.length / 1024).toFixed(0)}KB)`);

        if (this.visionProvider === "openai") {
            return await this._callOpenAIVision(base64, mimeType, safeQuery);
        }
        return await this._callClaudeVision(base64, mimeType, safeQuery);
    }

    async _callClaudeVision(base64, mimeType, query) {
        const response = await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
                model: "claude-opus-4-6",
                max_tokens: 1500,
                messages: [{
                    role: "user",
                    content: [
                        { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
                        { type: "text", text: query }
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
        return response.data?.content?.[0]?.text || "Sin respuesta";
    }

    async _callOpenAIVision(base64, mimeType, query) {
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o",
                max_tokens: 1500,
                messages: [{
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
                        { type: "text", text: query }
                    ]
                }]
            },
            {
                headers: { "Authorization": `Bearer ${this.visionKey}`, "Content-Type": "application/json" },
                timeout: 30000
            }
        );
        return response.data?.choices?.[0]?.message?.content || "Sin respuesta";
    }

    /* =========================
       PDF ANALYSIS
    ========================= */

    async _analyzePDF(source, query) {
        const safeQuery = query || "Resumí el contenido de este PDF.";
        let base64;

        if (source && fs.existsSync(source)) {
            base64 = fs.readFileSync(source).toString("base64");
        } else {
            return "❌ No se encontró el archivo PDF.";
        }

        logger.info(`VisionBot: analyzing PDF (${(base64.length / 1024).toFixed(0)}KB)`);

        if (this.visionProvider === "claude") {
            const response = await axios.post(
                "https://api.anthropic.com/v1/messages",
                {
                    model: "claude-opus-4-6",
                    max_tokens: 2000,
                    messages: [{
                        role: "user",
                        content: [
                            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
                            { type: "text", text: safeQuery }
                        ]
                    }]
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": this.visionKey,
                        "anthropic-version": "2023-06-01"
                    },
                    timeout: 60000
                }
            );
            return response.data?.content?.[0]?.text || "Sin respuesta";
        }

        // OpenAI doesn't support PDF directly — extract text via pdftotext as fallback
        try {
            const { execSync } = require("child_process");
            const tmpTxt = path.join(this.tmpDir, `pdf_${Date.now()}.txt`);
            const pdfPath = source;
            execSync(`pdftotext "${pdfPath}" "${tmpTxt}"`, { timeout: 15000 });
            const text = fs.readFileSync(tmpTxt, "utf-8").substring(0, 6000);
            fs.unlinkSync(tmpTxt);

            const res = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                    model: "gpt-4o", max_tokens: 2000,
                    messages: [
                        { role: "system", content: "Respondé preguntas sobre el texto del PDF." },
                        { role: "user", content: `${safeQuery}\n\nTexto del PDF:\n${text}` }
                    ]
                },
                { headers: { "Authorization": `Bearer ${this.visionKey}` }, timeout: 30000 }
            );
            return res.data?.choices?.[0]?.message?.content || "Sin respuesta";
        } catch {
            return "❌ No se pudo procesar el PDF con OpenAI. Instalá pdftotext o usá el proveedor Claude.";
        }
    }

    /* =========================
       AUDIO TRANSCRIPTION
    ========================= */

    async _transcribeAudio(source, mimeType) {
        logger.info("VisionBot: transcribing audio...");

        // Option A: local Whisper
        const whisperBin = process.env.WHISPER_CPP_PATH;
        const whisperModel = process.env.WHISPER_MODEL_PATH;

        if (whisperBin && whisperModel && fs.existsSync(whisperBin)) {
            try {
                const { execSync } = require("child_process");
                const out = execSync(
                    `"${whisperBin}" -m "${whisperModel}" -f "${source}" --language auto --output-txt 2>/dev/null`,
                    { timeout: 60000, encoding: "utf-8" }
                );
                return `📝 Transcripción:\n${out.trim()}`;
            } catch { }
        }

        // Option B: OpenAI Whisper API
        if (this.visionKey && this.visionProvider === "openai") {
            try {
                const FormData = require("form-data");
                const form = new FormData();
                form.append("file", fs.createReadStream(source));
                form.append("model", "whisper-1");
                form.append("language", "es");

                const res = await axios.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    form,
                    { headers: { "Authorization": `Bearer ${this.visionKey}`, ...form.getHeaders() }, timeout: 60000 }
                );
                return `📝 Transcripción:\n${res.data?.text || "Sin texto"}`;
            } catch (err) {
                logger.error(`VisionBot audio OpenAI: ${err.message}`);
            }
        }

        // Option C: Python Whisper
        try {
            const { execSync } = require("child_process");
            const out = execSync(
                `python -c "import whisper; m=whisper.load_model('base'); r=m.transcribe('${source.replace(/\\/g, "/")}',language='es'); print(r['text'])"`,
                { timeout: 90000, encoding: "utf-8" }
            );
            return `📝 Transcripción:\n${out.trim()}`;
        } catch { }

        return "❌ No se pudo transcribir el audio. Instalá Whisper (pip install openai-whisper) o configurá OpenAI API.";
    }

    /* =========================
       DESCRIBE CURRENT SCREEN
    ========================= */

    async _describeCurrentScreen(query) {
        const { exec } = require("child_process");
        const screenshotPath = path.join(this.tmpDir, `screen_${Date.now()}.png`);

        await new Promise((resolve, reject) => {
            const script = `import pyautogui; img=pyautogui.screenshot(); img.save('${screenshotPath.replace(/\\/g, "/")}')`;
            exec(`python -c "${script.replace(/"/g, '\\"')}"`, (err) => err ? reject(err) : resolve());
        });

        const result = await this._analyzeImage(screenshotPath, "image/png",
            query || "Describí qué está pasando en la pantalla en este momento.");

        try { fs.unlinkSync(screenshotPath); } catch { }
        return result;
    }
}

module.exports = VisionBot;