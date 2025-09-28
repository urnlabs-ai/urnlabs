# Blue-Green Deployment Strategy for Urnlabs AI Platform

## Overview

This document describes the implementation of a zero-downtime blue-green deployment strategy for the Urnlabs AI Platform. The strategy ensures seamless deployments with automated rollback capabilities and comprehensive validation.

## Architecture

### Blue-Green Deployment Components

1. **Docker Swarm Orchestration**
   - Blue and green environments running in parallel
   - Load balancer (Nginx) for traffic switching
   - Health monitoring and automated failover

2. **Service Infrastructure**
   - API Service (Port 7001)
   - Agents Service (Port 7002)
   - Gateway Service (Port 7000)
   - Bridge Service (Port 7003)
   - Dashboard Service (Port 7004)

3. **Supporting Services**
   - PostgreSQL (Primary + Read Replicas)
   - Redis (Master + Replicas)
   - Nginx Load Balancer
   - Prometheus + Grafana Monitoring

## Deployment Process

### 1. Pre-Deployment Setup

```bash
# Initialize Docker Swarm and infrastructure
./scripts/setup-swarm.sh production

# Verify swarm status
docker node ls
docker service ls
```

### 2. Blue-Green Deployment Execution

```bash
# Deploy all services
./scripts/blue-green-deploy.sh production all 300 true

# Deploy specific services
./scripts/blue-green-deploy.sh production "api,agents" 300 true
```

### 3. Manual Rollback (if needed)

```bash
# Emergency rollback all services
./scripts/rollback-deployment.sh production all 120

# Rollback specific services
./scripts/rollback-deployment.sh production "api,gateway" 120
```

## Automated CI/CD Integration

### GitHub Actions Workflow

The deployment is integrated into `.github/workflows/platform-ci-cd.yml`:

1. **Security Scanning**: Vulnerability detection and SAST analysis
2. **Build & Test**: Compile and test all services
3. **Docker Images**: Build and scan container images
4. **Performance Testing**: Baseline performance validation
5. **Blue-Green Deployment**: Zero-downtime production deployment
6. **Post-Deployment Validation**: Health checks and smoke tests

### Deployment Triggers

- **Automatic**: Push to `main` branch triggers staging deployment
- **Manual**: Workflow dispatch for production deployments
- **Service-Specific**: Deploy individual services via workflow inputs

## Configuration Files

### 1. Deployment Scripts

- `scripts/blue-green-deploy.sh` - Main deployment orchestration
- `scripts/setup-swarm.sh` - Infrastructure initialization
- `scripts/rollback-deployment.sh` - Emergency rollback procedures

### 2. Load Balancer Configuration

- `nginx/nginx.production.conf` - Production load balancer config
- `nginx/nginx.staging.conf` - Staging load balancer config

### 3. Container Orchestration

- `docker-compose.platform-production.yml` - Production services
- `docker-compose.platform-staging.yml` - Staging services

## Traffic Switching

### Nginx Configuration

The load balancer uses upstream definitions for blue/green switching:

```nginx
# Blue Environment
upstream api-production-blue {
    server api-production-blue:7001;
}

# Green Environment
upstream api-production-green {
    server api-production-green:7001;
}

# Active Selection (dynamically updated)
upstream api-active {
    server api-production-blue:7001;  # or green
}
```

### Switching Process

1. **Deploy to Inactive Environment**: Deploy new version to green if blue is active
2. **Health Validation**: Comprehensive health checks on new deployment
3. **Traffic Switch**: Update Nginx configuration to route to new environment
4. **Validation**: Post-switch smoke tests and monitoring
5. **Cleanup**: Scale down old environment after successful validation

## Health Checks and Monitoring

### Service Health Endpoints

All services expose `/health` endpoints for monitoring:

- Gateway: `http://localhost:7000/health`
- API: `http://localhost:7001/health`
- Agents: `http://localhost:7002/health`
- Bridge: `http://localhost:7003/health`
- Dashboard: `http://localhost:7004/health`

### Performance Validation

K6 performance tests validate deployments against baselines:

```javascript
export const options = {
    thresholds: {
        http_req_duration: ['p(95)<800ms'],
        http_req_failed: ['rate<0.01'],
    },
};
```

### Monitoring Integration

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Nginx Status**: Load balancer monitoring
- **Docker Health**: Container health tracking

## Security Considerations

### Deployment Security

1. **Image Scanning**: Trivy and Snyk vulnerability scanning
2. **SAST Analysis**: CodeQL static analysis
3. **Dependency Checking**: OWASP dependency analysis
4. **Security Headers**: Comprehensive HTTP security headers
5. **Rate Limiting**: API and traffic protection

### Network Security

- **TLS Termination**: SSL/TLS at load balancer
- **Internal Networks**: Docker overlay networks for service isolation
- **Access Control**: IP-based restrictions for monitoring endpoints
- **Secret Management**: Docker secrets for sensitive data

## Rollback Strategy

### Automatic Rollback Triggers

