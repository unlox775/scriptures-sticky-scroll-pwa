.PHONY: build run-local help

# Default port for Vite dev server
PORT ?= 5173
URL := http://localhost:$(PORT)

help:
	@echo "Available targets:"
	@echo "  make build     - Run build:data and vite build to docs/"
	@echo "  make run-local - Build to docs/, start dev server, and open in browser"

build:
	@if [ ! -d "node_modules" ]; then npm install; fi
	@npm run build:data
	@npm run build

run-local:
	@echo "Killing any existing servers on port $(PORT)..."
	@lsof -ti:$(PORT) | xargs kill -9 2>/dev/null || true
	@sleep 0.5
	@$(MAKE) build
	@echo "Starting dev server..."
	@bash -c 'trap "kill -9 $$SERVER_PID 2>/dev/null; lsof -ti:$(PORT) | xargs kill -9 2>/dev/null || true; exit" INT TERM; \
	./node_modules/.bin/vite --port $(PORT) & \
	SERVER_PID=$$!; \
	ATTEMPTS=0; \
	while [ $$ATTEMPTS -lt 20 ]; do \
		if lsof -ti:$(PORT) > /dev/null 2>&1; then \
			echo "Server ready at $(URL)"; \
			sleep 0.5; \
			open $(URL) 2>/dev/null || xdg-open $(URL) 2>/dev/null || start $(URL) 2>/dev/null || echo "Open $(URL) manually"; \
			wait $$SERVER_PID; exit 0; \
		fi; \
		ATTEMPTS=$$((ATTEMPTS + 1)); \
		sleep 0.5; \
	done; \
	echo "Server failed to start."; kill $$SERVER_PID 2>/dev/null || true; exit 1'
