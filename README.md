# Salvador-Connect

Sistema interno del **Sanatorio del Salvador**.

## Stack

- Frontend: React + Vite (`apps/web`)
- Backend: Express + TypeScript (`apps/api`)
- DB: PostgreSQL + Drizzle (`packages/db`)
- Deploy: Docker Compose (Linux / Proxmox)

## Documentación para agentes / Claude Code

| Archivo | Uso |
|---------|-----|
| [CLAUDE.md](CLAUDE.md) | **Entrada principal para Claude Code** |
| [AGENTS.md](AGENTS.md) | Resumen corto |
| [.claude/skills/](.claude/skills/) | Skills por módulo |
| [docs/CLAUDE_CODE.md](docs/CLAUDE_CODE.md) | Guía operativa |
| [docs/ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md) | Qué está hecho |
| [docs/ALCANCE_MVP.md](docs/ALCANCE_MVP.md) | Alcance funcional |
| [docs/PRODUCCION.md](docs/PRODUCCION.md) | Deploy |

## Módulos prioritarios

1. Administración (vencimientos + fiscal local)
2. Guardias Médicas
3. Usuarios / Configuración

## Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```

Uso interno — Sanatorio del Salvador.
