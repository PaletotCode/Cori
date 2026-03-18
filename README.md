# Cori V2 Monorepo

Fundacao inicial do Cori V2 em arquitetura monorepo com:

- `backend/`: FastAPI + SQLAlchemy + worker.
- `front-end/`: Expo + TypeScript bootstrap.
- `infra/`: Docker Compose (API, Worker, Redis, PostgreSQL 17.6).

## Bootstrap local (comando unico)

```bash
make bootstrap
```

O comando prepara `.env`, instala dependencias e sobe toda a stack local.

## Comandos principais

```bash
make down       # derruba a stack
make health     # healthcheck da API
make pipeline   # lint + typecheck + test + build
make clean      # limpa venv/node_modules/volumes
```

## Convencao de commit

Usar Conventional Commits conforme [`docs/COMMIT_CONVENTION.md`](docs/COMMIT_CONVENTION.md).
