import winston from 'winston';
import path from 'path';

interface SecurityLogEntry {
  level: string;
  message: string;
  timestamp: string;
  service: string;
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  action?: string;
  resource?: string;
  result?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  riskScore?: number;
  metadata?: Record<string, any>;
  correlationId?: string;
}

class SecurityLogger {
  private logger: winston.Logger;
  private auditLogger: winston.Logger;

  constructor() {
    this.initializeLoggers();
  }

  private initializeLoggers(): void {
    // Main application logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf((info) => {
          const { timestamp, level, message, service, ...meta } = info;
          return JSON.stringify({
            timestamp,
            level: level.toUpperCase(),
            service: service || 'zero-trust-security',
            message,
            ...meta
          });
        })
      ),
      defaultMeta: {
        service: 'zero-trust-security'
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'security.log'),
          level: 'info'
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'security-error.log'),
          level: 'error'
        })
      ]
    });

    // Security audit logger (separate for compliance)
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'security-audit.log'),
          options: {
            flags: 'a' // append mode for audit logs
          }
        })
      ]
    });

    // Create logs directory if it doesn't exist
    const fs = require('fs');
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  public info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, meta);
  }

  public warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, meta);
  }

  public error(message: string, meta?: Record<string, any>): void {
    this.logger.error(message, meta);
  }

  public debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, meta);
  }

  // Security-specific logging methods
  public logSecurityEvent(entry: Partial<SecurityLogEntry>): void {
    const securityLog: SecurityLogEntry = {
      level: entry.level || 'info',
      message: entry.message || 'Security event',
      timestamp: new Date().toISOString(),
      service: 'zero-trust-security',
      ...entry
    };

    this.logger.log(securityLog.level, securityLog.message, securityLog);
    this.auditLogger.info('SECURITY_EVENT', securityLog);
  }

  public logAuthentication(
    userId: string,
    result: 'SUCCESS' | 'FAILURE',
    metadata: {
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
      riskScore?: number;
      mfaRequired?: boolean;
      sessionId?: string;
    }
  ): void {
    this.logSecurityEvent({
      level: result === 'SUCCESS' ? 'info' : 'warn',
      message: `Authentication ${result.toLowerCase()} for user ${userId}`,
      userId,
      deviceId: metadata.deviceId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      sessionId: metadata.sessionId,
      action: 'AUTHENTICATION',
      result,
      riskScore: metadata.riskScore,
      metadata: {
        mfaRequired: metadata.mfaRequired
      }
    });
  }

  public logAccessControl(
    userId: string,
    resource: string,
    action: string,
    result: 'ALLOWED' | 'DENIED',
    metadata: {
      deviceId?: string;
      sessionId?: string;
      policyId?: string;
      reason?: string;
      riskScore?: number;
    }
  ): void {
    this.logSecurityEvent({
      level: result === 'DENIED' ? 'warn' : 'info',
      message: `Access ${result.toLowerCase()} for user ${userId} on resource ${resource}`,
      userId,
      deviceId: metadata.deviceId,
      sessionId: metadata.sessionId,
      action: `ACCESS_${action.toUpperCase()}`,
      resource,
      result: result === 'ALLOWED' ? 'SUCCESS' : 'BLOCKED',
      riskScore: metadata.riskScore,
      metadata: {
        policyId: metadata.policyId,
        reason: metadata.reason
      }
    });
  }

  public logDeviceEvent(
    deviceId: string,
    action: string,
    result: 'SUCCESS' | 'FAILURE',
    metadata: {
      userId?: string;
      deviceType?: string;
      trustLevel?: string;
      complianceStatus?: string;
      certificateId?: string;
    }
  ): void {
    this.logSecurityEvent({
      level: result === 'SUCCESS' ? 'info' : 'warn',
      message: `Device ${action.toLowerCase()} ${result.toLowerCase()} for device ${deviceId}`,
      userId: metadata.userId,
      deviceId,
      action: `DEVICE_${action.toUpperCase()}`,
      result,
      metadata: {
        deviceType: metadata.deviceType,
        trustLevel: metadata.trustLevel,
        complianceStatus: metadata.complianceStatus,
        certificateId: metadata.certificateId
      }
    });
  }

  public logNetworkEvent(
    sourceId: string,
    targetResource: string,
    action: string,
    result: 'ALLOWED' | 'BLOCKED',
    metadata: {
      sourceIP?: string;
      targetIP?: string;
      protocol?: string;
      port?: number;
      segment?: string;
      reason?: string;
    }
  ): void {
    this.logSecurityEvent({
      level: result === 'BLOCKED' ? 'warn' : 'info',
      message: `Network access ${result.toLowerCase()} from ${sourceId} to ${targetResource}`,
      action: `NETWORK_${action.toUpperCase()}`,
      resource: targetResource,
      result: result === 'ALLOWED' ? 'SUCCESS' : 'BLOCKED',
      metadata: {
        sourceId,
        sourceIP: metadata.sourceIP,
        targetIP: metadata.targetIP,
        protocol: metadata.protocol,
        port: metadata.port,
        segment: metadata.segment,
        reason: metadata.reason
      }
    });
  }

  public logEncryptionEvent(
    operation: 'ENCRYPT' | 'DECRYPT' | 'KEY_ROTATION' | 'KEY_GENERATION',
    keyId: string,
    result: 'SUCCESS' | 'FAILURE',
    metadata: {
      algorithm?: string;
      dataSize?: number;
      userId?: string;
      error?: string;
    }
  ): void {
    this.logSecurityEvent({
      level: result === 'SUCCESS' ? 'debug' : 'error',
      message: `Encryption ${operation.toLowerCase()} ${result.toLowerCase()} for key ${keyId}`,
      action: `ENCRYPTION_${operation}`,
      result,
      metadata: {
        keyId,
        algorithm: metadata.algorithm,
        dataSize: metadata.dataSize,
        userId: metadata.userId,
        error: metadata.error
      }
    });
  }

  public logComplianceEvent(
    checkType: string,
    entityId: string,
    result: 'COMPLIANT' | 'NON_COMPLIANT',
    metadata: {
      policies?: string[];
      violations?: string[];
      remediation?: string[];
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }
  ): void {
    this.logSecurityEvent({
      level: result === 'NON_COMPLIANT' ? 'warn' : 'info',
      message: `Compliance check ${result.toLowerCase()} for ${entityId}`,
      action: `COMPLIANCE_${checkType.toUpperCase()}`,
      result: result === 'COMPLIANT' ? 'SUCCESS' : 'FAILURE',
      metadata: {
        entityId,
        checkType,
        policies: metadata.policies,
        violations: metadata.violations,
        remediation: metadata.remediation,
        severity: metadata.severity
      }
    });
  }

  public logRiskAssessment(
    entityId: string,
    entityType: 'USER' | 'DEVICE' | 'SESSION',
    riskScore: number,
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    factors: string[]
  ): void {
    this.logSecurityEvent({
      level: riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'warn' : 'info',
      message: `Risk assessment completed for ${entityType.toLowerCase()} ${entityId}`,
      action: 'RISK_ASSESSMENT',
      result: 'SUCCESS',
      riskScore,
      metadata: {
        entityId,
        entityType,
        riskLevel,
        factors
      }
    });
  }

  public logSecurityIncident(
    incidentType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    description: string,
    metadata: {
      affectedUsers?: string[];
      affectedResources?: string[];
      attackVector?: string;
      mitigation?: string;
      correlationId?: string;
    }
  ): void {
    this.logSecurityEvent({
      level: severity === 'HIGH' || severity === 'CRITICAL' ? 'error' : 'warn',
      message: `Security incident detected: ${description}`,
      action: `INCIDENT_${incidentType.toUpperCase()}`,
      result: 'FAILURE',
      correlationId: metadata.correlationId,
      metadata: {
        incidentType,
        severity,
        affectedUsers: metadata.affectedUsers,
        affectedResources: metadata.affectedResources,
        attackVector: metadata.attackVector,
        mitigation: metadata.mitigation
      }
    });
  }

  public generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  public createChildLogger(metadata: Record<string, any>): SecurityLogger {
    const childLogger = Object.create(this);
    childLogger.logger = this.logger.child(metadata);
    childLogger.auditLogger = this.auditLogger.child(metadata);
    return childLogger;
  }

  public shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.end(() => {
        this.auditLogger.end(() => {
          resolve();
        });
      });
    });
  }
}

// Export singleton instance
export const logger = new SecurityLogger();
export { SecurityLogger };