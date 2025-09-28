# Security Scanning Configuration

This document outlines the security scanning tools integrated into our CI/CD pipeline and how to configure them.

## Required GitHub Secrets

Add these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

### Security Scanning Tools
- `SNYK_TOKEN`: Snyk API token for vulnerability scanning
  - Get from: https://app.snyk.io/account (Account Settings → General → Auth Token)
  - Required for: Dependency vulnerability scanning

### Container Registry
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions
  - Used for: Docker image registry access and SARIF uploads

### Optional Monitoring (if using external services)
- `SLACK_WEBHOOK_URL`: For deployment notifications
- `PAGERDUTY_INTEGRATION_KEY`: For critical security alerts

## Security Scanning Tools Overview

### 1. Snyk (Dependency Vulnerability Scanning)
- **Purpose**: Scans npm packages for known vulnerabilities
- **Configuration**: `.snyk` file in repository root
- **Threshold**: Fails on high/critical vulnerabilities
- **Output**: SARIF format uploaded to GitHub Security tab

### 2. Trivy (Filesystem & Container Scanning)
- **Purpose**: Scans both filesystem and Docker images
- **Configuration**: `.trivyignore` file for exclusions
- **Threshold**: Critical, High, and Medium severity vulnerabilities
- **Output**: SARIF format uploaded to GitHub Security tab

### 3. OWASP Dependency Check
- **Purpose**: Comprehensive dependency vulnerability analysis
- **Configuration**: `dependency-check-config.xml` and suppressions file
- **Threshold**: CVSS score ≥ 7.0 fails the build
- **Output**: HTML, JSON, XML, and SARIF reports

### 4. CodeQL (Static Application Security Testing - SAST)
- **Purpose**: Static code analysis for security vulnerabilities
- **Configuration**: Automatic detection for JavaScript/TypeScript
- **Coverage**: Security-focused code patterns and anti-patterns
- **Output**: Integrated with GitHub Security tab

## Security Test Integration

### Comprehensive Security Test Suite
The pipeline integrates our comprehensive security tests from Task 2.6:

- **JWT Security Tests**: Token manipulation, algorithm confusion
- **RBAC Tests**: Privilege escalation prevention
- **MFA Tests**: Multi-factor authentication bypass detection
- **SSO Tests**: SAML/OAuth security validation
- **Rate Limiting**: Brute force protection
- **Session Security**: CSRF and session hijacking protection
- **Vulnerability Scanning**: Automated penetration testing patterns
- **Password & Headers**: Security policy enforcement

### Test Database Setup
- Uses Docker PostgreSQL for isolated testing
- Automatic database setup and cleanup
- Environment-specific configurations

## Security Gates and Thresholds

### Build Failure Conditions
- ❌ **Critical vulnerabilities** detected by any scanner
- ❌ **High-severity vulnerabilities** in production dependencies
- ❌ **CVSS 7.0+** vulnerabilities in OWASP Dependency Check
- ❌ **Security test failures** in our test suite
- ❌ **Static analysis** security issues in CodeQL

### Warning Conditions (non-blocking)
- ⚠️ **Medium severity** vulnerabilities in development dependencies
- ⚠️ **Low severity** vulnerabilities with suppression dates
- ⚠️ **Performance degradation** in security test execution times

## Performance Requirements

### API Response Time Targets
- **Health endpoints**: < 50ms (p99)
- **Authentication**: < 200ms (p99)
- **API endpoints**: < 200ms (p99) - Production requirement
- **Database queries**: < 100ms (p95)

### Load Testing Scenarios
1. **Smoke Test**: 1 user, 30 seconds
2. **Load Test**: 10-20 users, 14 minutes
3. **Stress Test**: 50-100 users, 9 minutes

## Monitoring and Alerting

### SARIF Integration
All security scanning results are uploaded in SARIF format to GitHub's Security tab for centralized vulnerability management.

### Artifact Storage
- Security test results: JUnit XML format
- Performance results: JSON format
- Dependency reports: Multiple formats (HTML, JSON, XML)
- Build artifacts: 30-day retention

## Troubleshooting

### Common Issues

1. **Snyk Token Issues**
   ```bash
   Error: Authentication failed
   ```
   - Verify `SNYK_TOKEN` secret is set correctly
   - Check token permissions in Snyk dashboard

2. **False Positives**
   - Add suppressions to `.trivyignore`
   - Update `dependency-check-suppressions.xml`
   - Update `.snyk` ignore rules

3. **Performance Test Failures**
   - Check service health before tests
   - Verify Docker Compose services are running
   - Review k6 test thresholds in `performance/k6-config.js`

### Security Contact
For security-related issues or questions about the scanning tools:
- Create an issue with `security` label
- Review security scan results in GitHub Security tab
- Check pipeline logs for detailed error information

## Compliance and Reporting

The security scanning pipeline supports compliance requirements for:
- **SOC 2**: Automated vulnerability management
- **ISO 27001**: Security monitoring and incident response
- **PCI DSS**: Regular security scanning (if applicable)

All scan results are archived and available for compliance audits.