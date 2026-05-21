# SISTEMA — Listener Nativo

Proceso de escucha pasiva que corre **fuera del browser**, independiente del
frontend. Detecta el wake word, transcribe el comando y lo envía al backend
via HTTP.

## Requisitos

- Python 3.8+
- Micrófono conectado y funcionando en Windows
- Backend corriendo en `http://localhost:3001`

---

## Instalación

```powershell
# Opción 1: script automático (recomendado)
cd listener
install.bat

# Opción 2: manual
pip install SpeechRecognition==3.10.4 python-dotenv==1.0.1
pip install pyaudio==0.2.14
```

### Si pyaudio falla en Windows

```powershell
pip install pipwin
pipwin install pyaudio
```

---

## Cómo arrancarlo

```powershell
# Opción 1: desde listener/
cd listener
start_listener.bat

# Opción 2: desde bats/pc/system/
bats\pc\system\start_listener.bat

# Opción 3: directo con Python
python listener/listener.py
```

La ventana muestra los logs en tiempo real. **Cerrarla detiene el listener.**

---

## Cómo testearlo antes de integrarlo con el backend

```powershell
cd listener

# Test completo (todos los componentes)
python test_listener.py

# Solo verificar que el micrófono funciona
python test_listener.py mic

# Solo verificar la lógica de wake words (sin micrófono)
python test_listener.py wakeword

# Test de transcripción en vivo (5 segundos)
python test_listener.py stt

# Verificar si el backend está levantado
python test_listener.py backend
```

El test de wake words **no requiere micrófono ni backend** — es puro lógica.
Es el primer test que hay que correr para verificar que la instalación es
correcta.

---

## Configuración en `.env`

Agregar estas variables en `backend/config/.env`:

```env
# Wake words separadas por coma (si no se define, usa los defaults)
WAKE_WORDS=sistema,hey sistema,oye sistema,eh sistema,system,hey system,ok sistema,escúchame,escuchame,jarvis

# URLs (defaults si no se configuran)
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000

# Timeouts en segundos
LISTENER_TIMEOUT=5
LISTENER_COMMAND_TIMEOUT=8

# Sensibilidad del micrófono (más alto = menos sensible)
LISTENER_ENERGY_THRESHOLD=300
```

---

## Flujo de funcionamiento

```
Micrófono activo (siempre)
    │
    ▼
Captura fragmento de audio (hasta 10s o silencio)
    │
    ▼
Transcribe con Groq (si hay API key) o Google STT (gratuito)
    │
    ▼
¿Contiene wake word?
    │
    ├── NO → volver a escuchar
    │
    └── SÍ
        │
        ├── ¿El comando viene en el mismo fragmento?
        │       ├── SÍ → usar ese comando
        │       └── NO → escuchar siguiente fragmento (8s timeout)
        │
        ▼
        ¿Frontend abierto?
            ├── NO → abrirlo en el browser default
            └── SÍ → continuar
        │
        ▼
        POST http://localhost:3001/api/chat
        { message: "...", source: "listener" }
        │
        ▼
        Loggear respuesta → volver a escuchar
```

---

## Transcripción: Groq vs Google STT

| | Groq Whisper | Google STT |
|---|---|---|
| Requiere internet | Sí | Sí |
| Requiere API key | Sí (`GROQ_API_KEY`) | No |
| Calidad | Alta | Media-alta |
| Latencia | ~0.5s | ~1-2s |
| Costo | Free tier generoso | Gratuito con límites |

El listener usa **Groq si hay API key** configurada, y cae a Google STT como
fallback automático. El `GROQ_API_KEY` ya debería estar en `.env` si STT
estaba funcionando en el frontend.

---

## Integración con el backend (opcional)

Para que el backend arranque el listener automáticamente, agregar en
`backend/server.js` después de que el servidor levanta:

```js
const { spawn } = require('child_process');
const path = require('path');

function startListener() {
  const listenerPath = path.join(__dirname, '..', 'listener', 'listener.py');
  const fs = require('fs');

  if (!fs.existsSync(listenerPath)) {
    console.log('[server] listener.py no encontrado, saltando auto-start.');
    return;
  }

  const proc = spawn('python', [listenerPath], {
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
  console.log('[server] Listener nativo iniciado en background.');
}

// Llamar después de app.listen(...)
startListener();
```

> **Nota**: el spawn con `detached: true` + `proc.unref()` hace que el
> listener sobreviva si el backend se reinicia. Para detenerlo hay que
> cerrar la ventana del listener o matar el proceso Python manualmente.

---

## Troubleshooting

**"No Default Input Device Available"**
→ Windows no reconoce el micrófono. Ir a Configuración → Sistema → Sonido →
Entrada y verificar que haya un dispositivo seleccionado.

**pyaudio falla al instalar**
→ Ver sección de instalación de pyaudio arriba.

**El listener transcribe pero no envía al backend**
→ Verificar que el backend esté corriendo: `python test_listener.py backend`

**El wake word no se detecta**
→ Correr `python test_listener.py stt` y ver qué transcribe exactamente.
Agregar la variante que usa a `WAKE_WORDS` en `.env`.

**Alta latencia (> 3s)**
→ Verificar conexión a internet (necesaria para STT).
→ Si tenés `GROQ_API_KEY` configurada, Groq debería dar ~0.5s de latencia.