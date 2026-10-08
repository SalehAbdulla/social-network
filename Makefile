SHELL := /bin/sh

BACKEND_URL ?= http://127.0.0.1:5174

BASE_URL ?= http://127.0.0.1:5174

CHROME_PATH ?=

.DEFAULT_GOAL := help
.PHONY: help dev status seed seed-demo seed-showcase build lint types test test-race smoke check pin-check compose-config images compose-up api-tour

help: ## Show this list
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start the backend and the frontend; Ctrl+C stops both
	./run.sh

status: ## Report which process holds each port
	@for port in 4000 5174; do \
		holder=$$(lsof -nP -iTCP:$$port -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
		if [ -n "$$holder" ]; then \
			printf 'port %s held by %s: ' "$$port" "$$holder"; \
			ps -p "$$holder" -o command= 2>/dev/null || echo 'unknown process'; \
		else \
			printf 'port %s free\n' "$$port"; \
		fi; \
	done

seed: ## Create the local development account (dummy@example.com)
	cd backend && go run ./cmd/seed

seed-demo: ## Create both development accounts, for flows that need two people
	cd backend && go run ./cmd/seed -demo

seed-showcase: ## Seed the full showcase dataset: 20+ members, posts, comments, stories, groups, chats
	cd backend && go run ./cmd/seed -showcase

build: ## Build the backend and the frontend
	cd backend && go build ./...
	cd frontend && BACKEND_URL=$(BACKEND_URL) npm run build

lint: ## Lint the frontend
	cd frontend && npm run lint

types: ## Type-check the frontend
	cd frontend && npx tsc --noEmit

test: ## Run the Go tests, including the query-plan check
	cd backend && go test ./...

test-race: ## Run the session, reset and websocket tests under the race detector
	cd backend && go test ./cmd/ -count=1 -race

smoke: ## Run the browser suite (needs Chrome; see CHROME_PATH above)
	cd frontend && CHROME_PATH="$(CHROME_PATH)" npm run test:integration

check: build lint types test ## Everything CI runs on a push, plus the query-plan check

pin-check: ## Report whether the base-image pins still match their tags
	node scripts/pin-base-images.mjs

compose-config: ## Validate compose.yaml (client-side; needs no daemon)
	./scripts/build-images.sh --check

images: ## Build both Docker images (needs a reachable daemon)
	./scripts/build-images.sh

compose-up: ## Build both Docker images and start the stack
	./scripts/build-images.sh --up

api-tour: ## Call the API end to end against a running backend
	BASE_URL=$(BASE_URL) sh scripts/api-tour.sh
