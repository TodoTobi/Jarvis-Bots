# Jarvis-Bots Project Tree

Documento generado el 2026-05-21.

Este mapa describe como esta conformado el proyecto a nivel web, backend,
automatizaciones locales y archivos de contexto. No incluye carpetas generadas
como `node_modules/`, `build/`, `.git/`, logs ni caches.

Mapa relacionado: [web-navigation-tree.md](web-navigation-tree.md), con el
arbol preliminar de paginas, secciones y navegacion de la plataforma.

## Vista general

```text
Jarvis-Bots/
|-- package.json                  # Dependencias raiz puntuales
|-- package-lock.json
|-- readme.md
|-- Jarvis guia.pdf               # Guia/documentacion externa
|-- md/                           # Memoria e instrucciones del asistente
|-- bats/                         # Scripts .bat ejecutables por BatBot
|-- backend/                      # API Express + bots + servicios
|-- frontend/                     # App React
|-- screenshots/                  # Salidas generadas/capturas
|-- skills/                       # Skills locales del proyecto
`-- tmp/                          # Archivos temporales/logs de ejecucion
```

## Arbol principal

```text
Jarvis-Bots/
|-- md/
|   |-- identity.md               # Identidad/base del asistente
|   |-- soul.md                   # Personalidad/tono
|   |-- user.md                   # Datos/preferencias del usuario
|   |-- tools.md                  # Herramientas disponibles
|   |-- bots.md                   # Descripcion de bots
|   |-- memory.md                 # Memoria acumulada
|   |-- heartbeat.md
|   `-- bootstrap.md
|
|-- bats/
|   |-- net/
|   |   |-- adb_tv_youtube.bat
|   |   `-- adb_volume.bat
|   `-- pc/
|       |-- apps/                 # Abrir apps: navegador, Discord, Cursor, etc.
|       |-- media/                # YouTube, Spotify, VLC, volumen, media keys
|       `-- system/               # Bloqueo, captura, sleep, reinicios
|
|-- backend/
|   |-- server.js                 # Entrada de Express, CORS y montaje de rutas
|   |-- package.json              # Scripts backend: start/dev
|   |-- config/
|   |   |-- .env                  # Config local sensible, no documentar valores
|   |   |-- devices.json          # Dispositivos controlables
|   |   `-- bat_whitelist.json    # Scripts .bat permitidos para ejecutar
|   |-- routes/
|   |   |-- chatRoutes.js
|   |   |-- botRoutes.js
|   |   |-- deviceRoutes.js
|   |   |-- mdRoutes.js
|   |   |-- doctorRoutes.js
|   |   |-- historyRoutes.js
|   |   |-- sttGemmaRoutes.js
|   |   |-- selfAwarenessRoutes.js
|   |   |-- whatsappRoutes.js
|   |   |-- restartRoutes.js
|   |   |-- uploadRoutes.js
|   |   |-- healthRoutes.js
|   |   |-- geminiRoutes.js
|   |   `-- sttRoutes.js
|   |-- controllers/
|   |   |-- chatController.js
|   |   `-- deviceController.js
|   |-- bots/
|   |   |-- Bot.js                # Base comun
|   |   |-- BotManager.js         # Router central de intents hacia bots
|   |   |-- WebBot.js
|   |   |-- BatBot.js
|   |   |-- MediaBot.js
|   |   |-- NetBot.js
|   |   |-- ComputerBot.js
|   |   |-- VisionBot.js
|   |   |-- SearchBot.js
|   |   |-- DriveBot.js
|   |   |-- TerminalBot.js
|   |   |-- DoctorBot.js
|   |   |-- GoogleDocsBot.js
|   |   `-- WhatsAppBot.js
|   |-- services/
|   |   |-- ModelService.js       # Conexion a LM Studio/modelo local
|   |   |-- SupabaseService.js    # Historial persistente opcional
|   |   |-- NLPService.js
|   |   `-- LanguageAliases.js
|   |-- middlewares/
|   |   `-- messageClassifier.js  # Clasifica respuestas/artifacts/acciones
|   |-- utils/
|   |   |-- InstructionLoader.js  # Carga md/ y arma contexto para el modelo
|   |   |-- pdfExtractor.js
|   |   `-- mermaidSanitizer.js
|   |-- skills/
|   |   `-- SkillLoader.js
|   |-- logs/                     # Logs runtime
|   `-- .wwebjs_cache/            # Cache WhatsApp Web
|
`-- frontend/
    |-- package.json              # Scripts frontend: start/build/test
    |-- public/
    |   |-- index.html            # HTML raiz
    |   |-- manifest.json
    |   |-- robots.txt
    |   |-- favicon.ico
    |   |-- logo192.png
    |   `-- logo512.png
    `-- src/
        |-- index.js              # Monta React y ErrorBoundary
        |-- App.jsx               # Layout, navegacion y WakeWord global
        |-- api.js                # Cliente fetch hacia backend localhost:3001
        |-- App.css
        |-- index.css
        |-- Sidebar.jsx
        |-- Dashboard.jsx
        |-- Chat.jsx
        |-- BotsPage.jsx
        |-- BotsPanel.jsx
        |-- DevicesPage.jsx
        |-- InstructionsPage.jsx
        |-- SettingsPage.jsx
        |-- DoctorPage.jsx
        |-- WakeWord.jsx
        |-- VoiceRecorder.jsx
        |-- WhatsAppQR.jsx
        `-- ArtifactCanvas.jsx
```

