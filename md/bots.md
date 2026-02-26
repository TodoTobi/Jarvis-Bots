# Bots

## WebBot
- **Purpose**: Handle web tasks, search, information retrieval, general conversation
- **Intent prefixes**: `web_`, `chat_`, `search_`
- **Capabilities**: Processes user queries through the LLM and returns text responses

## DoctorBot
- **Purpose**: Diagnose errors in other bots, document issues, suggest solutions
- **Intent prefixes**: `diagnose_`, `doctor_`
- **Capabilities**: Analyzes bot failures, logs diagnostics, recommends fixes

## Intent Format
When receiving a user message, respond with JSON:
```json
{
  "intent": "web_search",
  "parameters": { "query": "user's actual question or task" },
  "priority": "normal",
  "notes": "optional context"
}
```

## Common Intents
- `web_search` → WebBot searches or answers
- `web_chat` → WebBot general conversation
- `chat_response` → WebBot conversational reply
- `diagnose_bot` → DoctorBot checks system health
