@echo off
setlocal
rem ---------------------------------------------------------------------------
rem  Revelar fotos  ·  esto es lo que Paula abre con doble clic.
rem
rem  No hace falta tener Node instalado en el computador: se usa el que está
rem  en la carpeta "windows\node" de aquí al lado. Si algún día no estuviera,
rem  se intenta con el del sistema.
rem
rem  Christian: si mueves la carpeta a otro sitio, esto sigue funcionando.
rem  %~dp0 es la carpeta donde vive este archivo, con la barra final incluida,
rem  y va entre comillas en todas partes para que los espacios de la ruta no
rem  rompan nada.
rem ---------------------------------------------------------------------------

title Revelar fotos de producto

set "AQUI=%~dp0"
set "NODE=%AQUI%windows\node\node.exe"
set "GUION=%AQUI%procesar-fotos.mjs"

if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  No encuentro Node.
    echo.
    echo  Deberia estar aqui:
    echo    %NODE%
    echo.
    echo  Avisale a Christian: falta preparar la carpeta "windows\node".
    echo.
    pause
    exit /b 1
  )
  set "NODE=node"
)

if not exist "%GUION%" (
  echo.
  echo  No encuentro el programa: %GUION%
  echo  La carpeta esta incompleta. Avisale a Christian.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo   Revelando fotos de producto
echo.
echo   Deja esta ventana abierta mientras trabajas.
echo   Copia los .ARW a la carpeta "entrada".
echo   Para terminar: cierra la ventana.
echo  ================================================
echo.

"%NODE%" "%GUION%" %*

rem Si el programa se cae, la ventana se queda abierta para poder leer el error.
echo.
echo  --- El programa termino ---
pause
endlocal
