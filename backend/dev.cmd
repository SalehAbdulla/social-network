@echo off
setlocal
cd /d "%~dp0"
if exist "C:\msys64\mingw64\bin\gcc.exe" set "PATH=C:\msys64\mingw64\bin;%PATH%"
if not defined GOCACHE set "GOCACHE=%~dp0tmp\go-build"
go run ./cmd
