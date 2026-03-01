@echo off
:: app_github_desktop.bat — Opens GitHub Desktop
start "" "%LOCALAPPDATA%\GitHubDesktop\GitHubDesktop.exe"
if errorlevel 1 start "" "github-desktop"
echo GitHub Desktop launched