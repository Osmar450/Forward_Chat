@echo off
title Forward_Chat - Servidor
cd /d "%~dp0"
echo ==========================================
echo   FORWARD_CHAT - Servidor en puerto 3000
echo   No cierres esta ventana mientras uses la app
echo ==========================================
node index.js
echo.
echo El servidor se detuvo. Revisa el error de arriba.
pause
