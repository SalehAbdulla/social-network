@echo off
setlocal
cd /d "%~dp0"
if exist "C:\msys64\mingw64\bin\gcc.exe" set "PATH=C:\msys64\mingw64\bin;%PATH%"
if not defined GOCACHE set "GOCACHE=%~dp0tmp\go-build"
set "DEV_DUMMY_USER=true"
go run ./cmd/seed -demo
if errorlevel 1 exit /b 1
go run ./cmd
