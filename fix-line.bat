@echo off
setlocal enabledelayedexpansion

set "file=src\views\DevDashboard.tsx"
set "tempfile=%file%.tmp"

if exist "%tempfile%" del "%tempfile%"

for /f "usebackq delims=" %%i in ("%file%") do (
  set "line=%%i"
  if "!line!"=="    () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + s.total, 0)," (
    echo     () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + (Number(s.total) || 0), 0),>> "%tempfile%"
  ) else (
    echo %%i>> "%tempfile%"
  )
)

move /y "%tempfile%" "%file%" >nul
echo Fixed!
