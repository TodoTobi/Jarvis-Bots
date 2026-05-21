# Arbol web preliminar

Documento preliminar para representar paginas principales, relacion entre
secciones y navegacion general/especifica de la plataforma Jarvis AI.

## Modelo de navegacion

La app no usa rutas URL por pagina. La navegacion depende del estado `view` en
`frontend/src/App.jsx`:

```text
App.jsx
|-- view = dashboard      -> Dashboard.jsx
|-- view = chat           -> Chat.jsx
|-- view = bots           -> BotsPage.jsx
|-- view = devices        -> DevicesPage.jsx
|-- view = doctor         -> DoctorPage.jsx
|-- view = instructions   -> InstructionsPage.jsx
`-- view = settings       -> SettingsPage.jsx
```

La navegacion visible vive principalmente en `Sidebar.jsx`. El usuario no cambia
de URL: cambia de vista dentro del layout principal.

## Arbol general

```text
Jarvis AI Web App
|-- Shell global
|   |-- Sidebar
|   |   |-- Logo / estado de sistema
|   |   |-- Navegacion principal
|   |   |   |-- Dashboard
|   |   |   |-- Bots
|   |   |   `-- Dispositivos
|   |   |-- Nueva Conversacion
|   |   |-- Proyectos
|   |   |   |-- Crear proyecto
|   |   |   |-- Renombrar proyecto
|   |   |   |-- Eliminar proyecto
|   |   |   |-- Expandir proyecto
|   |   |   `-- Conversaciones dentro del proyecto
|   |   |-- Historial de conversaciones
|   |   |   |-- Hoy
|   |   |   |-- Ayer
|   |   |   |-- Ultimos 7 dias
|   |   |   |-- Ultimos 30 dias
|   |   |   `-- Anteriores
|   |   `-- Sistema
|   |       |-- DoctorBot
|   |       |-- Instrucciones
|   |       `-- Configuracion
|   |
|   |-- Area principal
|   |   |-- Dashboard
|   |   |-- Chat
|   |   |-- Bots
|   |   |-- Dispositivos
|   |   |-- DoctorBot
|   |   |-- Instrucciones
|   |   `-- Configuracion
|   |
|   |-- WakeWord global
|   |   |-- Estado idle
|   |   |-- Estado listening
|   |   |-- Estado processing
|   |   `-- Navegacion automatica al Chat
|   |
|   `-- Overlays / modales globales
|       |-- Canvas de artifacts
|       |-- Modal de fix-all DoctorBot
|       `-- Indicador flotante de Jarvis activo
```

## Paginas principales

```text
Dashboard
|-- Header de marca Jarvis AI
|-- CTA: Abrir Chat
|-- Estadisticas
|   |-- Bots activos
|   |-- Ejecutando
|   |-- Errores
|   `-- Ejecuciones
|-- Estado del sistema
|   |-- Backend
|   |-- LM Studio
|   |-- WhatsApp
|   `-- Supabase
|-- Comandos rapidos
|   |-- Subir volumen
|   |-- Bajar volumen
|   |-- Pausar musica
|   |-- YouTube PC
|   |-- Bloquear PC
|   |-- Screenshot
|   |-- Discord
|   `-- Modo nocturno
|-- Reiniciar servicios
|   |-- Reiniciar Backend
|   `-- Reiniciar Frontend
`-- Estado de bots
    |-- Cards resumidas
    |-- Toggle de bot
    `-- Link: Ver todos -> Bots
```

```text
Chat
|-- Header
|   |-- Nombre Jarvis
|   |-- Modelo / backend
|   |-- ID conversacion
|   `-- Contador de mensajes
|-- Historial de mensajes
|   |-- Mensajes de usuario
|   |-- Mensajes de asistente
|   |-- Errores
|   |-- Indicador thinking
|   `-- Render de markdown/codigo
|-- Artifacts
|   |-- Mermaid
|   |-- HTML
|   |-- SVG
|   |-- JavaScript / codigo
|   `-- Modal fullscreen canvas
|-- Input
|   |-- Upload imagen/PDF
|   |-- Grabador de audio
|   |-- Toggle wake word
|   |-- Textarea
|   `-- Enviar
`-- Flujos especiales
    |-- Guardar memoria
    |-- Cargar historial existente
    |-- Crear nueva conversacion
    |-- Transcribir audio
    `-- Analizar archivo
```

