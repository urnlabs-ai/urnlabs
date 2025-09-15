Gateway Service

Overview
- Central entry point that proxies to internal services (API, Agents, Bridge, Maestro, etc.).
- Adds health gating, request tracing, and standardized headers.

Key Env Vars
- `AGENTS_ENDPOINT`: Upstream Agents service URL (default `http://agents:7002`)
- `API_ENDPOINT`: Upstream API service URL (default `http://api:7001`)

Agents Quickstart (via Gateway)
- The gateway exposes `/agents` prefix and strips it before proxying upstream. Since the Agents service also prefixes its routes with `/agents`, use a double prefix when calling through the gateway.

Examples
```bash
# Health
curl -s http://localhost:7000/agents/health | jq
curl -s http://localhost:7000/agents/health/detailed | jq

# Agents list (Agents service defines routes under /agents)
curl -s http://localhost:7000/agents/agents/status | jq

# Running tasks
curl -s http://localhost:7000/agents/agents/tasks | jq

# Execute a workflow
curl -s -X POST http://localhost:7000/agents/workflows/execute \
  -H 'content-type: application/json' \
  -d '{"workflowId":"feature-dev","input": {"title":"Docs quickstart"}}' | jq

# Workflow status
curl -s http://localhost:7000/agents/workflows/<workflowRunId>/status | jq
```

Notes
- Health checks are performed by the gateway; if upstream is unhealthy, the gateway can return 503.
- For direct access (bypassing gateway), call the Agents service at its port (e.g., `http://localhost:7002/agents/status`).

