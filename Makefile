SHELL := /bin/bash
COMPOSE_FILE := infra/docker-compose.yml
PYTHON := backend/.venv/bin/python
PIP := backend/.venv/bin/pip
FRONTEND_DIR := front-end
IOS_DEVICE ?= iPhone 17 Pro Max
EXPO_URL ?= exp://127.0.0.1:8081

.PHONY: help bootstrap env install up down health migrate seed lint format typecheck test build pipeline clean \
	run-ios run-ios-clean ios-open ios-refresh ios-refresh-hard ios-sim-open ios-sim-restart ios-cache-clean \
	ios-devices ios-boot

help:
	@echo ""
	@echo "Comandos principais"
	@echo "  make run-ios         # sobe backend + abre no iOS Simulator via Expo Go"
	@echo "  make run-ios-clean   # igual ao run-ios, limpando cache do Expo/Metro antes"
	@echo "  make ios-refresh     # refresh rapido (Cmd+R no Simulator)"
	@echo "  make ios-refresh-hard# fecha/reabre Expo Go na URL EXPO_URL"
	@echo "  make ios-cache-clean # limpa cache Metro/Expo/watchman"
	@echo "  make ios-devices     # lista iPhones disponiveis no Simulator"
	@echo "  make ios-boot IOS_DEVICE=\"iPhone 17 Pro\""
	@echo "                       # reinicia/boota um modelo especifico"
	@echo "  make ios-sim-open    # abre o iOS Simulator"
	@echo "  make ios-sim-restart # reinicia o Simulator"
	@echo "  make up              # sobe backend/redis/postgres via docker"
	@echo ""
	@echo "Selecao de device:"
	@echo "  make run-ios IOS_DEVICE=\"iPhone 17 Pro Max\""
	@echo "  make run-ios IOS_DEVICE=\"iPhone 16\""
	@echo ""

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

ios-sim-open:
	@open -a Simulator
	@xcrun simctl boot "$(IOS_DEVICE)" >/dev/null 2>&1 || true

ios-sim-restart:
	@xcrun simctl shutdown all >/dev/null 2>&1 || true
	@open -a Simulator
	@xcrun simctl boot "$(IOS_DEVICE)" >/dev/null 2>&1 || true

ios-devices:
	@echo "iPhones disponiveis:"
	@xcrun simctl list devices available | grep -E "iPhone" | sed -E 's/^[[:space:]]+//'

ios-boot:
	@xcrun simctl list devices available | grep -F "$(IOS_DEVICE)" >/dev/null || \
		(echo "Device nao encontrado: $(IOS_DEVICE)"; echo "Use: make ios-devices"; exit 1)
	@xcrun simctl shutdown all >/dev/null 2>&1 || true
	@open -a Simulator
	@xcrun simctl boot "$(IOS_DEVICE)" >/dev/null 2>&1 || true
	@xcrun simctl bootstatus "$(IOS_DEVICE)" -b >/dev/null 2>&1 || true
	@echo "Simulator pronto: $(IOS_DEVICE)"

ios-cache-clean:
	@pkill -f "expo start" >/dev/null 2>&1 || true
	@pkill -f "metro" >/dev/null 2>&1 || true
	@watchman watch-del-all >/dev/null 2>&1 || true
	@rm -rf $(FRONTEND_DIR)/.expo $(FRONTEND_DIR)/.expo-shared $(FRONTEND_DIR)/node_modules/.cache
	@rm -rf /tmp/metro-* /tmp/haste-map-* /tmp/expo-* "$${TMPDIR}/metro-*" "$${TMPDIR}/haste-map-*"
	@echo "Caches do Expo/Metro limpos."

ios-open: ios-sim-open
	@xcrun simctl openurl booted "$(EXPO_URL)"

ios-refresh:
	@osascript -e 'tell application "Simulator" to activate' \
		-e 'tell application "System Events" to keystroke "r" using command down'

ios-refresh-hard:
	@xcrun simctl terminate booted host.exp.Exponent >/dev/null 2>&1 || true
	@sleep 1
	@xcrun simctl openurl booted "$(EXPO_URL)"

run-ios: up ios-boot
	@cd $(FRONTEND_DIR) && npx expo start --ios --go

run-ios-clean: up ios-cache-clean ios-boot
	@cd $(FRONTEND_DIR) && npx expo start --ios --go -c
