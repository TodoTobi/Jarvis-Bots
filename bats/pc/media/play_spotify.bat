@echo off
:: play_spotify.bat — Opens Spotify application
:: Tries the Windows Store app first, then the installed version

start "" "spotify:"
if errorlevel 1 (
    start "" "%APPDATA%\Spotify\Spotify.exe"
)

echo Spotify launched