```text
Bots
|-- Header Bot Management
`-- Panel de bots
    |-- Card por bot
    |   |-- Nombre
    |   |-- Descripcion/rol
    |   |-- Estado: activo/inactivo/trabajando/error
    |   |-- Ultima ejecucion
    |   |-- Contador de ejecuciones
    |   |-- Ultimo error
    |   `-- Toggle activar/desactivar
    `-- Auto-refresh cada pocos segundos
```

```text
Dispositivos
|-- Header Dispositivos en Red
|-- Estado sin dispositivos
|   `-- Mensaje para editar backend/config/devices.json
`-- Cards de dispositivos
    |-- Nombre
    |-- Tipo
    |-- IP
    |-- Ping
    |-- Resultado de ping
    |-- Busqueda YouTube para Android TV/phone
    `-- Acciones rapidas
        |-- Inicio
        |-- Volver
        |-- Despertar
        `-- Screenshot
```

```text
DoctorBot
|-- Header
|-- Resumen de salud
|   |-- Porcentaje de salud
|   |-- OK
|   |-- Avisos
|   |-- Errores
|-- Acciones
|   |-- Reiniciar Backend
|   |-- Reiniciar Frontend
|   |-- Escanear
|   `-- Solucionar Todo
|-- Animacion de escaneo
|-- Resultados por categoria
|   |-- Modelo IA
|   |-- Dependencias npm
|   |-- Variables .env
|   |-- Archivos del sistema
|   |-- Estado de Bots
|   |-- Errores recientes
|   |-- Android ADB
|   `-- Supabase
|-- Check individual
|   |-- Estado
|   |-- Detalle
|   |-- Archivo/linea
|   `-- Aplicar Fix
`-- Modal resultado Fix-All
```

```text
Instrucciones
|-- Header Instrucciones del Modelo
|-- Lista de archivos md
|   |-- identity.md
|   |-- soul.md
|   |-- user.md
|   |-- bots.md
|   |-- tools.md
|   |-- memory.md
|   |-- heartbeat.md
|   `-- bootstrap.md
`-- Editor
    |-- Estado sin seleccion
    |-- Toolbar de archivo seleccionado
    |-- Indicador sin guardar
    |-- Guardado
    |-- Descartar cambios
    |-- Guardar
    `-- Textarea de contenido
```

```text
Configuracion
|-- Header
|   |-- Modo Simple
|   |-- Modo Avanzado
|   `-- Guardar
|-- Tabs
|   |-- Modelo IA
|   |   |-- Proveedor
|   |   |-- URL del servidor
|   |   |-- API key
|   |   |-- Nombre del modelo
|   |   `-- Probar conexion
|   |-- WhatsApp
|   |   |-- Estado WhatsAppQR
|   |   |-- Conectar WhatsApp
|   |   |-- QR
|   |   |-- Desconectar
|   |   |-- Numero autorizado
|   |   `-- Debug mode
|   |-- Voz STT
|   |   |-- Groq API key
|   |   |-- Verificar STT
|   |   `-- Instrucciones de microfono
|   |-- Vision & Control
|   |   |-- Vision API key
|   |   |-- Proveedor Vision
|   |   `-- Control del PC
|   |-- Scripts .bat
|   |   |-- Ruta
|   |   |-- Clave whitelist
|   |   |-- Etiqueta
|   |   |-- Descripcion
|   |   |-- Categoria
|   |   |-- Contenido .bat
|   |   `-- Crear Script
|   `-- General
|       `-- Puerto del backend
```

## Navegacion general

```text
Entrada a la app
  -> Dashboard
      -> Abrir Chat
      -> Ver todos los bots
      -> Ejecutar comando rapido
      -> Reiniciar servicios

Sidebar
  -> Dashboard
  -> Bots
  -> Dispositivos
  -> Nueva Conversacion -> Chat
  -> Conversacion existente -> Chat
  -> Proyecto -> Conversaciones del proyecto -> Chat
  -> DoctorBot
  -> Instrucciones
  -> Configuracion

WakeWord global
  -> Detecta "Jarvis ..."
  -> Si el usuario esta en Chat: envia comando al chat actual
  -> Si el usuario esta en otra vista: abre Chat y envia el comando
```

## Navegacion especifica por flujo

