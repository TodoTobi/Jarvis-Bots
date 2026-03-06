/**
 * get-google-token.js
 * ─────────────────────────────────────────────────────────
 * Ejecutá este script UNA SOLA VEZ para obtener el refresh token
 * de Google Drive para tv286206@gmail.com
 *
 * USO:
 *   1. Abrí https://console.cloud.google.com
 *   2. Creá un proyecto o usá uno existente
 *   3. Habilitá "Google Drive API"
 *   4. Creá credenciales → OAuth 2.0 Client ID → Desktop App
 *   5. Bajá el JSON y copiá client_id y client_secret abajo
 *   6. Ejecutá: node get-google-token.js
 *   7. Abrí la URL que aparece, autorizá, copiá el código
 *   8. Pegá el código cuando te lo pida
 *   9. Copiá el refresh_token al .env
 * ─────────────────────────────────────────────────────────
 */

const { google } = require("googleapis");
const readline = require("readline");

// ══════════════════════════════════════════════════════════
//  COMPLETAR CON TUS CREDENCIALES DE GOOGLE CLOUD CONSOLE
// ══════════════════════════════════════════════════════════
const CLIENT_ID = "184803951883-5taj8gq5s1jfmujnpp2uqqp86g9joc1d.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"; // Desktop app
// ══════════════════════════════════════════════════════════

async function main() {
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

    // Scopes necesarios: Drive (leer + escribir)
    const scopes = [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
    ];

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent", // fuerza nuevo refresh token
    });

    console.log("\n══════════════════════════════════════════════");
    console.log("  PASO 1: Abrí esta URL en tu navegador:");
    console.log("══════════════════════════════════════════════");
    console.log("\n" + authUrl + "\n");
    console.log("══════════════════════════════════════════════");
    console.log("  PASO 2: Autorizá con tv286206@gmail.com");
    console.log("  PASO 3: Copiá el código que aparece");
    console.log("══════════════════════════════════════════════\n");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question("Pegá el código aquí: ", async (code) => {
        rl.close();
        try {
            const { tokens } = await oauth2Client.getToken(code.trim());
            console.log("\n══════════════════════════════════════════════");
            console.log("  ✅ TOKEN OBTENIDO — Copiá al .env:");
            console.log("══════════════════════════════════════════════\n");
            console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
            console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
            console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log("\n══════════════════════════════════════════════");
            console.log("  Ahora podés usar 'subi [ruta]' desde WhatsApp");
            console.log("══════════════════════════════════════════════\n");
        } catch (e) {
            console.error("❌ Error:", e.message);
            console.log("\nVerificá que el CLIENT_ID y CLIENT_SECRET sean correctos.");
        }
    });
}

main().catch(console.error);