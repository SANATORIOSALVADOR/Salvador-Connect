# Restaurar frontend completo (diseño Replit)

Si ves un login oscuro simple en lugar de **“Bienvenido al equipo”**, el frontend mínimo de prueba está activo.

## En el server

```bash
cd ~/salvador-connect
git pull
chmod +x scripts/restore-frontend.sh
bash scripts/restore-frontend.sh
```

Eso:

1. Recupera `artifacts/sanatorio-salvador` desde GitHub
2. Lo copia a `apps/web`
3. Restaura el cliente API
4. Rebuild del contenedor `web`

## Qué queda usable

| Ruta | Estado |
|------|--------|
| `/` Welcome | Completo |
| `/sign-in` Login | Completo |
| `/dashboard` | Completo |
| `/administracion` Agenda | Completo |
| `/usuarios` | Completo |
| `/guardias` `/inventario` `/instructivos` `/liquidacion` | Accesibles (placeholder Tramo 1) |
