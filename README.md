# UrnLabs AI

UrnLabs is an AI agent and workflow project. This repository is a pnpm monorepo containing Node.js services, a React dashboard, an Astro website, and shared packages.

> **Project status:** This is a development project. The manifests, source tree, and Compose files show what is configured in the codebase; they do not establish that every service runs end to end or is ready for production. Runtime behavior and deployment readiness have not been independently verified for this README.

## Repository layout

- `apps/api` — Fastify API service, with route, middleware, and service modules.
- `apps/agents` — agent service with orchestration, queue, route, and service modules.
- `apps/gateway` — gateway service with routing, middleware, security, and resilience modules.
- `apps/bridge` — Node.js bridge service.
- `apps/dashboard` — React/Vite dashboard application.
- `apps/urnlabs` — Astro website.
- `packages/*` — shared packages, including AI agents, UI, API client, monitoring, and integrations.
- `docker-compose-*.yml` and `docker/` — local development and service configuration.

The repository also contains areas such as analytics, workflow engine, security, and integrations. Their presence in the tree should not be read as a claim that each is complete or production-ready.

## Getting started

You need Node.js, pnpm 9 or compatible, and Docker for the containerized setup. Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/urnlabs-ai/urnlabs.git
cd urnlabs
pnpm install
```

Copy the example environment file and set the values required by the service you plan to run:

```bash
cp .env.example .env
```

The root manifest provides these commands:

```bash
pnpm dev:api
pnpm dev:agents
pnpm dev:bridge
pnpm build:all
pnpm test:all
```

The API, Agents, and Bridge services depend on external configuration and may require PostgreSQL, Redis, or provider credentials. For containerized development, `docker-compose-nodejs.yml` expects PostgreSQL and Redis to be reachable from the containers. See [Docker Node.js setup](./DOCKER-NODEJS-SETUP.md) and [dependency setup](./SETUP-DEPENDENCIES.md). A broader local Compose configuration is documented in [DOCKER-COMPOSE-LOCAL.md](./DOCKER-COMPOSE-LOCAL.md); check the Compose file and service-specific docs for current availability before relying on every listed service.

To run the website directly:

```bash
pnpm --filter @urnlabs/website dev
```

## Workspace commands

These scripts are declared in the root `package.json`:

| Command | Purpose |
| --- | --- |
| `pnpm dev:api` | Start the API development server |
| `pnpm dev:agents` | Start the Agents development server |
| `pnpm dev:bridge` | Start the Bridge development server |
| `pnpm build:packages` | Build packages in the workspace |
| `pnpm build:apps` | Build apps in the workspace |
| `pnpm build:all` | Build packages, then apps |
| `pnpm test:all` | Run package and app test scripts recursively |

Service-level scripts, such as `build`, `test`, `lint`, and `typecheck`, vary by package. Check that package's `package.json` before using them.

## Current scope and roadmap

The repository contains code and configuration for API, agent, gateway, bridge, dashboard, and website applications. Compose files describe local service arrangements, including a Node.js stack and a larger local stack. The legacy `urn-maestro` service is documented as disabled and unavailable in this repository; see [Docker services](./DOCKER-SERVICES.md).

Roadmap areas include an advanced workflow builder, email notifications, file storage, SSO, and multi-region support. Confirm implementation status in the relevant code and documentation before depending on these capabilities.

## Contributing

See [AGENTS.md](./AGENTS.md) for repository-specific guidance. Before relying on a command or service description, verify it against the relevant package manifest and Compose file; some repository documentation may lag behind the code.
