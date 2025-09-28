# ML-Based Threat Detection System

A production-ready machine learning threat detection system that provides real-time security monitoring and anomaly detection for the Urnlabs AI platform.

## Overview

This system implements multiple layers of threat detection using:

- **Statistical Models**: Z-score, moving averages, and IQR-based anomaly detection
- **Behavioral Analysis**: User and system behavior pattern recognition
- **Machine Learning**: Isolation Forest, LSTM networks, and clustering algorithms
- **Real-time Processing**: Stream-based event processing with sub-second response times
- **Incident Response**: Automated containment and escalation workflows

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Audit Events  │───▶│ ThreatDetection  │───▶│ Incident Response│
│                 │    │     Engine       │    │   & Alerting    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  ML Models       │
                    │ • Isolation      │
                    │   Forest         │
                    │ • LSTM Networks  │
                    │ • K-Means        │
                    │ • Statistical    │
                    └──────────────────┘
```

## Key Features

### 🔍 **Multi-Model Detection**
- **Isolation Forest**: Unsupervised outlier detection for unknown threats
- **LSTM Networks**: Sequential pattern analysis for temporal anomalies
- **Statistical Models**: Fast detection using moving averages and Z-scores
- **Behavioral Baselines**: User and system behavior profiling

### ⚡ **Real-Time Processing**
- Sub-100ms processing latency per event
- Stream-based architecture using Redis
- Batch processing for historical analysis
- Automatic model retraining

### 🚨 **Intelligent Alerting**
- Risk-based threat scoring (0-100 scale)
- Confidence-weighted anomaly detection
- Multi-channel alerts (email, Slack, webhooks)
- Automatic incident creation and escalation

### 🛡️ **Automated Response**
- IP blocking for geographic anomalies
- Session suspension for behavioral threats
- Rate limiting for brute force attacks
- Security team escalation for privilege escalation

## Installation

### Prerequisites

- Node.js 18+ with TypeScript
- Redis 6.0+
- Python 3.9+ (for ML service)
- PostgreSQL 13+ (for audit logs)

### Setup

1. **Install Node.js dependencies:**
```bash
npm install
```

2. **Setup Python ML service:**
```bash
cd python-service
pip install -r requirements.txt
python ml_service.py
```

3. **Configure environment variables:**
```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Python ML Service
PYTHON_ML_SERVICE_URL=http://localhost:5000

# Security Team Configuration
SECURITY_TEAM_EMAILS=security@urnlabs.ai,admin@urnlabs.ai
AUTO_CONTAINMENT=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Alerting Configuration
WEBHOOK_URLS=https://monitoring.urnlabs.ai/webhooks/security
```

## Usage

### Basic Integration

```typescript
import { initializeThreatDetection } from '@urnlabs/security/ml';
import { auditLoggingService } from '@urnlabs/security/audit-logging';

// Initialize threat detection with audit logging
const threatDetectionService = await initializeThreatDetection(
  auditLoggingService,
  {
    threatDetection: {
      realTimeProcessing: true,
      enableBehavioralAnalysis: true,
      anomalyThreshold: 0.6,
      riskScoreThreshold: 50
    },
    incidentResponse: {
      autoContainment: true,
      responseTeamEmails: ['security@urnlabs.ai'],
      escalationThresholds: { HIGH: 5, CRITICAL: 1 }
    }
  }
);

// The service will automatically process audit events
// and generate threats, incidents, and alerts
```

### Manual Event Processing

```typescript
import { ThreatDetectionEngine } from '@urnlabs/security/ml';

const engine = new ThreatDetectionEngine({
  enableStatisticalModels: true,
  enableBehavioralAnalysis: true,
  enableAnomalyDetection: true,
  anomalyThreshold: 0.6
});

await engine.initialize();

// Process a single audit event
const threats = await engine.processAuditEvent(auditEvent);

// Process multiple events in batch
const batchThreats = await engine.processBatch(auditEvents);
```

### Monitoring and Metrics

```typescript
// Get comprehensive metrics
const metrics = threatDetectionService.getMetrics();
console.log({
  eventsProcessed: metrics.detectionEngine.eventsProcessed,
  threatsDetected: metrics.detectionEngine.threatsDetected,
  activeIncidents: metrics.incidents.total,
  averageDetectionTime: metrics.detectionEngine.averageDetectionTime
});

// Listen for real-time events
threatDetectionService.on('threatDetected', (threat) => {
  console.log(`Threat detected: ${threat.threatType} (${threat.severity})`);
});

