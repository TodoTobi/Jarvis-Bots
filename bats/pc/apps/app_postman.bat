@echo off
:: app_postman.bat — Opens Postman
start "" "%LOCALAPPDATA%\Postman\Postman.exe"
if errorlevel 1 start "" postman
echo Postman launched