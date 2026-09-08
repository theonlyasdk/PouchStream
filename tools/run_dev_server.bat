@echo off
title PouchStream Dev Server
cd /d "%~dp0"
echo Starting PouchStream Development Server...
python dev_server.py %*
pause