## Arquitectura web

```text
Browser
  |
  | http://localhost:3000
  v
frontend/public/index.html
  |
  v
frontend/src/index.js
  |
  v
ErrorBoundary
  |
  v
App.jsx
  |-- Sidebar.jsx
  |-- Dashboard.jsx
  |-- Chat.jsx
  |-- BotsPage.jsx / BotsPanel.jsx
  |-- DevicesPage.jsx
  |-- InstructionsPage.jsx
  |-- SettingsPage.jsx
  |-- DoctorPage.jsx
  |-- WakeWord.jsx
  `-- ArtifactCanvas.jsx
```

`App.jsx` no usa React Router. Maneja la navegacion con un estado local llamado
`view`. Segun ese estado renderiza `dashboard`, `chat`, `bots`, `devices`,
`instructions`, `settings` o `doctor`.

`WakeWord.jsx` esta montado a nivel raiz, por eso puede escuchar desde cualquier
vista. Si detecta un comando, `App.jsx` navega al chat o manda el mensaje al
chat activo.

## Flujo principal de chat

```text
Usuario escribe o habla
  |
  v
frontend/src/Chat.jsx / WakeWord.jsx
  |
  v
frontend/src/api.js
  |
  | POST http://localhost:3001/api/chat
  v
backend/routes/chatRoutes.js
  |
  v
backend/controllers/chatController.js
  |
  |-- InstructionLoader.buildFullContext()
  |-- ModelService.generateIntent()
  |-- BotManager.executeIntent()
  |-- messageClassifier.classify()
  `-- SupabaseService guarda historial si esta configurado
  |
  v
Respuesta JSON al frontend
  |
  v
Chat.jsx renderiza texto, codigo, artifacts o acciones
```

## Backend API

El backend arranca desde `backend/server.js` y escucha por defecto en:

```text
http://localhost:3001
```

Rutas principales montadas bajo `/api`:

```text
POST /api/chat
GET  /api/health

GET  /api/bots
POST /api/bot/:name/activate
POST /api/bot/:name/deactivate
GET  /api/scripts
POST /api/script/run

GET  /api/devices
GET  /api/devices/reload
GET  /api/device/:deviceId/ping
POST /api/device/:deviceId/command

GET  /api/md
GET  /api/md/:key
PUT  /api/md/:key
GET  /api/settings
POST /api/settings
GET  /api/bats
PUT  /api/bats
PUT  /api/whitelist

GET  /api/history/status
GET  /api/history/projects
POST /api/history/projects
PUT  /api/history/projects/:id
DELETE /api/history/projects/:id
POST /api/history/projects/reorder
GET  /api/history/conversations
POST /api/history/conversations
PUT  /api/history/conversations/:id
DELETE /api/history/conversations/:id
GET  /api/history/conversations/:id/messages

GET  /api/doctor/scan
POST /api/doctor/fix
POST /api/doctor/fix-all

GET  /api/self/tree
POST /api/self/read
GET  /api/self/architecture
POST /api/self/explain
POST /api/self/search-code

GET  /api/stt/status
POST /api/stt/transcribe
GET  /api/gemma/status
POST /api/gemma/analyze
POST /api/gemma/canvas
POST /api/gemma/chat
POST /api/gemma/self-diagnose
POST /api/terminal/exec

GET  /api/whatsapp/qr
GET  /api/whatsapp/status
POST /api/whatsapp/disconnect

POST /api/upload
POST /api/system/restart-backend
POST /api/system/restart-frontend
GET  /api/system/restart-status
```

