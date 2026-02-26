@echo off
:: play_youtube.bat — Opens YouTube with an optional search query
:: Usage: play_youtube.bat [search+query]

set QUERY=%~1

if "%QUERY%"=="" (
    start "" "https://www.youtube.com"
) else (
    start "" "https://www.youtube.com/results?search_query=%QUERY%"
)

echo YouTube opened