- Health check failures during deployment
- Performance degradation beyond thresholds
- Smoke test failures after traffic switch
- Manual intervention via workflow dispatch

### Rollback Process

1. **Detection**: Automated failure detection or manual trigger
2. **Traffic Switch**: Immediate revert to previous environment
3. **Validation**: Confirm rollback success with health checks
4. **Cleanup**: Scale down failed deployment
5. **Notification**: Alert teams of rollback completion

## Best Practices

### Development Workflow

1. **Branch Strategy**: Use feature branches with PR reviews
2. **Testing**: Comprehensive unit, integration, and E2E tests
3. **Staging First**: Always deploy to staging before production
4. **Gradual Rollout**: Consider canary deployments for high-risk changes

### Operational Procedures

1. **Monitoring**: Watch metrics during and after deployments
2. **Documentation**: Maintain deployment logs and runbooks
3. **Team Coordination**: Coordinate deployments with team
4. **Backup Plans**: Always have rollback procedures ready

### Performance Optimization

1. **Resource Allocation**: Appropriate CPU/memory limits
2. **Connection Pooling**: Database and Redis connection management
3. **Caching Strategy**: Implement appropriate caching layers
4. **CDN Integration**: Static asset delivery optimization

## Troubleshooting Guide

### Common Issues

1. **Service Won't Start**
   ```bash
   # Check service logs
   docker service logs service-name-production-blue

   # Check service details
   docker service inspect service-name-production-blue
   ```

2. **Health Check Failures**
   ```bash
   # Test health endpoint directly
   curl -v http://localhost:7001/health

   # Check service connectivity
   docker exec -it container-id curl localhost:7001/health
   ```

3. **Traffic Not Switching**
   ```bash
   # Verify nginx configuration
   docker exec nginx-production nginx -t

   # Check upstream status
   curl http://localhost:8080/nginx_status
   ```

4. **Database Connection Issues**
   ```bash
   # Check database connectivity
   docker exec api-production-blue pg_isready -h postgres-primary

   # Verify environment variables
   docker service inspect api-production-blue
   ```

### Recovery Procedures

1. **Complete Environment Failure**
   - Use emergency rollback script
   - Scale up previous environment manually if needed
   - Investigate root cause before next deployment

2. **Partial Service Failure**
   - Rollback specific failed services
   - Continue with successful services
   - Address failures incrementally

3. **Database Migration Issues**
   - Use migration rollback procedures
   - Restore from backup if necessary
   - Coordinate with DBA team for complex issues

## Metrics and Monitoring

### Key Performance Indicators

- **Deployment Time**: Target < 15 minutes for full deployment
- **Rollback Time**: Target < 2 minutes for emergency rollback
- **Success Rate**: Target > 99% deployment success rate
- **Downtime**: Target 0 seconds downtime per deployment

### Monitoring Dashboards

1. **Deployment Dashboard**: Real-time deployment status
2. **Performance Dashboard**: Response times and error rates
3. **Infrastructure Dashboard**: Resource utilization and health
4. **Security Dashboard**: Vulnerability and threat monitoring

## Environment Configurations

### Production Environment

- **High Availability**: Multiple replicas for all services
- **Resource Limits**: Conservative CPU/memory allocation
- **Security**: Full security scanning and hardening
- **Monitoring**: Comprehensive monitoring and alerting

### Staging Environment

- **Testing Focus**: Simplified configuration for testing
- **Resource Efficiency**: Reduced replica counts
- **Validation**: Full deployment pipeline validation
- **Performance**: Performance testing against production baselines

## Future Enhancements

### Planned Improvements

1. **Canary Deployments**: Gradual traffic shifting for safer deployments
2. **Multi-Region**: Cross-region deployment capabilities
3. **Auto-Scaling**: Dynamic scaling based on traffic patterns
4. **Enhanced Monitoring**: ML-based anomaly detection
5. **GitOps Integration**: ArgoCD or Flux for deployment automation

### Integration Roadmap

1. **Service Mesh**: Istio integration for advanced traffic management
2. **Observability**: Distributed tracing with Jaeger
3. **Chaos Engineering**: Automated failure testing
4. **Cost Optimization**: Resource usage optimization and rightsizing

---

## Quick Reference

### Essential Commands

```bash
# Setup infrastructure
./scripts/setup-swarm.sh production

# Deploy all services
./scripts/blue-green-deploy.sh production all

# Deploy specific services
./scripts/blue-green-deploy.sh production "api,agents"

# Emergency rollback
./scripts/rollback-deployment.sh production all

# Check service status
docker service ls
docker stack services urnlabs-production

# View deployment logs
docker service logs -f service-name-production-blue
```

### Support Contacts

- **DevOps Team**: devops@urnlabs.ai
- **Platform Team**: platform@urnlabs.ai
- **Security Team**: security@urnlabs.ai
- **On-Call**: Use PagerDuty escalation for emergencies

---

*This documentation is maintained by the Urnlabs Platform Team. Last updated: September 2024*