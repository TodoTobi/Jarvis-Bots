@echo off
:: open_discord.bat — Opens Discord
start "" "%LOCALAPPDATA%\Discord\Update.exe" --processStart Discord.exe
if errorlevel 1 (
    start "" "discord:"
)
echo Discord launched