## Bots y responsabilidades

```text
BotManager.js
|-- WebBot         # Conversacion/respuestas generales
|-- BatBot         # Ejecuta scripts permitidos en bats/
|-- MediaBot       # Acciones multimedia apoyadas en BatBot
|-- NetBot         # Dispositivos/red/ADB
|-- ComputerBot    # Control del PC con vision/automatizacion
|-- VisionBot      # Imagenes/PDFs/vision
|-- SearchBot      # Busqueda web
|-- DriveBot       # Archivos locales/Google Drive Sync
|-- TerminalBot    # Comandos, scripts e instalaciones
|-- DoctorBot      # Diagnostico y reparaciones
|-- GoogleDocsBot  # Integracion opcional con Google Docs
`-- WhatsAppBot    # WhatsApp Web
```

El flujo es:

```text
mensaje -> ModelService genera intent -> BotManager decide bot -> bot.run()
```

`ModelService.js` primero aplica reglas rapidas por texto. Si no encuentra una,
consulta el modelo local configurado por `.env` (`LM_API_URL`, `LM_MODEL`, etc.).

## Automatizaciones BAT

`bats/` contiene scripts locales de Windows. No se ejecutan libremente: `BatBot`
lee `backend/config/bat_whitelist.json` y solo expone scripts registrados ahi.

Categorias visibles:

```text
bats/pc/apps/      # abrir apps
bats/pc/media/     # multimedia y volumen
bats/pc/system/    # acciones del sistema
bats/net/          # ADB / red
```

## Archivos de contexto

La carpeta `md/` funciona como memoria e instrucciones para el asistente. El
backend la carga con `InstructionLoader.js` y arma el contexto que se manda al
modelo.

```text
identity.md   -> quien es Jarvis
soul.md       -> estilo/persona
user.md       -> datos del usuario
tools.md      -> herramientas disponibles
bots.md       -> bots y capacidades
memory.md     -> memoria acumulada
bootstrap.md  -> arranque/contexto base
heartbeat.md  -> estado/latido
```

## Frontend API client

`frontend/src/api.js` apunta fijo a:

```js
const API_URL = "http://localhost:3001";
```

Funciones exportadas:

```text
sendMessageToBot()
saveMemory()
getMemories()
deleteMemory()
getBots()
activateBot()
deactivateBot()
getScripts()
runScript()
getDevices()
pingDevice()
sendDeviceCommand()
```

Nota: `api.js` declara endpoints `/api/memory`, pero en el backend actual no vi
una ruta dedicada `/api/memory`. La memoria real parece gestionarse mediante
`md/memory.md` e `InstructionLoader.appendToMemory()`.

## Como correr

Frontend:

```powershell
cd frontend
npm install
npm start
```

URL:

```text
http://localhost:3000
```

Backend:

```powershell
cd backend
npm install
npm start
```

URL:

```text
http://localhost:3001
```

## Observaciones tecnicas

- El proyecto tiene dos `package.json`: uno raiz muy chico y uno por cada app
  principal (`frontend/` y `backend/`).
- `frontend/` es Create React App (`react-scripts`).
- `backend/` es CommonJS + Express.
- `.env` vive en `backend/config/.env` y no deberia compartirse porque contiene
  configuracion sensible.
- El `.gitignore` raiz tiene una entrada Windows con barras invertidas:
  `backend\node_modules\`. Algunas herramientas como `rg` la interpretan como
  glob invalido. Conviene dejar solo `backend/node_modules/`.
