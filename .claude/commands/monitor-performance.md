# /monitor-performance - Real-time Performance Analysis

## Description
Provides comprehensive performance monitoring and analysis with automated alerts and optimization recommendations.

## Usage
```
/monitor-performance [--timeframe=1h|1d|1w] [--component=api|frontend|database] [--alert-threshold=<ms>]
```

## Monitoring Metrics
1. **Application Performance**
   - API response times (p50, p95, p99)
   - Database query performance
   - Memory usage patterns
   - CPU utilization
   - Error rates and types

2. **User Experience**
   - Core Web Vitals (LCP, FID, CLS)
   - Time to First Byte (TTFB)
   - Time to Interactive (TTI)
   - Bounce rates
   - Session duration

3. **Infrastructure Metrics**
   - Server response times
   - Load balancer health
   - CDN performance
   - SSL certificate status
   - DNS resolution times

## Automated Analysis
- Anomaly detection for unusual patterns
- Performance regression identification
- Resource utilization trends
- Error correlation analysis
- User journey bottlenecks

## Optimization Recommendations
```typescript
interface PerformanceRecommendation {
  component: string;
  issue: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  estimatedImprovement: string;
  implementation: string[];
}
```

## Alert Configuration
- Real-time Slack notifications
- Email alerts for critical issues
- PagerDuty integration for outages
- Custom webhook notifications
- Escalation procedures

## Dashboard Features
- Real-time performance graphs
- Historical trend analysis
- Comparative analysis across environments
- Custom metric tracking
- Performance budgets and thresholds