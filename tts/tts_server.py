"""
tts_server.py — Servidor TTS local con Kokoro v0.7.16
Recibe texto via POST /synthesize
Devuelve audio WAV con voz Jarvis
Corre en http://localhost:5002

Instalación: ejecutar start_tts.bat
"""

import os
import io
import re
import numpy as np
import soundfile as sf
from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

# ── Cargar Kokoro al iniciar ──────────────────────────────────
print("[TTS] Cargando Kokoro v0.7.x...")
try:
    from kokoro import KPipeline
    # v0.7.x: lang_code "a" = inglés americano (no "en-us")
    PIPELINE = KPipeline(lang_code="a")
    print("[TTS] Kokoro listo ✓")
except Exception as e:
    print(f"[TTS] Error cargando Kokoro: {e}")
    print("[TTS] Corré: pip install kokoro==0.7.16")
    PIPELINE = None

VOICES_DIR  = os.path.join(os.path.dirname(__file__), "voices")
REF_AUDIO   = os.path.join(VOICES_DIR, "jarvis_ref.wav")
SAMPLE_RATE = 24000


def clean_text(text):
    """Limpiar markdown, código y URLs antes de sintetizar."""
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`]*`', '', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'#{1,6}\s', '', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'//.*', '', text)
    text = re.sub(r'\n+', '. ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:500]


@app.route("/synthesize", methods=["POST"])
def synthesize():
    if PIPELINE is None:
        return jsonify({"error": "Kokoro no disponible — revisá la instalación"}), 503

    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "text requerido"}), 400

    text = clean_text(text)
    if not text:
        return jsonify({"error": "texto vacío tras limpiar"}), 400

    print(f"[TTS] Sintetizando: \"{text[:60]}\" ({len(text)} chars)")

    try:
        has_ref = os.path.exists(REF_AUDIO)

        # v0.7.x: la voz por defecto masculina grave es "am_adam"
        # Si hay referencia WAV, intentar usarla
        voice = REF_AUDIO if has_ref else "am_adam"

        generator = PIPELINE(
            text,
            voice=voice,
            speed=0.92,        # ligeramente lento, más robótico
            split_pattern=r'\n+',
        )

        audio_chunks = []
        for _, _, audio in generator:
            if audio is not None:
                audio_chunks.append(audio)

        if not audio_chunks:
            return jsonify({"error": "Kokoro no generó audio"}), 500

        audio_data = np.concatenate(audio_chunks)
        buffer     = io.BytesIO()
        sf.write(buffer, audio_data, SAMPLE_RATE, format="WAV")
        buffer.seek(0)

        print(f"[TTS] ✓ {len(audio_data)/SAMPLE_RATE:.1f}s — {'ref' if has_ref else 'am_adam'}")
        return send_file(
            buffer,
            mimetype="audio/wav",
            as_attachment=False,
            download_name="response.wav"
        )

    except Exception as e:
        print(f"[TTS] Error sintetizando: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/status", methods=["GET"])
def status():
    return jsonify({
        "ok":                PIPELINE is not None,
        "model":             "kokoro-0.7.16",
        "hasReferenceVoice": os.path.exists(REF_AUDIO),
        "refAudioPath":      REF_AUDIO,
        "port":              5002,
        "defaultVoice":      "am_adam",
    })


if __name__ == "__main__":
    os.makedirs(VOICES_DIR, exist_ok=True)
    if not os.path.exists(REF_AUDIO):
        print(f"[TTS] ⚠  Sin referencia. Poné tu audio en: {REF_AUDIO}")
        print(f"[TTS]    Usando voz por defecto: am_adam")
    else:
        print(f"[TTS] ✓ Referencia encontrada: {REF_AUDIO}")
    print("[TTS] Servidor en http://127.0.0.1:5002")
    app.run(host="127.0.0.1", port=5002, debug=False)