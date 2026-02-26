@echo off
:: sleep.bat — Puts the PC to sleep (suspend)
:: 3 second delay to allow the command to be sent before sleep
timeout /t 3 /nobreak
rundll32.exe powrprof.dll,SetSuspendState 0,1,0
echo PC going to sleep