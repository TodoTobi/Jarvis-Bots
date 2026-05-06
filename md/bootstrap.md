# Bootstrap

## Secuencia de arranque
1. Cargar .env (PORT, LM_API_URL, claves)
2. Verificar conexión con LM Studio (reintentar si falla)
3. Cargar InstructionLoader (archivos .md)
4. Inicializar SkillLoader (skills built-in + custom)
5. Inicializar BotManager (todos los bots en paralelo)
6. Activar bots por defecto: WebBot, BatBot, SearchBot, DriveBot, TerminalBot
7. Express server listo en PORT

## En caso de fallo
- LM Studio offline → continuar, responder con error amigable en cada request
- Bot falla al iniciar → DoctorBot registra, bot marcado como unavailable
- .md faltante → usar defaults hardcodeados
- pdf-parse faltante → intentar pdftotext, luego pdfminer, luego error claro

## Fallback de intents
Si el LLM no responde JSON válido:
1. Intentar parsear JSON parcial
2. Si falla → QUICK_RULES por regex
3. Si falla → chat_response con el mensaje original

## Detección de tareas pesadas
Si el input tiene más de 5000 caracteres O es un PDF mayor a 5MB:
→ Dividir en chunks
→ Procesar secuencialmente
→ Informar al usuario del progreso