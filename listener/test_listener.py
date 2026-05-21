# listener/test_listener.py — Tests manuales del listener por componente
# No requiere backend corriendo. Testea micrófono, transcripción y wake words.
#
# Uso:
#   python test_listener.py          → corre todos los tests
#   python test_listener.py mic      → solo test de micrófono
#   python test_listener.py wakeword → solo test de wake words
#   python test_listener.py stt      → solo test de transcripción (5 segundos)

import sys
import time
from pathlib import Path

# Agregar el directorio padre para importar listener
sys.path.insert(0, str(Path(__file__).parent))

# ─── TEST 1: Imports ──────────────────────────────────────────────────────────

def test_imports():
    print("\n[TEST 1] Verificando imports...")
    try:
        import speech_recognition as sr
        print("  ✓ speech_recognition OK")
    except ImportError:
        print("  ✗ speech_recognition NO instalado → pip install SpeechRecognition")
        return False

    try:
        import pyaudio
        print("  ✓ pyaudio OK")
    except ImportError:
        print("  ✗ pyaudio NO instalado → pip install pyaudio")
        return False

    try:
        from dotenv import dotenv_values
        print("  ✓ python-dotenv OK")
    except ImportError:
        print("  ✗ python-dotenv NO instalado → pip install python-dotenv")
        return False

    return True


# ─── TEST 2: Micrófono ───────────────────────────────────────────────────────

def test_microphone():
    print("\n[TEST 2] Verificando micrófonos disponibles...")
    import speech_recognition as sr
    import pyaudio

    p = pyaudio.PyAudio()
    mic_count = p.get_device_count()
    input_devices = []

    for i in range(mic_count):
        info = p.get_device_info_by_index(i)
        if info.get("maxInputChannels", 0) > 0:
            input_devices.append(f"  [{i}] {info['name']}")

    p.terminate()

    if not input_devices:
        print("  ✗ No se encontraron micrófonos.")
        return False

    print(f"  Micrófonos disponibles ({len(input_devices)}):")
    for d in input_devices:
        print(d)

    # Intentar abrir el micrófono default
    try:
        mic = sr.Microphone()
        with mic as source:
            recognizer = sr.Recognizer()
            recognizer.adjust_for_ambient_noise(source, duration=1)
            print(f"  ✓ Micrófono default abierto OK (threshold: {recognizer.energy_threshold:.0f})")
        return True
    except Exception as e:
        print(f"  ✗ Error al abrir micrófono: {e}")
        return False


# ─── TEST 3: Wake words ───────────────────────────────────────────────────────

def test_wake_words():
    print("\n[TEST 3] Verificando lógica de wake words...")
    from listener import check_wake_word, DEFAULT_WAKE_WORDS

    cases = [
        # (input, expected_matched, expected_command_contains)
        ("sistema",                    True,  ""),
        ("hey sistema",                True,  ""),
        ("sistema abrí YouTube",       True,  "abrí YouTube"),
        ("oye sistema pon música",     True,  "pon música"),
        ("eh sistema qué hora es",     True,  "qué hora es"),
        ("jarvis abrí Discord",        True,  "abrí Discord"),
        ("escuchame qué temperatura",  True,  "qué temperatura"),
        ("hola qué tal",               False, ""),
        ("sistema",                    True,  ""),
        ("ok sistema reproduce algo",  True,  "reproduce algo"),
    ]

    passed = 0
    for text, exp_matched, exp_cmd in cases:
        matched, command = check_wake_word(text, DEFAULT_WAKE_WORDS)
        cmd_ok = exp_cmd.lower() in command.lower() if exp_cmd else command == ""
        ok = matched == exp_matched and cmd_ok
        status = "✓" if ok else "✗"
        print(f"  {status} '{text}' → matched={matched}, command='{command}'")
        if ok:
            passed += 1

    print(f"\n  Resultado: {passed}/{len(cases)} tests pasaron.")
    return passed == len(cases)


# ─── TEST 4: Transcripción en vivo ───────────────────────────────────────────

def test_stt_live(seconds=5):
    print(f"\n[TEST 4] Test de transcripción en vivo ({seconds}s)...")
    print("  → Hablá ahora. Decí algo como 'sistema abrí YouTube'")
    print()

    import speech_recognition as sr

    recognizer = sr.Recognizer()
    mic = sr.Microphone()

    with mic as source:
        recognizer.adjust_for_ambient_noise(source, duration=1)
        print("  Escuchando...")
        try:
            audio = recognizer.listen(source, timeout=seconds, phrase_time_limit=seconds)
        except sr.WaitTimeoutError:
            print("  ✗ Timeout: no se detectó audio.")
            return False

    print("  Transcribiendo con Google STT...")
    try:
        text = recognizer.recognize_google(audio, language="es-AR")
        print(f"  ✓ Transcripción: '{text}'")

        from listener import check_wake_word, DEFAULT_WAKE_WORDS
        matched, command = check_wake_word(text, DEFAULT_WAKE_WORDS)
        if matched:
            print(f"  ✓ Wake word detectado! Comando: '{command}'")
        else:
            print("  ℹ No se detectó wake word en el fragmento.")
        return True
    except sr.UnknownValueError:
        print("  ✗ No se entendió el audio.")
        return False
    except sr.RequestError as e:
        print(f"  ✗ Error STT: {e}")
        return False


# ─── TEST 5: Conectividad backend ─────────────────────────────────────────────

def test_backend():
    print("\n[TEST 5] Verificando conectividad con backend...")
    import urllib.request

    urls = [
        ("http://localhost:3001/api/health", "Backend"),
        ("http://localhost:3000", "Frontend"),
    ]

    for url, name in urls:
        try:
            req = urllib.request.urlopen(url, timeout=2)
            print(f"  ✓ {name} online en {url} (status {req.status})")
        except Exception:
            print(f"  ✗ {name} no disponible en {url} (no es error si no está corriendo)")

    return True  # No falla aunque el backend no esté


# ─── Runner ───────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    run_all = not args

    results = {}

    if run_all or "imports" in args:
        results["imports"] = test_imports()

    if run_all or "mic" in args:
        results["microphone"] = test_microphone()

    if run_all or "wakeword" in args:
        results["wake_words"] = test_wake_words()

    if run_all or "stt" in args:
        results["stt_live"] = test_stt_live()

    if run_all or "backend" in args:
        results["backend"] = test_backend()

    # Resumen
    print("\n" + "=" * 45)
    print("  RESUMEN")
    print("=" * 45)
    for name, ok in results.items():
        status = "✓ PASÓ" if ok else "✗ FALLÓ"
        print(f"  {status}  {name}")

    all_ok = all(results.values())
    print()
    if all_ok:
        print("  Todos los tests pasaron. El listener está listo.")
    else:
        print("  Algunos tests fallaron. Revisá los errores arriba.")
    print("=" * 45)


if __name__ == "__main__":
    main()