/**
 * Threat Detection API Routes
 *
 * REST API endpoints for threat detection monitoring and management.
 */

import { Router, Request, Response } from 'express';
import { ThreatDetectionService } from '../services/ThreatDetectionService';
import { auditLoggingService } from '../services/audit-logging';

const router = Router();

// Global threat detection service instance
let threatDetectionService: ThreatDetectionService;

/**
 * Initialize threat detection service
 */
export async function initializeThreatDetectionRoutes(): Promise<Router> {
  try {
    const { initializeThreatDetection } = await import('../ml');

    threatDetectionService = await initializeThreatDetection(auditLoggingService, {
      threatDetection: {
        realTimeProcessing: true,
        enableStatisticalModels: true,
        enableBehavioralAnalysis: true,
        enableAnomalyDetection: true,
        anomalyThreshold: 0.6,
        behavioralThreshold: 0.7,
        riskScoreThreshold: 50
      },
      pythonMLServiceUrl: process.env.PYTHON_ML_SERVICE_URL,
      redisUrl: process.env.REDIS_URL,
      incidentResponse: {
        autoContainment: process.env.AUTO_CONTAINMENT === 'true',
        escalationThresholds: { HIGH: 5, CRITICAL: 1 },
        responseTeamEmails: (process.env.SECURITY_TEAM_EMAILS || 'security@urnlabs.ai').split(','),
        slackWebhook: process.env.SLACK_WEBHOOK_URL
      },
      alerting: {
        webhookUrls: (process.env.WEBHOOK_URLS || '').split(',').filter(url => url.trim())
      }
    });

    console.log('Threat Detection Service initialized successfully');

  } catch (error) {
    console.error('Failed to initialize Threat Detection Service:', error);
    throw error;
  }

  return router;
}

