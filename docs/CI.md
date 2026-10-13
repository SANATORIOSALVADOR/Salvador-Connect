# CI (GitHub Actions)

`.github/workflows/ci.yml` corre en cada push o pull request a `main`:

1. **Tipos y compilación**: `pnpm run typecheck` (todo el proyecto), build de la API y de la web.
2. **Pruebas**:
   - `tests/web-logic.test.mjs`: lógica de Guardias (horas, nocturnas, huecos de cobertura, estadísticas).
   - `tests/sw.test.mjs`: service worker de la app instalable (caché, sin red, servidor caído, logout).
   - `tests/api.sh`: más de 100 casos de punta a punta contra un PostgreSQL vacío. La API arranca
     sobre esa base, así que también se prueba que las migraciones crean el esquema desde cero.

## Correrlas a mano

```bash
pnpm test                       # lógica + service worker
# API: levantarla sobre una base vacía con BOOTSTRAP_ADMIN_PASSWORD y después:
API_URL=http://127.0.0.1:5000/api ADMIN_PASSWORD=<la misma> DATABASE_URL=<url> pnpm test:api
```

Si una prueba falla, el resultado aparece en la pestaña **Actions** de GitHub (con el log de la API).