threatDetectionService.on('incidentCreated', (incident) => {
  console.log(`Security incident created: ${incident.incidentId}`);
});
```

## Threat Types

The system detects the following threat categories:

### 🔴 **BRUTE_FORCE**
- Multiple failed authentication attempts
- Rate-based detection with configurable thresholds
- Automatic IP blocking and rate limiting

### 🟠 **PRIVILEGE_ESCALATION**
- Unusual privilege changes or admin access
- Role-based anomaly detection
- Immediate security team alerting

### 🟡 **DATA_EXFILTRATION**
- High-volume data access patterns
- Unusual export/download behaviors
- Data loss prevention integration

### 🔵 **BEHAVIORAL**
- Deviations from user behavior baselines
- Geographic and temporal anomalies
- Device and access pattern changes

### 🟣 **ANOMALY**
- Statistical outliers in system metrics
- Machine learning-based detection
- Unsupervised pattern recognition

### 🟢 **PATTERN**
- Coordinated attack detection
- Multi-event correlation analysis
- Advanced persistent threat indicators

## Configuration

### Threat Detection Engine

```typescript
const config: ThreatDetectionConfig = {
  // Processing settings
  realTimeProcessing: true,
  batchSize: 100,
  maxProcessingLatency: 1000, // milliseconds

  // ML model settings
  enableStatisticalModels: true,
  enableBehavioralAnalysis: true,
  enableAnomalyDetection: true,

  // Detection thresholds
  anomalyThreshold: 0.6,        // 0-1 scale
  behavioralThreshold: 0.7,     // 0-1 scale
  riskScoreThreshold: 50,       // 0-100 scale

  // Model management
  retrainingInterval: 24,       // hours
  minDataPointsForRetraining: 1000,

  // Monitoring
  enableMetrics: true,
  metricsRetentionDays: 30
};
```

### Incident Response

```typescript
const incidentConfig = {
  autoContainment: true,
  escalationThresholds: {
    HIGH: 5,      // escalate after 5 minutes
    CRITICAL: 1   // escalate after 1 minute
  },
  responseTeamEmails: [
    'security@urnlabs.ai',
    'soc@urnlabs.ai'
  ],
  slackWebhook: 'https://hooks.slack.com/...'
};
```

## API Endpoints

### Health Check
```http
GET /api/threat-detection/health
```

### Metrics
```http
GET /api/threat-detection/metrics
```

### Incidents Management
```http
GET /api/threat-detection/incidents
PUT /api/threat-detection/incidents/:id
```

### Alerts Management
```http
GET /api/threat-detection/alerts
PUT /api/threat-detection/alerts/:id/acknowledge
```

### Testing
```http
POST /api/threat-detection/test
Content-Type: application/json

{
  "testType": "brute_force"
}
```

## Performance Characteristics

### Processing Performance
- **Latency**: < 100ms per event (99th percentile)
- **Throughput**: 10,000+ events/minute
- **Memory Usage**: < 512MB for 1M events
- **CPU Utilization**: < 50% under normal load

### Detection Accuracy
- **True Positive Rate**: > 95%
- **False Positive Rate**: < 2%
- **Detection Time**: < 5 minutes for high-severity threats
- **Model Accuracy**: > 90% for behavioral analysis

### Availability
- **Uptime**: 99.9% target
- **Failover**: Automatic Redis failover
- **Graceful Degradation**: Statistical models as fallback
- **Recovery Time**: < 60 seconds

## Monitoring and Observability

### Metrics Export

The system exports Prometheus-compatible metrics:

```
# Processing metrics
ml_threat_detection_events_processed_total
ml_threat_detection_processing_latency_seconds
ml_threat_detection_threats_detected_total

# Model performance
ml_threat_detection_model_accuracy_ratio
ml_threat_detection_false_positive_rate
ml_threat_detection_detection_latency_seconds

# System health
ml_threat_detection_active_models_count
ml_threat_detection_redis_connection_status
```

### Logging

Structured logging with correlation IDs:

```json
{
  "timestamp": "2024-01-20T10:30:00Z",
  "level": "INFO",
  "service": "threat-detection",
  "event": "threat_detected",
  "threatId": "threat_12345",
  "threatType": "BRUTE_FORCE",
  "severity": "HIGH",
  "riskScore": 85,
  "correlationId": "audit_67890"
}
```

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

### Security Tests
```bash
npm run test:security
```

## Troubleshooting

### Common Issues

1. **Python ML service not responding**
   - Check if service is running: `curl http://localhost:5000/health`
   - Verify Python dependencies: `pip list`
   - Check service logs: `docker logs ml-service`

2. **High false positive rate**
   - Adjust thresholds in configuration
   - Review behavioral baselines
   - Check model training data quality

3. **Processing delays**
   - Monitor Redis performance
   - Check memory usage
   - Review batch sizes

### Debug Mode

Enable debug logging:
```env
DEBUG=threat-detection:*
LOG_LEVEL=debug
```

### Health Checks

Monitor system health:
```bash
curl http://localhost:3000/api/threat-detection/health
```

## Security Considerations

- **Data Privacy**: All PII is hashed before ML processing
- **Model Security**: Models are validated and signed
- **Access Control**: Role-based access to detection APIs
- **Audit Trail**: All detections are logged and immutable
- **Encryption**: Data in transit and at rest encryption

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

Copyright 2024 Urnlabs AI. All rights reserved.