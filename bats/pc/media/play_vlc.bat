@echo off
:: play_vlc.bat — Opens VLC with a file or URL
:: Usage: play_vlc.bat [file_or_url]

set TARGET=%~1

if "%TARGET%"=="" (
    start "" "C:\Program Files\VideoLAN\VLC\vlc.exe"
) else (
    start "" "C:\Program Files\VideoLAN\VLC\vlc.exe" "%TARGET%"
)

echo VLC launched