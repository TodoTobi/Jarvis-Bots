# listener.py — Proceso de escucha pasiva nativa para SISTEMA
# Corre en background, independiente del browser.
# Detecta wake words, transcribe el comando y lo envía al backend via HTTP.

import os
import sys
import time
import json
import subprocess
import threading
import webbrowser
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from dotenv import dotenv_values

# ─── Dependencias de audio ────────────────────────────────────────────────────
try:
    import speech_recognition as sr
except ImportError:
    print("[SISTEMA] ERROR: speech_recognition no instalado.")
    print("  Ejecutá: pip install SpeechRecognition pyaudio")
    sys.exit(1)

# ─── Configuración ────────────────────────────────────────────────────────────

# Buscar .env en backend/config/.env relativo a la raíz del proyecto
# La raíz del proyecto es dos niveles arriba de listener/
SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENV_PATH     = PROJECT_ROOT / "backend" / "config" / ".env"

def load_config():
    """Carga configuración desde .env y variables de entorno."""
    config = {}
    if ENV_PATH.exists():
        config = dotenv_values(str(ENV_PATH))
    else:
        print(f"[SISTEMA] Aviso: .env no encontrado en {ENV_PATH}")
        print("[SISTEMA] Usando valores por defecto.")

    return {
        "backend_url": config.get("BACKEND_URL", "http://localhost:3001"),
        "frontend_url": config.get("FRONTEND_URL", "http://localhost:3000"),
        "groq_api_key": config.get("GROQ_API_KEY", ""),
        "wake_words": parse_wake_words(config.get("WAKE_WORDS", "")),
        "listen_timeout": int(config.get("LISTENER_TIMEOUT", "5")),
        "command_timeout": int(config.get("LISTENER_COMMAND_TIMEOUT", "8")),
        "energy_threshold": int(config.get("LISTENER_ENERGY_THRESHOLD", "300")),
        "use_groq": bool(config.get("GROQ_API_KEY", "")),
    }

DEFAULT_WAKE_WORDS = [
    "sistema",
    "hey sistema",
    "oye sistema",
    "eh sistema",
    "system",
    "hey system",
    "ok sistema",
    "escúchame",
    "escuchame",
    "jarvis",
]

def parse_wake_words(env_value: str) -> list:
    """Parsea WAKE_WORDS del .env. Si está vacío, usa los defaults."""
    if not env_value.strip():
        return DEFAULT_WAKE_WORDS
    words = [w.strip().lower() for w in env_value.split(",") if w.strip()]
    return words if words else DEFAULT_WAKE_WORDS


# ─── Estado global ────────────────────────────────────────────────────────────

class ListenerState:
    def __init__(self):
        self.running        = True
        self.web_open       = False
        self.processing     = False
        self.consecutive_errors = 0
        self.max_errors     = 10


# ─── Helpers de red ───────────────────────────────────────────────────────────

def is_backend_alive(backend_url: str) -> bool:
    """Chequea si el backend está respondiendo."""
    try:
        req = urllib.request.urlopen(f"{backend_url}/api/health", timeout=2)
        return req.status == 200
    except Exception:
        return False

def is_frontend_open(frontend_url: str) -> bool:
    """Chequea si el frontend está sirviendo."""
    try:
        req = urllib.request.urlopen(frontend_url, timeout=2)
        return req.status == 200
    except Exception:
        return False

def open_frontend(frontend_url: str):
    """Abre el frontend en el browser por defecto."""
    print(f"[SISTEMA] Abriendo frontend: {frontend_url}")
    webbrowser.open(frontend_url)
    time.sleep(2)  # Darle tiempo al browser para cargarse

