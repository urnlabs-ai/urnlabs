**Docker Services Overview**

- Purpose: Describe the local Docker Compose stack, dependencies, and guidance for handling missing services and configuration issues.
- Files: `docker-compose-local.yml` (full local stack), `docker-compose.yml` (variant), `docker/prometheus.yml` (metrics).

**Architecture**

- Core Data: Postgres (`postgres:5432`), Redis (`redis:6379`).
- Node Services: `gateway:7000`, `api:7001`, `agents:7002`, `bridge:7003`, `dashboard:7004`.
- Observability: `prometheus:9090`, `grafana:3001`, `monitoring:7006`.
- Utilities: `mcp-integration:7007`, `testing:7008`, `security:7009`, web apps behind `nginx-web`.
- Network: All services share `urnlabs-network` for service-name DNS discovery.
- Health: Each service exposes `/health` and is configured with curl/wget based healthchecks.

**Missing Services**

- Context: The `urn-maestro` Go service is referenced historically but not implemented in this repository.
- Action Taken: All `urn-maestro` references in `docker-compose-local.yml` that could break builds are removed or commented. The Prometheus scrape job for `urn-maestro` is commented.
- Environment Variables: `MAESTRO_ENDPOINT` in `gateway`, `api`, `agents`, and `bridge` are commented out. If you implement `urn-maestro` later, reintroduce these as needed.

**urn-maestro Status**

- State: Disabled. Original build context pointed to `../urn-maestro-go`, which does not exist here.
- Expected Ports: `7005` (HTTP), `7015` (MCP).
- Re-enable Steps:
  - Add/restore the `urn-maestro` service block in `docker-compose-local.yml` with a valid build context and Dockerfile.
  - Uncomment or add `MAESTRO_ENDPOINT` as needed in downstream services.
  - Optionally re-enable the Prometheus job targeting `urn-maestro:7005` in `docker/prometheus.yml`.

**Troubleshooting Build Issues**

- Validate Compose: `bash scripts/validate-docker-compose.sh -f docker-compose-local.yml`.
- Auto-fix Common Issues: Append `--fix` to comment invalid depends_on entries, env lines referencing missing services, and services with broken build contexts.
- Common Symptoms:
  - Build context directory missing: comment out the service until the directory exists.
  - depends_on references unknown service: remove or update the dependency.
  - Healthcheck failures: ensure services bind to `0.0.0.0` and the port matches the service’s listen port.

**Development Workflow**

- Adding a Service:
  - Define under `services:` with `build.context`, `dockerfile`, `ports`, `environment`, `depends_on`, and a healthcheck.
  - Add Prometheus scraping job if metrics are exposed.
  - Run the validator script before committing.
- Updating Dependencies:
  - Prefer service-name URLs (e.g., `http://api:7001`) within the compose network.
  - Keep `depends_on` minimal and accurate; avoid circular chains.

**Service Management**

- Start Selected Services: `docker compose -f docker-compose-local.yml up -d postgres redis api gateway`.
- View Logs: `docker compose -f docker-compose-local.yml logs -f api`.
- Rebuild After Changes: `docker compose -f docker-compose-local.yml up -d --build <service>`.
- Metrics & Dashboards: Prometheus at `http://localhost:9090`, Grafana at `http://localhost:3001`.

**Notes**

- If you later introduce a Go-based `urn-maestro`, ensure its Docker image includes curl/wget for healthchecks, and expose `/health` and `/metrics` endpoints aligned with the rest of the stack.

