# The commands this project already had, in one place.
#
# Why make and not just: make is installed on every machine this repository is developed on
# (GNU make 3.81 here), `just` is not, and every target below is one line. Nothing here is a new
# command — each recipe calls something that already existed in `run.sh`, the READMEs or the CI
# files, so a Makefile that drifted from them would be visibly wrong rather than quietly
# different. `make help` lists them.
#
# `make check` is the whole suite; the individual targets are there for when one of them fails.

SHELL := /bin/sh

# The frontend's production build refuses to guess this address, so it is passed here and can
# be overridden: make build BACKEND_URL=http://backend:5174
BACKEND_URL ?= http://127.0.0.1:5174

# The API tour talks to a running backend. `make dev` in another terminal, then `make api-tour`.
BASE_URL ?= http://127.0.0.1:5174

# Note on stopping: `make dev` runs `./run.sh`, and Ctrl+C there stops both services — that is
# the launcher's contract. `./run.sh` only understands the `status` and `stop` verbs through the
# WSL launcher it delegates to (frontend/README.md); on macOS and Linux it starts the servers
# whatever the arguments are, so there is no `stop` target here rather than one that would start
# a second copy of the stack. `make status` reports who holds the ports without touching them.

# The browser suite finds Chrome in the usual places on Linux and Windows but not on macOS;
# set CHROME_PATH to your Chrome for Testing binary if `make smoke` cannot find it.
CHROME_PATH ?=

.DEFAULT_GOAL := help
.PHONY: help dev status seed seed-demo seed-showcase build lint types test test-race smoke check pin-check compose-config api-tour

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
	docker compose config

api-tour: ## Call the API end to end against a running backend
	BASE_URL=$(BASE_URL) sh scripts/api-tour.sh
