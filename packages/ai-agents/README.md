@urnlabs/ai-agents

Production-ready AI agent library used by the Agents service. Provides agent abstractions, orchestrator helpers, and provider integrations.

Features
- Agent primitives and factories (code review, architecture, deployment, testing)
- Provider clients (Claude, OpenAI) with pluggable keys
- Typed inputs/outputs with Zod validation
- Queue-friendly task interfaces

Install (workspace)
- Already included in the monorepo. Build/test with pnpm filters:
  - Build: `pnpm -w --filter @urnlabs/ai-agents build`
  - Dev (watch): `pnpm -w --filter @urnlabs/ai-agents dev`
  - Test: `pnpm -w --filter @urnlabs/ai-agents test`
  - Coverage: `pnpm -w --filter @urnlabs/ai-agents test:coverage`

Usage (example)
```ts
import { CodeReviewAgent } from '@urnlabs/ai-agents';

const agent = new CodeReviewAgent({
  claudeApiKey: process.env.CLAUDE_API_KEY,
});

const report = await agent.review({
  files: [
    { path: 'src/server.ts', content: '...' },
  ],
  context: { framework: 'fastify', db: 'postgres' },
});

console.log(report.summary);
```

Environment
- `CLAUDE_API_KEY` (optional)
- `OPENAI_API_KEY` (optional)
- For integration tests, a running Redis/Postgres is not required unless specified.

Notes
- The Agents service (`apps/agents`) consumes this library for runtime orchestration.
- For DB-backed state, use the API/Agents services; the library itself is stateless.

