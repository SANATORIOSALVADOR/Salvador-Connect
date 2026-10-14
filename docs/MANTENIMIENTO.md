# Pantallas de «sistema no disponible» y «mantenimiento»

## Qué ve la gente

| Situación | Qué pasa |
|---|---|
| **El API no responde** (contenedor `api` caído, error al arrancar, base caída) | Pantalla **«El sistema no está disponible en este momento»**. Reintenta sola (cada 10 s, después más espaciado) y vuelve al sistema apenas responde. |
| **Mantenimiento prendido** (`bash scripts/mantenimiento.sh on`) | Pantalla **«Estamos haciendo mantenimiento»** con el aviso y la hora estimada. Se cierra sola cuando se apaga. Mientras tanto no se puede guardar nada. |
| **La web entera caída** (por ejemplo, reconstruyendo el contenedor `web`) | Entrando por `http://sanatorio.salvador.connect`: la pantalla «no disponible» la da el nginx del servidor. Entrando por IP: si la PC ya usó el sistema (app instalable), abre la última copia y muestra la pantalla; si no, el navegador muestra su error. |

Quien ya estaba dentro del sistema ve la misma pantalla **encima** de lo que tenía abierto: cuando vuelve todo,
desaparece y sigue en la misma pantalla (no lo manda al ingreso). Si se cortó la red y la PC tiene guardada la
última copia de Guardias, aparece el botón **«Ver la última copia de Guardias»** (queda una barra amarilla arriba
hasta que vuelve la conexión).

## Modo mantenimiento

```bash
bash scripts/mantenimiento.sh on                                   # prende, sin mensaje
bash scripts/mantenimiento.sh on "Actualizamos el sistema" 30      # con aviso y vuelta estimada en 30 minutos
bash scripts/mantenimiento.sh on "Corte de luz programado" 18:30   # vuelta estimada hoy a las 18:30
bash scripts/mantenimiento.sh estado                               # ¿está prendido?
bash scripts/mantenimiento.sh off                                  # apaga (las pantallas vuelven solas)
```

- Funciona al instante, sin reiniciar nada: crea o borra `estado/mantenimiento.json`, que el nginx de la web lee
  en cada pedido (carpeta montada en el contenedor `web`).
- En mantenimiento solo responden `/api/health`, `GET /api/apariencia` y `/api/acceso` (los usan las pantallas).
- Ejemplo de actualización planificada:

```bash
bash scripts/mantenimiento.sh on "Actualizamos el sistema" 15
git fetch origin && git reset --hard origin/main
docker compose build --no-cache api web && docker compose up -d --force-recreate api web
bash scripts/mantenimiento.sh off
```

## Dónde está cada cosa

- Páginas: `apps/web/public/estado/caido.html` y `mantenimiento.html` (autónomas: no dependen del API).
- nginx de la web: `deploy/nginx.conf` (API caída → 503 `{"codigo":"caido"}`; mantenimiento → 503 `{"codigo":"mantenimiento"}`
  y la página de mantenimiento). El API se resuelve al momento del pedido, así la web arranca aunque el API no esté.
- Dentro de la app: `apps/web/src/lib/estado-sistema.ts` (vigila las respuestas de `/api`) y
  `apps/web/src/components/estado-sistema.tsx` (pantalla encima).
- nginx del servidor (puerto 80): `scripts/configurar-nginx-host.sh` instala la página «no disponible» para cuando la web no responde.
- Pruebas: `tests/nginx-estado.sh` (nginx real en Docker, corre en GitHub), `tests/sw.test.mjs`, `tests/web-logic.test.mjs`.
