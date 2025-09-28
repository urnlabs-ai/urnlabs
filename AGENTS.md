# Repository Guidelines

## Project Structure & Module Organization
Monorepo managed by `pnpm` workspaces. Web apps live in `worktrees/urnlabs-ai`, `worktrees/usmanramzan-ai`, and `worktrees/eprecisio-com`; shared UI in `worktrees/shared-components` and `worktrees/design-system`. Libraries and configs sit under `packages/*`, with `packages/ai-agents` hosting the core agent SDK and tests in `src/__tests__`. Docker assets live in `docker/`; helper scripts in `scripts/`.

## Build, Test, and Development Commands
Install dependencies with `pnpm install`. Run the URNLabs Astro site via `pnpm dev:urnlabs` or `cd worktrees/urnlabs-ai && pnpm dev`. Build every site using `pnpm build:all`; build only the agent library with `pnpm -w --filter @urnlabs/ai-agents build`. Execute tests for the agent package using `pnpm -w --filter @urnlabs/ai-agents test` and add `:coverage` for reports. Spin up the local Docker stack with `docker compose -f docker-compose-local.yml up --build`.

## Coding Style & Naming Conventions
Prefer TypeScript with Astro/React frontends. Follow shared ESLint/Prettier rules from `@urnlabs/config`: 2-space indentation, no trailing whitespace, and sorted imports where enforced. Name components in PascalCase (`ButtonGroup.tsx`), directories in kebab-case, interfaces/types in PascalCase, and constants in UPPER_SNAKE_CASE. Run `pnpm lint` or `pnpm lint:fix` in each workspace before opening a PR.

## Testing Guidelines
Vitest drives unit tests under `packages/ai-agents/src/__tests__/**/*.test.ts`. Keep unit tests fast and mock external services by default; move slower scenarios to `test:integration`. Maintain >=80% coverage across lines, branches, functions, and statements (`vitest.config.ts`). Use descriptive filenames mirrored after implementations, e.g. `agent-runner.test.ts`.

## Commit & Pull Request Guidelines
Write imperative commit messages scoped to the change, e.g. `Add Redis health probe`. Each PR should describe motivation, link relevant issues, and note test results. Include screenshots for UI/UIX updates and document any Docker or env variable impacts.

## Security & Configuration Tips
Never commit secrets. Copy `.env.example` to configure local runs and document new keys such as `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, and `CLAUDE_API_KEY`. Health checks hit `/health` or `/health/ready`; refer to `DOCKER-SERVICES.md` before re-enabling legacy services like `urn-maestro`.

## Architecture Overview
The agents service in `apps/agents` exposes REST and WebSocket endpoints at `http://localhost:3001` (`/health`, `/agents/status`, workflow routes). PostgreSQL and Redis back queues via BullMQ; shared UI packages integrate across sites to keep design consistent.
