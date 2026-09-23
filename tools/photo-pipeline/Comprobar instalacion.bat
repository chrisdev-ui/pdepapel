@echo off
setlocal
rem ---------------------------------------------------------------------------
rem  Comprobar instalacion  ·  se abre una sola vez, la primera.
rem
rem  Revisa que Node, RawTherapee, el perfil y las carpetas esten donde deben
rem  y lo dice en pantalla. No revela ninguna foto.
rem ---------------------------------------------------------------------------

title Comprobar instalacion

set "AQUI=%~dp0"
set "NODE=%AQUI%windows\node\node.exe"
set "GUION=%AQUI%procesar-fotos.mjs"

if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  [X] No encuentro Node.
    echo      Deberia estar en: %NODE%
    echo      Falta preparar la carpeta "windows\node".
    echo.
    pause
    exit /b 1
  )
  set "NODE=node"
  echo  [!] Uso el Node del sistema, no el de la carpeta.
)

echo.
echo  Comprobando...
echo.

"%NODE%" "%GUION%" --comprobar

echo.
if errorlevel 1 (
  echo  --- Algo falta. Mira los renglones de arriba. ---
) else (
  echo  --- Todo listo. Ya se puede usar "Revelar fotos". ---
)
echo.
pause
endlocal
