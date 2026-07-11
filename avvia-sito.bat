@echo off
cd /d "%~dp0"
start "" http://localhost:8787
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" -m http.server 8787
) else (
  py -m http.server 8787
)
