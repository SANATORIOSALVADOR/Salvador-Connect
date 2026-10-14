@echo off
setlocal
rem ============================================================================
rem  Sanatorio del Salvador - acceso al sistema por nombre (sin tocar el router)
rem  Agrega "sanatorio.salvador.connect" al archivo hosts de ESTA PC y crea un
rem  acceso directo en el escritorio. Se puede ejecutar las veces que haga falta.
rem  Si cambia la IP o el puerto del servidor, editar estas tres lineas:
rem ============================================================================
set "IP=172.20.1.134"
set "NOMBRE=sanatorio.salvador.connect"
set "PUERTO=8085"

rem --- Necesita permisos de administrador: si no los tiene, los pide ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pidiendo permisos de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "TMPH=%TEMP%\hosts.sanatorio.tmp"

echo.
echo  Configurando %NOMBRE% -^> %IP% en esta PC...
attrib -r "%HOSTS%" >nul 2>&1
copy /y "%HOSTS%" "%HOSTS%.bak-sanatorio" >nul

rem Quita una linea anterior con el mismo nombre (por si cambio la IP) y las lineas vacias, y agrega la nueva.
findstr /v /i /c:"%NOMBRE%" "%HOSTS%" | findstr /v /r /c:"^ *$" > "%TMPH%"
copy /y "%TMPH%" "%HOSTS%" >nul
del "%TMPH%" >nul 2>&1
>>"%HOSTS%" echo.
>>"%HOSTS%" echo %IP%	%NOMBRE%

ipconfig /flushdns >nul

rem Acceso directo para todos los usuarios de la PC.
set "URL=http://%NOMBRE%/"
if not "%PUERTO%"=="80" set "URL=http://%NOMBRE%:%PUERTO%/"
> "%PUBLIC%\Desktop\Sanatorio del Salvador.url" (
  echo [InternetShortcut]
  echo URL=%URL%
)

echo.
ping -n 1 -w 1500 %NOMBRE% | find "%IP%" >nul
if %errorlevel%==0 (
  echo  LISTO. Esta PC ya entra al sistema con: %URL%
  echo  Tambien quedo el acceso directo "Sanatorio del Salvador" en el escritorio.
  start "" "%URL%"
) else (
  echo  Se configuro el nombre, pero el servidor %IP% no respondio al ping.
  echo  Si el sistema abre igual, esta todo bien. Si no, avisar a Sistemas.
)
echo.
pause
