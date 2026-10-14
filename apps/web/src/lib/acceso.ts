// Acceso por nombre (http://sanatorio.salvador.connect) para quien entra por IP.
// Lógica pura: se prueba en tests/web-logic.test.mjs.

export type AccesoConfig = { siteUrl: string | null; nombre: string | null; ip: string | null };

export function esIpV4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** PC con Windows (el instalador es un .bat; en celulares y Mac no aplica). */
export function esWindowsEscritorio(ua: string): boolean {
  return /Windows NT/i.test(ua) && !/Mobile|Phone|Android/i.test(ua);
}

/** ¿Corresponde ofrecer el acceso por nombre en esta página? */
export function debeOfrecer(cfg: AccesoConfig | null, hostname: string, ua: string): boolean {
  return !!cfg?.siteUrl && !!cfg.nombre && !!cfg.ip && hostname !== cfg.nombre && esIpV4(hostname) && esWindowsEscritorio(ua);
}

/**
 * Instalador .bat para Windows (CRLF): agrega «IP nombre» al archivo hosts de la PC, crea el acceso directo
 * en el escritorio y abre el sistema. Pide permisos de administrador solo. Se puede ejecutar varias veces.
 */
export function generarBat(cfg: { ip: string; nombre: string; siteUrl: string }): string {
  const url = cfg.siteUrl.replace(/\/+$/, "") + "/";
  const lineas = [
    "@echo off",
    "setlocal",
    "rem ============================================================================",
    "rem  Sanatorio del Salvador - acceso al sistema por nombre",
    "rem  Agrega el nombre del sistema al archivo hosts de ESTA PC y crea un acceso",
    "rem  directo en el escritorio. Se puede ejecutar las veces que haga falta.",
    "rem ============================================================================",
    `set "IP=${cfg.ip}"`,
    `set "NOMBRE=${cfg.nombre}"`,
    `set "URL=${url}"`,
    "",
    "net session >nul 2>&1",
    "if %errorlevel% neq 0 (",
    "  echo Pidiendo permisos de administrador...",
    "  powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
    "  exit /b",
    ")",
    "",
    'set "HOSTS=%SystemRoot%\\System32\\drivers\\etc\\hosts"',
    'set "TMPH=%TEMP%\\hosts.sanatorio.tmp"',
    "echo.",
    "echo  Configurando %NOMBRE% -^> %IP% en esta PC...",
    'attrib -r "%HOSTS%" >nul 2>&1',
    'copy /y "%HOSTS%" "%HOSTS%.bak-sanatorio" >nul',
    'findstr /v /i /c:"%NOMBRE%" "%HOSTS%" | findstr /v /r /c:"^ *$" > "%TMPH%"',
    'copy /y "%TMPH%" "%HOSTS%" >nul',
    'del "%TMPH%" >nul 2>&1',
    '>>"%HOSTS%" echo.',
    '>>"%HOSTS%" echo %IP%\t%NOMBRE%',
    "ipconfig /flushdns >nul",
    "",
    '> "%PUBLIC%\\Desktop\\Sanatorio del Salvador.url" (',
    "  echo [InternetShortcut]",
    "  echo URL=%URL%",
    ")",
    "",
    "echo.",
    "echo  LISTO. Esta PC ya entra al sistema con: %URL%",
    'echo  Tambien quedo el acceso directo "Sanatorio del Salvador" en el escritorio.',
    'start "" "%URL%"',
    "echo.",
    "pause",
  ];
  return lineas.join("\r\n") + "\r\n";
}

/** ¿Esta PC ya llega al sistema por el nombre? (si el nombre no está en hosts/DNS, el fetch falla). */
export async function probarNombre(siteUrl: string, ms = 3500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    await fetch(`${siteUrl.replace(/\/+$/, "")}/api/health?_=${Date.now()}`, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}