def send_command(backend_url: str, command: str) -> bool:
    """
    Envía el comando al backend via POST /api/chat.
    Retorna True si el backend aceptó la petición.
    """
    payload = json.dumps({
        "message": command,
        "source": "listener",        # Para que el backend sepa que viene del listener nativo
        "conversationId": None,      # El backend abre una nueva o usa la activa
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{backend_url}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            reply = data.get("response") or data.get("message") or "(sin respuesta)"
            print(f"[SISTEMA] Respuesta: {reply[:120]}{'...' if len(reply) > 120 else ''}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[SISTEMA] Error HTTP {e.code} al enviar comando.")
        return False
    except Exception as e:
        print(f"[SISTEMA] Error al enviar comando: {e}")
        return False


# ─── Transcripción ───────────────────────────────────────────────────────────

def transcribe_with_groq(audio_data: sr.AudioData, api_key: str) -> str:
    """
    Transcribe audio usando Groq Whisper API.
    Devuelve el texto o cadena vacía si falla.
    """
    import tempfile
    import io

    wav_data = audio_data.get_wav_data()

    # Groq espera un archivo multipart/form-data
    boundary = "----SystemaBoundary"
    body_parts = []

    # Campo 'file'
    body_parts.append(f"--{boundary}".encode())
    body_parts.append(b'Content-Disposition: form-data; name="file"; filename="audio.wav"')
    body_parts.append(b"Content-Type: audio/wav")
    body_parts.append(b"")
    body_parts.append(wav_data)

    # Campo 'model'
    body_parts.append(f"--{boundary}".encode())
    body_parts.append(b'Content-Disposition: form-data; name="model"')
    body_parts.append(b"")
    body_parts.append(b"whisper-large-v3-turbo")

    # Campo 'language'
    body_parts.append(f"--{boundary}".encode())
    body_parts.append(b'Content-Disposition: form-data; name="language"')
    body_parts.append(b"")
    body_parts.append(b"es")

    body_parts.append(f"--{boundary}--".encode())

    body = b"\r\n".join(body_parts)

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("text", "").strip()
    except Exception as e:
        print(f"[SISTEMA] Error Groq STT: {e}")
        return ""

def transcribe_local(recognizer: sr.Recognizer, audio_data: sr.AudioData) -> str:
    """
    Transcripción offline usando Google Web Speech API (gratuita, sin key).
    Fallback cuando no hay Groq o cuando Groq falla.
    """
    try:
        return recognizer.recognize_google(audio_data, language="es-AR").strip()
    except sr.UnknownValueError:
        return ""
    except sr.RequestError as e:
        print(f"[SISTEMA] Error Google STT: {e}")
        return ""

def transcribe(recognizer: sr.Recognizer, audio_data: sr.AudioData, config: dict) -> str:
    """
    Intenta Groq primero si hay API key. Fallback a Google STT.
    """
    if config["use_groq"] and config["groq_api_key"]:
        text = transcribe_with_groq(audio_data, config["groq_api_key"])
        if text:
            return text
        print("[SISTEMA] Groq falló, usando Google STT como fallback.")
    return transcribe_local(recognizer, audio_data)


# ─── Lógica de wake word ──────────────────────────────────────────────────────

def check_wake_word(text: str, wake_words: list) -> tuple:
    """
    Chequea si el texto contiene algún wake word.

    Retorna (matched: bool, command: str)
    - Si el texto ES solo el wake word → command = "" (esperar siguiente fragmento)
    - Si el texto EMPIEZA con wake word y hay más → command = lo que viene después
    - Si no matchea → (False, "")
    """
    text_lower = text.lower().strip()

    for ww in wake_words:
        ww_lower = ww.lower()

        # Match exacto — solo el wake word
        if text_lower == ww_lower:
            return (True, "")

        # Empieza con el wake word seguido de espacio
        if text_lower.startswith(ww_lower + " "):
            command = text[len(ww):].strip()
            return (True, command)

        # El wake word está contenido (ej: "oye sistema abrí YouTube")
        # solo si está al principio o precedido por muy poco texto
        idx = text_lower.find(ww_lower)
        if idx != -1 and idx <= 4:  # máximo 4 chars antes (ej: "eh, ")
            command = text[idx + len(ww):].strip()
            return (True, command)

    return (False, "")


# ─── Loop principal ───────────────────────────────────────────────────────────

def listen_loop(config: dict, state: ListenerState):
    """
    Loop de escucha continua. Corre en el hilo principal.
    """
    recognizer = sr.Recognizer()
    recognizer.energy_threshold        = config["energy_threshold"]
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold          = 0.8   # segundos de silencio para cortar frase

    wake_words   = config["wake_words"]
    backend_url  = config["backend_url"]
    frontend_url = config["frontend_url"]

    print(f"[SISTEMA] Wake words configuradas: {wake_words}")
    print(f"[SISTEMA] Backend: {backend_url}")
    print(f"[SISTEMA] Frontend: {frontend_url}")
    print("[SISTEMA] Escucha pasiva activa. Esperando wake word...\n")

    mic = sr.Microphone()

    # Calibrar ruido ambiente una vez al inicio
    with mic as source:
        print("[SISTEMA] Calibrando ruido ambiente (2s)...")
        recognizer.adjust_for_ambient_noise(source, duration=2)
        print(f"[SISTEMA] Threshold de energía: {recognizer.energy_threshold:.0f}")
        print("[SISTEMA] Listo.\n")

    while state.running:
        try:
            # ── 1. Capturar fragmento de audio ──
            with mic as source:
                try:
                    audio = recognizer.listen(
                        source,
                        timeout=config["listen_timeout"],
                        phrase_time_limit=10,
                    )
                except sr.WaitTimeoutError:
                    # Silencio prolongado — normal, continuar
                    state.consecutive_errors = 0
                    continue

            # ── 2. Transcribir ──
            text = transcribe(recognizer, audio, config)
            if not text:
                continue

            print(f"[SISTEMA] Escuché: '{text}'")

            # ── 3. Chequear wake word ──
            matched, command = check_wake_word(text, wake_words)

            if not matched:
                continue

            print(f"[SISTEMA] ¡Wake word detectado!")

            # ── 4. Si no hay comando en el mismo fragmento, esperar el siguiente ──
            if not command:
                print("[SISTEMA] Esperando comando...")
                with mic as source:
                    try:
                        audio2 = recognizer.listen(
                            source,
                            timeout=config["command_timeout"],
                            phrase_time_limit=12,
                        )
                        command = transcribe(recognizer, audio2, config)
                    except sr.WaitTimeoutError:
                        print("[SISTEMA] Timeout esperando comando.")
                        continue

            if not command:
                print("[SISTEMA] No se capturó ningún comando.")
                continue

            print(f"[SISTEMA] Comando: '{command}'")

            # ── 5. Asegurarse de que el frontend esté abierto ──
            if not is_frontend_open(frontend_url):
                open_frontend(frontend_url)

            # ── 6. Enviar comando al backend ──
            if not is_backend_alive(backend_url):
                print(f"[SISTEMA] Backend no disponible en {backend_url}. ¿Está corriendo?")
                continue

            state.processing = True
            success = send_command(backend_url, command)
            state.processing = False

            if success:
                state.consecutive_errors = 0
            else:
                state.consecutive_errors += 1

            print("[SISTEMA] Volviendo a escucha pasiva...\n")

        except KeyboardInterrupt:
            print("\n[SISTEMA] Detenido por el usuario.")
            state.running = False
            break

        except Exception as e:
            state.consecutive_errors += 1
            print(f"[SISTEMA] Error inesperado: {e}")
            if state.consecutive_errors >= state.max_errors:
                print(f"[SISTEMA] Demasiados errores consecutivos ({state.max_errors}). Deteniendo.")
                state.running = False
                break
            time.sleep(1)


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  SISTEMA — Listener Nativo v1.0")
    print("  Escucha pasiva continua. Ctrl+C para detener.")
    print("=" * 55)
    print()

    config = load_config()
    state  = ListenerState()

    # Verificar backend al inicio (no bloquear si no está levantado)
    if is_backend_alive(config["backend_url"]):
        print(f"[SISTEMA] Backend online en {config['backend_url']}")
    else:
        print(f"[SISTEMA] Aviso: Backend no responde en {config['backend_url']}")
        print("[SISTEMA] El listener va a seguir corriendo. Reintentará en cada comando.")

    listen_loop(config, state)

    print("[SISTEMA] Listener detenido.")


if __name__ == "__main__":
    main()