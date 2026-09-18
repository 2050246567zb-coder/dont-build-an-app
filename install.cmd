@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "APP_NODE=%~dp0runtime\node.exe"
if not exist "%APP_NODE%" set "APP_NODE=node"
"%APP_NODE%" "%~dp0scripts\setup.mjs" %*
set "APP_RESULT=%ERRORLEVEL%"
if not "%APP_RESULT%"=="0" echo Installation failed. See INSTALL.md for requirements.
if "%~1"=="" pause
exit /b %APP_RESULT%