/**
 * GET /api/threat-detection/health
 * Health check for threat detection service
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Threat detection service not initialized'
      });
    }

    const metrics = threatDetectionService.getMetrics();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        eventsProcessed: metrics.detectionEngine.eventsProcessed,
        threatsDetected: metrics.detectionEngine.threatsDetected,
        activeIncidents: metrics.incidents.total,
        pendingAlerts: metrics.alerts.pending
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/threat-detection/metrics
 * Get comprehensive threat detection metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const metrics = threatDetectionService.getMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/threat-detection/incidents
 * Get security incidents
 */
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const { status, severity, limit = 50, offset = 0 } = req.query;

    // In practice, would implement filtering and pagination
    const metrics = threatDetectionService.getMetrics();

    res.json({
      success: true,
      data: {
        total: metrics.incidents.total,
        incidents: [], // Would return actual incident data
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: metrics.incidents.total
        },
        filters: {
          status: status || 'all',
          severity: severity || 'all'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/threat-detection/incidents/:id
 * Update security incident
 */
router.put('/incidents/:id', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const { id } = req.params;
    const updates = req.body;

    // Validate updates
    const allowedUpdates = ['status', 'assignee', 'notes', 'actions'];
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    await threatDetectionService.updateIncident(id, filteredUpdates);

    res.json({
      success: true,
      message: 'Incident updated successfully',
      incidentId: id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/threat-detection/alerts
 * Get threat alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const { acknowledged, alertLevel, limit = 50, offset = 0 } = req.query;

    // In practice, would implement filtering and pagination
    const metrics = threatDetectionService.getMetrics();

    res.json({
      success: true,
      data: {
        total: metrics.alerts.sent,
        alerts: [], // Would return actual alert data
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: metrics.alerts.sent
        },
        filters: {
          acknowledged: acknowledged || 'all',
          alertLevel: alertLevel || 'all'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/threat-detection/alerts/:id/acknowledge
 * Acknowledge threat alert
 */
router.put('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const { id } = req.params;
    const { acknowledgedBy } = req.body;

    if (!acknowledgedBy) {
      return res.status(400).json({
        success: false,
        error: 'acknowledgedBy field is required'
      });
    }

    await threatDetectionService.acknowledgeAlert(id, acknowledgedBy);

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      alertId: id,
      acknowledgedBy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/threat-detection/test
 * Test threat detection with sample data
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const { testType = 'anomaly' } = req.body;

    // Create test audit event based on type
    let testEvent;

    switch (testType) {
      case 'brute_force':
        testEvent = {
          eventType: 'LOGIN_ATTEMPT',
          category: 'AUTHENTICATION',
          severity: 'MEDIUM',
          source: {
            service: 'auth-service',
            version: '1.0.0',
            instance: 'test',
            ip: '192.168.1.100'
          },
          actor: {
            type: 'USER',
            userId: 'test-user',
            sessionId: 'test-session'
          },
          target: {
            resource: '/api/auth/login',
            resourceType: 'authentication'
          },
          action: 'login',
          outcome: 'FAILURE',
          details: {
            reason: 'invalid_credentials',
            attemptCount: 6
          },
          metadata: {},
          compliance: {}
        };
        break;

      case 'privilege_escalation':
        testEvent = {
          eventType: 'PRIVILEGE_CHANGE',
          category: 'AUTHORIZATION',
          severity: 'HIGH',
          source: {
            service: 'auth-service',
            version: '1.0.0',
            instance: 'test',
            ip: '10.0.0.50'
          },
          actor: {
            type: 'USER',
            userId: 'test-user-2'
          },
          target: {
            resource: '/admin/users',
            resourceType: 'admin_panel'
          },
          action: 'escalate_privileges',
          outcome: 'SUCCESS',
          details: {
            fromRole: 'user',
            toRole: 'admin'
          },
          metadata: {},
          compliance: {}
        };
        break;

      default:
        testEvent = {
          eventType: 'DATA_ACCESS',
          category: 'DATA_ACCESS',
          severity: 'MEDIUM',
          source: {
            service: 'api-service',
            version: '1.0.0',
            instance: 'test',
            ip: '203.0.113.1' // Unusual IP
          },
          actor: {
            type: 'USER',
            userId: 'test-user-3',
            userAgent: 'UnknownBot/1.0'
          },
          target: {
            resource: '/api/sensitive-data',
            resourceType: 'database'
          },
          action: 'read',
          outcome: 'SUCCESS',
          details: {
            recordCount: 1000
          },
          metadata: {
            duration: 50
          },
          compliance: {
            gdpr: true
          }
        };
    }

    // Add required fields
    testEvent.id = `test_${Date.now()}`;
    testEvent.timestamp = new Date();

    // Process test event
    await threatDetectionService.processAuditEvent(testEvent);

    res.json({
      success: true,
      message: `Test threat detection executed for ${testType}`,
      testEvent: {
        id: testEvent.id,
        type: testType,
        timestamp: testEvent.timestamp
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/threat-detection/dashboard
 * Get dashboard data for threat detection monitoring
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    if (!threatDetectionService) {
      return res.status(503).json({
        error: 'Threat detection service not available'
      });
    }

    const { timeRange = '24h' } = req.query;
    const metrics = threatDetectionService.getMetrics();

    const dashboardData = {
      overview: {
        eventsProcessed: metrics.detectionEngine.eventsProcessed,
        threatsDetected: metrics.detectionEngine.threatsDetected,
        activeIncidents: metrics.incidents.total,
        pendingAlerts: metrics.alerts.pending
      },
      incidents: {
        total: metrics.incidents.total,
        byStatus: metrics.incidents.byStatus,
        bySeverity: metrics.incidents.bySeverity
      },
      alerts: {
        total: metrics.alerts.sent,
        acknowledged: metrics.alerts.acknowledged,
        pending: metrics.alerts.pending
      },
      performance: {
        averageDetectionTime: metrics.detectionEngine.averageDetectionTime,
        falsePositiveRate: metrics.detectionEngine.falsePositives / Math.max(metrics.detectionEngine.threatsDetected, 1)
      },
      recentActivity: {
        // Would include recent threats, incidents, and alerts
        threats: [],
        incidents: [],
        alerts: []
      }
    };

    res.json({
      success: true,
      data: dashboardData,
      timeRange,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Error handling middleware
 */
router.use((error: Error, req: Request, res: Response, next: any) => {
  console.error('Threat Detection API Error:', error);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
  });
});

export default router;