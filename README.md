# Sanatorio del Salvador — Sistema Interno (Salvador-Connect)

Sistema interno modular para la gestión administrativa del **Sanatorio del Salvador**.

> Documento de alcance MVP vigente · Construcción por tramos · Stack: React/TypeScript + Express + PostgreSQL (Drizzle) · Despliegue on-premise (Linux / Proxmox)

---

## Objetivo

Digitalizar y centralizar procesos administrativos que hoy se gestionan en papel o de forma dispersa:

- Agenda y recordatorios (cheques, vencimientos, pagos, auditorías)
- Guardias por sector con alerta de cobertura
- Inventario de activos fijos por sector + historial de movimientos
- Repositorio de instructivos formales (PDF) por área
- Configuración de usuarios, roles y sectores

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 + TypeScript + Tailwind + shadcn/ui |
| Backend | Express 5 + TypeScript |
| ORM / DB | PostgreSQL + Drizzle ORM |
| Validación | Zod |
| Monorepo | pnpm workspaces |
| Auth | Sesiones propias (cookie httpOnly + scrypt) |
| Infra | Linux sobre Proxmox (on-premise) |

---

## Estructura del repositorio (monorepo)

```text
Salvador-Connect/
├── artifacts/
│   ├── api-server/          # Backend Express (API REST)
│   └── mockup-sandbox/      # Preview de componentes UI (Replit)
├── lib/
│   ├── db/                  # Schema Drizzle + conexión PostgreSQL
│   ├── api-spec/            # OpenAPI + Orval codegen
│   ├── api-zod/             # Schemas Zod generados
│   └── api-client-react/    # Cliente React tipado
├── scripts/                 # Utilidades de build / seed
├── docs/                    # Documentación de arquitectura y alcance
├── .github/workflows/       # CI (typecheck + build)
├── package.json
├── pnpm-workspace.yaml
└── CLAUDE.md                # Contexto para Claude Code
```

---

## Roles del sistema

| Rol | Permisos |
|-----|----------|
| **Administrador General** (`superadmin`) | Acceso total a todos los módulos y sectores |
| **Responsable de Sector** | Gestiona Guardias e Inventario de su(s) sector(es); sube Instructivos |
| **Usuario** | Consulta limitada a sus sectores |

Regla general: en Guardias e Inventario el sistema filtra automáticamente por los sectores asignados al usuario.

---

## Módulos MVP

1. **Fundación** — Login, layout, roles, sectores, dashboard  
2. **Administración** — Agenda + Recordatorios + Calendario  
3. **Guardias** — Carga por sector, calendario, alerta de cobertura  
4. **Inventario** — Activos fijos + historial de movimientos entre sectores  
5. **Instructivos** — Repositorio de PDFs por sector  
6. **Configuración** — ABM usuarios, sectores, catálogos  
7. **Liquidación** — Placeholder (fuera del MVP)

---

## Cómo correr el proyecto

### Requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ (o 16)

### Pasos

```bash
# 1. Clonar
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar DATABASE_URL=postgresql://user:pass@host:5432/sanatorio_db

# 4. Aplicar schema a la base de datos
pnpm --filter @workspace/db run push

# 5. Levantar API
pnpm --filter @workspace/api-server run dev
```

En el primer arranque se crea automáticamente un usuario administrador de bootstrap (credenciales internas del equipo; no se documentan en el repositorio). Se recomienda cambiar la contraseña en el primer acceso.

---

## Documentación adicional

- [Documento de Alcance MVP](docs/ALCANCE_MVP.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Estado actual](docs/ESTADO_ACTUAL.md)
- [CLAUDE.md](CLAUDE.md) — instrucciones para Claude Code

---

## CI

En cada push/PR a `main` se ejecuta:

- `pnpm install`
- `pnpm run typecheck`
- `pnpm run build`

Ver: `.github/workflows/ci.yml`

---

## Estado actual (octubre 2026)

- ✅ Backend API + auth por sesión
- ✅ Schema Drizzle (core + módulos)
- ✅ Bootstrap superadmin
- ✅ CI con GitHub Actions
- ⚠️ Inventario aún modelado como stock (debe migrar a activos fijos)
- ⚠️ Frontend de aplicación completa pendiente de consolidar
- ⚠️ Guardias: falta modalidad Presencial/Retención y tipo Pasiva

---

**Equipo de desarrollo — Sanatorio del Salvador**  
Uso interno exclusivo.