```text
Crear conversacion
  Sidebar: Nueva Conversacion
  -> crea/abre Chat
  -> usuario envia mensaje
  -> backend responde
  -> si Supabase esta activo, se guarda historial
```

```text
Abrir conversacion existente
  Sidebar: Historial o Proyecto
  -> selecciona conversacion
  -> Chat carga mensajes desde /api/history/conversations/:id/messages
  -> usuario continua la conversacion
```

```text
Organizar conversaciones
  Sidebar: Proyectos
  -> crear proyecto
  -> arrastrar conversacion a proyecto
  -> expandir proyecto
  -> seleccionar conversacion
```

```text
Ejecutar accion rapida
  Dashboard: Comandos rapidos
  -> POST /api/chat
  -> ModelService clasifica intent
  -> BotManager ejecuta bot correspondiente
  -> feedback visual en Dashboard
```

```text
Controlar dispositivo
  Sidebar: Dispositivos
  -> seleccionar card de dispositivo
  -> Ping o accion rapida
  -> /api/device/:deviceId/command
  -> NetBot/ADB ejecuta accion
```

```text
Configurar WhatsApp
  Sidebar: Configuracion
  -> Tab WhatsApp
  -> Conectar WhatsApp
  -> mostrar QR si no hay sesion
  -> estado conectado
  -> opcional: desconectar
```

```text
Editar instrucciones del modelo
  Sidebar: Instrucciones
  -> seleccionar archivo .md
  -> editar contenido
  -> guardar
  -> backend recarga InstructionLoader
  -> cambios impactan en proximos mensajes
```

```text
Diagnosticar sistema
  Sidebar: DoctorBot
  -> Escanear
  -> ver checks agrupados
  -> expandir check
  -> aplicar fix individual o fix-all
```

```text
Generar artifact desde Chat
  Chat
  -> usuario pide diagrama/interfaz/grafico
  -> backend devuelve bloque renderizable
  -> Chat detecta artifact
  -> abre canvas/modal
```

## Relacion frontend-backend por pagina

```text
Dashboard
|-- GET  /api/bots
|-- GET  /api/health
|-- GET  /api/health/model
|-- GET  /api/whatsapp/qr
|-- GET  /api/whatsapp/status
|-- GET  /api/history/status
|-- POST /api/chat
|-- POST /api/system/restart-backend
`-- POST /api/system/restart-frontend

Sidebar
|-- GET    /api/history/status
|-- GET    /api/history/conversations?all=true
|-- GET    /api/history/projects
|-- POST   /api/history/conversations
|-- PUT    /api/history/conversations/:id
|-- DELETE /api/history/conversations/:id
|-- POST   /api/history/projects
|-- PUT    /api/history/projects/:id
|-- DELETE /api/history/projects/:id
`-- POST   /api/history/projects/reorder

Chat
|-- POST /api/chat
|-- GET  /api/history/conversations/:id/messages
|-- POST /api/gemma/analyze
`-- POST /api/memory          # declarado en api.js, ruta backend no confirmada

Bots
|-- GET  /api/bots
|-- POST /api/bot/:name/activate
`-- POST /api/bot/:name/deactivate

Dispositivos
|-- GET  /api/devices
|-- GET  /api/device/:deviceId/ping
`-- POST /api/device/:deviceId/command

DoctorBot
|-- GET  /api/doctor/scan
|-- POST /api/doctor/fix
|-- POST /api/doctor/fix-all
|-- POST /api/system/restart-backend
`-- POST /api/system/restart-frontend

Instrucciones
|-- GET /api/md
`-- PUT /api/md/:key

Configuracion
|-- GET  /api/settings
|-- POST /api/settings
|-- GET  /api/whatsapp/qr
|-- POST /api/whatsapp/disconnect
|-- GET  /api/stt/status
|-- PUT  /api/bats
`-- PUT  /api/whitelist
```

## Observaciones preliminares

- El arbol es de vistas internas, no de rutas publicas tipo `/dashboard`.
- La Sidebar es el eje de navegacion persistente.
- Dashboard funciona como home operativo y panel de estado.
- Chat es la vista principal de trabajo.
- Configuracion concentra varias subpantallas mediante tabs.
- WhatsAppQR y ArtifactCanvas no son paginas principales: son componentes
  embebidos o modales.
- La navegacion por proyectos/conversaciones depende de Supabase. Si Supabase
  no esta conectado, el historial queda limitado/desactivado visualmente.
