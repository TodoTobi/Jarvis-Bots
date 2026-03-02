/**
 * google_auth.js — Autorizar Google OAuth2 (ejecutar UNA SOLA VEZ)
 * 
 * Uso: node scripts/google_auth.js
 * 
 * Genera backend/config/google_token.json que usa GoogleDocsBot
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const CREDENTIALS_PATH = path.resolve(__dirname, "../config/google_credentials.json");
const TOKEN_PATH = path.resolve(__dirname, "../config/google_token.json");
const SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
];

async function main() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error(`❌ No encontré credenciales en: ${CREDENTIALS_PATH}`);
        console.error("Descargá el archivo OAuth2 de Google Cloud Console y guardalo ahí.");
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES });
    console.log("\n🔗 Abrí esta URL en el navegador:\n");
    console.log(authUrl);
    console.log("\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("📋 Pegá el código de autorización aquí: ", async (code) => {
        rl.close();
        try {
            const { tokens } = await oAuth2Client.getToken(code.trim());
            fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log(`\n✅ Token guardado en: ${TOKEN_PATH}`);
            console.log("Ya podés usar GoogleDocsBot en Jarvis.");
        } catch (err) {
            console.error(`❌ Error al obtener token: ${err.message}`);
        }
    });
}

main();