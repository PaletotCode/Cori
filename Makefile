SHELL := /bin/bash
COMPOSE_FILE := infra/docker-compose.yml
PYTHON := backend/.venv/bin/python
PIP := backend/.venv/bin/pip

.PHONY: bootstrap env install up down health migrate seed lint format typecheck test build pipeline clean

env:
	@test -f .env || cp .env.example .env
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f front-end/.env || cp front-end/.env.example front-end/.env

install:
	python3 -m venv backend/.venv
	$(PIP) install --upgrade pip
	$(PIP) install -e "backend[dev]"
	npm --prefix front-end install

bootstrap: env install up

up:
	docker compose -f $(COMPOSE_FILE) up -d --build

down:
	docker compose -f $(COMPOSE_FILE) down --remove-orphans

health:
	curl -fsS http://localhost:8000/health | python3 -m json.tool

migrate:
	backend/.venv/bin/alembic -c backend/alembic.ini upgrade head

seed:
	backend/.venv/bin/python backend/seed_dev_data.py

lint:
	backend/.venv/bin/ruff check backend/app backend/tests
	npm --prefix front-end run lint

format:
	backend/.venv/bin/ruff format backend/app backend/tests
	npm --prefix front-end run format

typecheck:
	backend/.venv/bin/mypy backend/app
	npm --prefix front-end run typecheck

test:
	backend/.venv/bin/pytest backend/tests -q
	npm --prefix front-end run test -- --runInBand

build:
	docker compose -f $(COMPOSE_FILE) build api worker

pipeline: lint typecheck test build

clean:
	docker compose -f $(COMPOSE_FILE) down -v --remove-orphans
	rm -rf backend/.venv front-end/node_modules front-end/dist
