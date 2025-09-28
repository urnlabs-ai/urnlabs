# Urnlabs Security Scanner

A comprehensive vulnerability scanning service that provides automated security testing for applications and infrastructure. The scanner integrates multiple security tools to provide dependency scanning, secret detection, static analysis (SAST), and dynamic analysis (DAST).

## Features

### 🔍 Multi-Modal Scanning
- **Dependency Scanning**: Detects vulnerable dependencies using Snyk API and local databases
- **Secret Detection**: Finds exposed secrets using TruffleHog and custom patterns
- **Static Analysis (SAST)**: Code analysis using CodeQL, Semgrep, and ESLint
- **Dynamic Analysis (DAST)**: Runtime testing using OWASP ZAP and custom tests

### 🚀 Production-Ready
- **Redis-backed job queue** with BullMQ for scalable processing
- **Real-time WebSocket updates** for scan progress and results
- **Comprehensive reporting** in JSON, HTML, SARIF, and XML formats
- **RESTful API** with OpenAPI documentation
- **Docker containerization** with security tools pre-installed

### 📊 Advanced Analytics
- **Vulnerability trends** and risk scoring
- **OWASP Top 10 compliance** assessment
- **Executive dashboards** with actionable insights
- **Integration hooks** for CI/CD pipelines

## Quick Start

### Prerequisites
- Node.js 18+
- Redis server
- Docker (for containerized scanning tools)

### Installation

1. **Clone and install dependencies:**
```bash
git clone https://github.com/urnlabs/urnlabs-ai
cd urnlabs-ai/apps/security-scanner
pnpm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

3. **Start Redis:**
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

4. **Build and start:**
```bash
pnpm run build
pnpm start
```

### Development Mode
```bash
pnpm run dev
```

The API server will be available at `http://localhost:3000` with documentation at `http://localhost:3000/docs`.

## API Usage

### Start a Comprehensive Scan
```bash
curl -X POST http://localhost:3000/scans/full \
  -H "Content-Type: application/json" \
  -d '{
    "scanTypes": ["dependency", "secrets", "sast"],
    "repository": "/path/to/your/project",
    "priority": "high",
    "config": {
      "includeDevDependencies": true,
      "severity": ["critical", "high", "medium"],
      "generateReport": true,
      "notifyOnCritical": true
    }
  }'
```

### Check Scan Status
```bash
curl http://localhost:3000/scans/{scanId}/status
```

### Get Scan History
```bash
curl http://localhost:3000/scans/history?repository=/path/to/project&limit=10
```

### Get Vulnerability Trends
```bash
curl http://localhost:3000/analytics/trends/{repository}?days=30
```

## Scanning Types

### Dependency Scanning
Analyzes package manifests and lock files to identify vulnerable dependencies:

- **Supported ecosystems**: npm, pip, Maven, Go, Rust, Ruby
- **Data sources**: Snyk API, OSV database, local vulnerability DB
- **Features**: Transitive dependency analysis, fix version recommendations

### Secret Detection
Scans code repositories for exposed secrets and credentials:

- **Tools**: TruffleHog, custom regex patterns
- **Detection**: API keys, database URLs, private keys, tokens
- **Features**: Git history scanning, custom rule configuration

### Static Analysis (SAST)
Performs static code analysis to identify security vulnerabilities:

- **Tools**: CodeQL, Semgrep, ESLint security plugins
- **Languages**: JavaScript/TypeScript, Python, Java, Go, C#, C++
- **Features**: Custom rules, CWE mapping, remediation guidance

### Dynamic Analysis (DAST)
Tests running applications for runtime vulnerabilities:

- **Tools**: OWASP ZAP, custom security tests
- **Testing**: Security headers, CORS, XSS, SQL injection, directory traversal
- **Features**: Authenticated scanning, custom payloads

## Configuration

### Environment Variables
```bash
# Server Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=info

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Security Tool API Keys
SNYK_API_KEY=your_snyk_api_key
GITHUB_TOKEN=your_github_token

# OWASP ZAP Configuration
ZAP_API_KEY=changeme
ZAP_HOST=localhost
ZAP_PORT=8080

# CodeQL Configuration
CODEQL_PATH=/opt/codeql/codeql
```

### Scanner Configuration
Each scanner can be configured through the scan request:

```json
{
  "repository": "/path/to/project",
  "targetUrl": "https://app.example.com",
  "includeDevDependencies": true,
  "includeHistory": false,
  "severity": ["critical", "high", "medium"],
  "excludePatterns": ["node_modules/**", "*.test.js"],
  "generateReport": true,
  "notifyOnCritical": true
}
```

## Docker Deployment

### Build Image
```bash
docker build -t urnlabs-security-scanner .
```

### Run Container
```bash
docker run -d \
  --name security-scanner \
  -p 3000:3000 \
  -e REDIS_HOST=redis \
  -e SNYK_API_KEY=your_key \
  --link redis:redis \
  urnlabs-security-scanner
```

### Docker Compose
```yaml
version: '3.8'
services:
  security-scanner:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - SNYK_API_KEY=${SNYK_API_KEY}
    depends_on:
      - redis

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

## Integration

### CI/CD Pipeline Integration
Add to your GitHub Actions workflow:

```yaml
- name: Security Scan
  run: |
    curl -X POST $SCANNER_URL/scans/full \
      -H "Content-Type: application/json" \
      -d '{
        "scanTypes": ["dependency", "secrets", "sast"],
        "repository": "${{ github.workspace }}",
        "config": {
          "severity": ["critical", "high"],
          "generateReport": true
        }
      }'
```

### WebSocket Events
Connect to `ws://localhost:3000/ws/scans` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/scans');

ws.on('message', (data) => {
  const event = JSON.parse(data);

  switch(event.type) {
    case 'scanCompleted':
      console.log('Scan completed:', event.data);
      break;
    case 'criticalVulnerabilities':
      console.log('Critical vulnerabilities found:', event.data);
      break;
    case 'scanFailed':
      console.log('Scan failed:', event.data);
      break;
  }
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Scanner API                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Fastify API   │  │   WebSocket     │  │   Swagger   │ │
│  │     Server      │  │     Server      │  │    Docs     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                 Scan Orchestrator                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              BullMQ Job Queue (Redis)                  │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Security Scanners                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │  Dependency  │ │    Secret    │ │     SAST     │        │
│  │   Scanner    │ │   Scanner    │ │   Scanner    │        │
│  │   (Snyk)     │ │ (TruffleHog) │ │  (CodeQL)    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │     DAST     │ │   Custom     │ │ Vulnerability│        │
│  │   Scanner    │ │    Rules     │ │   Reporter   │        │
│  │ (OWASP ZAP)  │ │   Engine     │ │              │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Security Tools

### Required Tools
- **Node.js & npm**: Runtime and package management
- **TruffleHog**: Secret detection in Git repositories
- **Semgrep**: Static analysis with community rules
- **OWASP ZAP**: Dynamic application security testing

### Optional Tools
- **CodeQL**: Advanced static analysis (requires license)
- **Snyk**: Commercial vulnerability database
- **Docker**: Containerized tool execution

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [https://docs.urnlabs.ai/security-scanner](https://docs.urnlabs.ai/security-scanner)
- **Issues**: [GitHub Issues](https://github.com/urnlabs/urnlabs-ai/issues)
- **Community**: [Discord](https://discord.gg/urnlabs)

---

Built with ❤️ by the [Urnlabs](https://urnlabs.ai) team.