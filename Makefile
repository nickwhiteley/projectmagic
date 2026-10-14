.PHONY: install dev test test-unit test-e2e check lint format build

install: node_modules
node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

dev: install
	npm run dev

test: test-unit check lint

test-unit: install
	npx vitest --run

test-e2e: install
	npm run test:e2e

check: install
	npm run check

lint: install
	npm run lint

format: install
	npm run format

build: install
	npm run build
