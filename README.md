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
│   └── mockup-sandbox/      # Preview de componentes UI
├── lib/
│   ├── db/                  # Schema Drizzle + conexión PostgreSQL
│   ├── api-spec/            # OpenAPI + Orval codegen
│   ├── api-zod/             # Schemas Zod generados
│   └── api-client-react/    # Cliente React tipado
├── scripts/                 # Seeds y utilidades
├── docs/                    # Alcance, arquitectura, Postgres, Claude Code
├── .github/workflows/       # CI
├── CLAUDE.md
└── package.json
```

---

## Roles del sistema

| Rol | Permisos |
|-----|----------|
| **Administrador General** (`superadmin`) | Acceso total |
| **Responsable de Sector** | Gestiona Guardias e Inventario de sus sectores |
| **Usuario** | Consulta limitada a sus sectores |

---

## Cómo correr el proyecto

### Requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ (o 16)

### Pasos

```bash
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect
pnpm install

cp .env.example .env
# Completar DATABASE_URL en .env

pnpm run db:push          # aplica schema a PostgreSQL
pnpm run dev:api          # levanta la API

# Opcional (sectores de ejemplo)
pnpm run db:seed-sectors
```

Detalle de base de datos: [docs/POSTGRES.md](docs/POSTGRES.md).

En el primer arranque se crea un usuario administrador bootstrap (credenciales solo del equipo; no se publican en el repositorio).

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/ALCANCE_MVP.md](docs/ALCANCE_MVP.md) | Alcance funcional MVP |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Arquitectura |
| [docs/POSTGRES.md](docs/POSTGRES.md) | Setup PostgreSQL + Drizzle |
| [docs/CLAUDE_CODE.md](docs/CLAUDE_CODE.md) | Guía operativa para Claude Code |
| [docs/ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md) | Gaps y orden de trabajo |
| [CLAUDE.md](CLAUDE.md) | Contexto raíz para agentes |

---

## CI

Push/PR a `main` → typecheck + build (`.github/workflows/ci.yml`).

---

## Estado actual

- ✅ Backend API + auth por sesión
- ✅ Schema Drizzle alineado al MVP (activos fijos, guardias con modalidad)
- ✅ Bootstrap superadmin + CI + docs para Claude Code
- ⚠️ Frontend de aplicación completa pendiente de consolidar
- ⚠️ Rutas API de módulos a completar / alinear con OpenAPI

---

**Equipo de desarrollo — Sanatorio del Salvador** · Uso interno exclusivo.
