# Entrar por nombre: http://sanatorio.salvador.connect

Dentro de la red del sanatorio el sistema se abre con **`http://sanatorio.salvador.connect`** en lugar de la IP y el puerto.
No usa internet ni hosting: es un nombre interno que solo existe en la red local.

> `.connect` no es una terminación pública de internet, por eso **la primera vez** hay que escribir `http://` adelante
> (si no, el navegador lo busca en Google). Después queda en favoritos / acceso directo.

## 1. En el servidor (una vez)

```bash
cd ~/salvador-connect
git fetch origin && git reset --hard origin/main
bash scripts/configurar-nombre.sh
```

El script:

1. Pasa la web al **puerto 80** (`WEB_BIND=0.0.0.0:80`) para no tener que escribir `:8080`. Si el 80 está ocupado, avisa.
2. Guarda en `.env`: `SITE_NAME`, `SERVER_IP` (IP detectada; se puede forzar con `SERVER_IP=x.x.x.x bash scripts/configurar-nombre.sh`) y `COMPOSE_PROFILES=dns`.
3. Levanta el servicio **`dns`** (dnsmasq): responde `sanatorio.salvador.connect → IP del servidor` y todo lo demás lo pregunta a internet (`DNS_UPSTREAM_1/2`, por defecto 8.8.8.8 y 1.1.1.1).
4. Prueba la web y el DNS y muestra el resultado. Antes guarda una copia del `.env` (`.env.bak.FECHA`).

Con `COMPOSE_PROFILES=dns` en `.env`, los comandos de siempre (`docker compose up -d …`) mantienen el DNS andando.

## 1b. Sin puerto: usar el nginx que ya tiene el servidor en el puerto 80

El servidor tiene su propio nginx en el puerto 80 (fuera de Docker). Se le agrega un sitio solo para el nombre
(lo demás que sirve no cambia):

```bash
bash scripts/configurar-nginx-host.sh
```

Después el sistema abre con `http://sanatorio.salvador.connect` (sin `:8085`) y el API informa esa dirección
(`SITE_URL` en `.env`) para el instalador automático.

## 2a. Sin tocar el router (PC por PC) — lo que se usa hoy

**Automático:** quien entra por IP (`http://172.20.1.134:8085`) desde una PC con Windows ve un aviso
«Entrá con el nombre, sin la IP» con el botón **Descargar instalador** (generado con los datos de este servidor).
Se ejecuta una vez y listo. Si la PC ya tiene el nombre, la pantalla de ingreso la lleva sola al nombre.
El aviso se puede cerrar o «No mostrar más en esta PC». En celulares no aparece.

**Manual (alternativa):

** en cada PC, abrir en el navegador `http://172.20.1.134:8085/descargas/acceso-sanatorio.bat`, descargarlo y
ejecutarlo (doble clic → aceptar el permiso de administrador). Hace tres cosas:

1. Agrega `172.20.1.134  sanatorio.salvador.connect` al archivo `hosts` de esa PC (guarda copia en `hosts.bak-sanatorio`).
2. Crea el acceso directo **«Sanatorio del Salvador»** en el escritorio de todos los usuarios.
3. Abre el sistema.

Se puede ejecutar varias veces (no duplica). Si cambia la IP o el puerto, editar las 3 primeras líneas del archivo
(`scripts/windows/acceso-sanatorio.bat` y la copia en `apps/web/public/descargas/`). Windows puede advertir que el archivo
"no es común": elegir «Más información → Ejecutar de todas formas».

## 2b. En la red (una vez): que las PCs usen el servidor como DNS

Elegí **una** opción:

| Opción | Dónde | Qué cargar |
|---|---|---|
| **A. Router / firewall con DNS propio** (MikroTik, Fortinet, pfSense, Ubiquiti…) | Sección DNS → registros estáticos | `sanatorio.salvador.connect` tipo **A** → IP del servidor. En este caso se puede correr el script con `--sin-dns`. |
| **B. Windows Server con dominio** | Administrador de DNS → nueva zona `salvador.connect` → registro A `sanatorio` | → IP del servidor (`--sin-dns`) |
| **C. Router común** (cualquier otro) | DHCP → servidores DNS | **DNS primario = IP del servidor**, secundario 8.8.8.8. Las PCs lo toman al reiniciar o con `ipconfig /renew`. |
| **Solo una PC (prueba)** | `C:\Windows\System32\drivers\etc\hosts` (Bloc de notas como administrador) | Agregar: `IP-del-servidor   sanatorio.salvador.connect` |

Con la opción C, si el servidor se apaga, las PCs usan el DNS secundario y siguen teniendo internet (solo el nombre del sistema deja de funcionar hasta que vuelva).

## Comprobar desde una PC

```
nslookup sanatorio.salvador.connect
```

Tiene que responder la IP del servidor. Después abrir `http://sanatorio.salvador.connect`.

## Notas

- El servidor necesita **IP fija** (o reservada en el router).
- La app instalada (PWA) con la dirección vieja se reinstala desde la nueva. Las sesiones piden ingresar de nuevo una vez.
- Para volver atrás: restaurar el `.env.bak.*` y `docker compose up -d --force-recreate web`, y `docker compose stop dns`.
- Ver logs del DNS: `docker compose logs dns --tail 50`.
