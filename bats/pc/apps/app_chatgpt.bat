@echo off
:: app_chatgpt.bat — Opens ChatGPT in the default browser
:: Usage: app_chatgpt.bat [encoded_query]
:: Without query: opens ChatGPT homepage
:: With query: opens ChatGPT (user can paste/type the question)

set QUERY=%~1

if "%QUERY%"=="" (
    start "" "https://chat.openai.com"
) else (
    :: Decode the query and open ChatGPT
    :: Note: ChatGPT doesn't support direct URL query params,
    :: so we open it and put the query in clipboard
    powershell -command "Set-Clipboard '%QUERY%'"
    start "" "https://chat.openai.com"
    echo La pregunta fue copiada al portapapeles. Pegala en ChatGPT con Ctrl+V
)

echo ChatGPT opened in default browser