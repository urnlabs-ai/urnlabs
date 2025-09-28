import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

// Validation schemas
const StartScanSchema = z.object({
  scanType: z.enum(['full', 'sast', 'dast', 'container', 'dependencies', 'secrets']).default('full'),
  targetUrl: z.string().url().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional(),
});

const ScanQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  scanType: z.enum(['full', 'sast', 'dast', 'container', 'dependencies', 'secrets']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

const ScanIdSchema = z.object({
  scanId: z.string().uuid(),
});

const VulnerabilityQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'false_positive']).optional(),
  tool: z.enum(['trivy', 'snyk', 'zap', 'codeql']).optional(),
});

// Types
interface ScanResult {
  scanId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  scanType: string;
  createdAt: Date;
  completedAt?: Date;
  results?: {
    vulnerabilities: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    fixable: number;
  };
  artifacts?: string[];
}

interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  tool: string;
  cve?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'false_positive';
  location: {
    file?: string;
    line?: number;
    dependency?: string;
    url?: string;
  };
  remediation?: {
    description: string;
    fixVersion?: string;
    patches?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

class SecurityScanningService {
  private prisma: PrismaClient;
  private scanResults: Map<string, ScanResult> = new Map();
  private vulnerabilities: Map<string, Vulnerability> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async startScan(params: z.infer<typeof StartScanSchema>): Promise<ScanResult> {
    const scanId = this.generateScanId();
    const scanResult: ScanResult = {
      scanId,
      status: 'pending',
      scanType: params.scanType,
      createdAt: new Date(),
    };

    this.scanResults.set(scanId, scanResult);

    // Start scan asynchronously
    this.executeScan(scanId, params).catch(error => {
      console.error(`Scan ${scanId} failed:`, error);
      const result = this.scanResults.get(scanId);
      if (result) {
        result.status = 'failed';
        this.scanResults.set(scanId, result);
      }
    });

    return scanResult;
  }

  private async executeScan(scanId: string, params: z.infer<typeof StartScanSchema>): Promise<void> {
    const result = this.scanResults.get(scanId);
    if (!result) return;

    try {
      result.status = 'running';
      this.scanResults.set(scanId, result);

      const artifacts: string[] = [];
      let totalVulns = 0;
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;
      let fixableCount = 0;

      // Execute different scan types
      switch (params.scanType) {
        case 'full':
          const [trivyResult, snykResult, zapResult] = await Promise.allSettled([
            this.runTrivyScan(scanId, params.severity),
            this.runSnykScan(scanId),
            this.runZapScan(scanId, params.targetUrl),
          ]);

          // Aggregate results
          if (trivyResult.status === 'fulfilled') {
            artifacts.push(...trivyResult.value.artifacts);
            criticalCount += trivyResult.value.critical;
            highCount += trivyResult.value.high;
            mediumCount += trivyResult.value.medium;
            lowCount += trivyResult.value.low;
          }

          if (snykResult.status === 'fulfilled') {
            artifacts.push(...snykResult.value.artifacts);
            totalVulns += snykResult.value.vulnerabilities;
            fixableCount += snykResult.value.fixable;
          }

          if (zapResult.status === 'fulfilled') {
            artifacts.push(...zapResult.value.artifacts);
            highCount += zapResult.value.highRisk;
            totalVulns += zapResult.value.totalAlerts;
          }
          break;

        case 'container':
          const trivyOnly = await this.runTrivyScan(scanId, params.severity);
          artifacts.push(...trivyOnly.artifacts);
          criticalCount = trivyOnly.critical;
          highCount = trivyOnly.high;
          mediumCount = trivyOnly.medium;
          lowCount = trivyOnly.low;
          break;

        case 'dependencies':
          const snykOnly = await this.runSnykScan(scanId);
          artifacts.push(...snykOnly.artifacts);
          totalVulns = snykOnly.vulnerabilities;
          fixableCount = snykOnly.fixable;
          break;

        case 'dast':
          if (!params.targetUrl) {
            throw new Error('Target URL required for DAST scan');
          }
          const zapOnly = await this.runZapScan(scanId, params.targetUrl);
          artifacts.push(...zapOnly.artifacts);
          highCount = zapOnly.highRisk;
          totalVulns = zapOnly.totalAlerts;
          break;

        case 'secrets':
          const secretsResult = await this.runSecretsSpan(scanId);
          artifacts.push(...secretsResult.artifacts);
          criticalCount = secretsResult.secrets;
          break;

        case 'sast':
          const sastResult = await this.runSastScan(scanId);
          artifacts.push(...sastResult.artifacts);
          criticalCount += sastResult.critical;
          highCount += sastResult.high;
          mediumCount += sastResult.medium;
          break;
      }

      // Update scan result
      result.status = 'completed';
      result.completedAt = new Date();
      result.results = {
        vulnerabilities: totalVulns || (criticalCount + highCount + mediumCount + lowCount),
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
        fixable: fixableCount,
      };
      result.artifacts = artifacts;

      this.scanResults.set(scanId, result);

      // Send webhook notification if provided
      if (params.webhookUrl) {
        await this.sendWebhookNotification(params.webhookUrl, result);
      }

    } catch (error) {
      console.error(`Scan ${scanId} execution failed:`, error);
      result.status = 'failed';
      this.scanResults.set(scanId, result);
    }
  }

  private async runTrivyScan(scanId: string, severity: string): Promise<{
    artifacts: string[];
    critical: number;
    high: number;
    medium: number;
    low: number;
  }> {
    const outputDir = `/tmp/trivy-${scanId}`;
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Run Trivy filesystem scan
      const { stdout: fsStdout } = await execAsync(
        `trivy fs --format json --severity ${severity.toUpperCase()} --output ${outputDir}/fs-results.json .`
      );

      // Run Trivy config scan
      const { stdout: configStdout } = await execAsync(
        `trivy config --format json --severity ${severity.toUpperCase()} --output ${outputDir}/config-results.json .`
      );

      // Parse results
      const fsResults = JSON.parse(await fs.readFile(`${outputDir}/fs-results.json`, 'utf-8'));
      const configResults = JSON.parse(await fs.readFile(`${outputDir}/config-results.json`, 'utf-8'));

      // Count vulnerabilities by severity
      let critical = 0, high = 0, medium = 0, low = 0;

      [fsResults, configResults].forEach(result => {
        if (result.Results) {
          result.Results.forEach((target: any) => {
            if (target.Vulnerabilities) {
              target.Vulnerabilities.forEach((vuln: any) => {
                switch (vuln.Severity) {
                  case 'CRITICAL': critical++; break;
                  case 'HIGH': high++; break;
                  case 'MEDIUM': medium++; break;
                  case 'LOW': low++; break;
                }
              });
            }
          });
        }
      });

      return {
        artifacts: [`${outputDir}/fs-results.json`, `${outputDir}/config-results.json`],
        critical,
        high,
        medium,
        low,
      };
    } catch (error) {
      console.error('Trivy scan failed:', error);
      return { artifacts: [], critical: 0, high: 0, medium: 0, low: 0 };
    }
  }

  private async runSnykScan(scanId: string): Promise<{
    artifacts: string[];
    vulnerabilities: number;
    fixable: number;
  }> {
    const outputDir = `/tmp/snyk-${scanId}`;
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Run Snyk test
      const { stdout } = await execAsync(
        `snyk test --json --all-projects > ${outputDir}/results.json || true`
      );

      const results = JSON.parse(await fs.readFile(`${outputDir}/results.json`, 'utf-8'));

      let vulnerabilities = 0;
      let fixable = 0;

      if (results.vulnerabilities) {
        vulnerabilities = results.vulnerabilities.length;
        fixable = results.vulnerabilities.filter((v: any) =>
          v.isUpgradable || v.isPatchable
        ).length;
      }

      return {
        artifacts: [`${outputDir}/results.json`],
        vulnerabilities,
        fixable,
      };
    } catch (error) {
      console.error('Snyk scan failed:', error);
      return { artifacts: [], vulnerabilities: 0, fixable: 0 };
    }
  }

  private async runZapScan(scanId: string, targetUrl?: string): Promise<{
    artifacts: string[];
    totalAlerts: number;
    highRisk: number;
  }> {
    if (!targetUrl) {
      return { artifacts: [], totalAlerts: 0, highRisk: 0 };
    }

    const outputDir = `/tmp/zap-${scanId}`;
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Create ZAP automation config
      const zapConfig = {
        env: {
          contexts: [{
            name: 'target-context',
            url: targetUrl,
            includePaths: [`${targetUrl}.*`],
          }]
        },
        jobs: [
          {
            type: 'spider',
            parameters: {
              context: 'target-context',
              url: targetUrl,
              maxDuration: 5,
            }
          },
          {
            type: 'activeScan',
            parameters: {
              context: 'target-context',
              maxDuration: 10,
            }
          },
          {
            type: 'report',
            parameters: {
              template: 'json',
              reportFile: `/zap/wrk/zap-report.json`,
            }
          }
        ]
      };

      await fs.writeFile(`${outputDir}/zap-config.yaml`, JSON.stringify(zapConfig, null, 2));

      // Run ZAP scan
      await execAsync(
        `docker run --rm -v ${outputDir}:/zap/wrk ghcr.io/zaproxy/zaproxy:stable zap-automation.py -configfile /zap/wrk/zap-config.yaml`
      );

      // Parse results
      const results = JSON.parse(await fs.readFile(`${outputDir}/zap-report.json`, 'utf-8'));

      let totalAlerts = 0;
      let highRisk = 0;

      if (results.site && results.site[0] && results.site[0].alerts) {
        totalAlerts = results.site[0].alerts.length;
        highRisk = results.site[0].alerts.filter((alert: any) =>
          alert.riskcode === '3'
        ).length;
      }

      return {
        artifacts: [`${outputDir}/zap-report.json`],
        totalAlerts,
        highRisk,
      };
    } catch (error) {
      console.error('ZAP scan failed:', error);
      return { artifacts: [], totalAlerts: 0, highRisk: 0 };
    }
  }

  private async runSecretsSpan(scanId: string): Promise<{
    artifacts: string[];
    secrets: number;
  }> {
    const outputDir = `/tmp/secrets-${scanId}`;
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Run TruffleHog for secret detection
      const { stdout } = await execAsync(
        `trufflehog git file://. --json > ${outputDir}/secrets.json || true`
      );

      const results = await fs.readFile(`${outputDir}/secrets.json`, 'utf-8');
      const secrets = results.split('\n').filter(line => line.trim()).length;

      return {
        artifacts: [`${outputDir}/secrets.json`],
        secrets,
      };
    } catch (error) {
      console.error('Secrets scan failed:', error);
      return { artifacts: [], secrets: 0 };
    }
  }

  private async runSastScan(scanId: string): Promise<{
    artifacts: string[];
    critical: number;
    high: number;
    medium: number;
  }> {
    const outputDir = `/tmp/sast-${scanId}`;
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Run semgrep for SAST
      const { stdout } = await execAsync(
        `semgrep --config=auto --json --output=${outputDir}/sast-results.json . || true`
      );

      const results = JSON.parse(await fs.readFile(`${outputDir}/sast-results.json`, 'utf-8'));

      let critical = 0, high = 0, medium = 0;

      if (results.results) {
        results.results.forEach((finding: any) => {
          switch (finding.extra?.severity) {
            case 'ERROR': critical++; break;
            case 'WARNING': high++; break;
            case 'INFO': medium++; break;
          }
        });
      }

      return {
        artifacts: [`${outputDir}/sast-results.json`],
        critical,
        high,
        medium,
      };
    } catch (error) {
      console.error('SAST scan failed:', error);
      return { artifacts: [], critical: 0, high: 0, medium: 0 };
    }
  }

  private async sendWebhookNotification(webhookUrl: string, scanResult: ScanResult): Promise<void> {
    try {
      const fetch = (await import('node-fetch')).default;

      const payload = {
        scanId: scanResult.scanId,
        status: scanResult.status,
        scanType: scanResult.scanType,
        results: scanResult.results,
        timestamp: new Date().toISOString(),
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Webhook notification failed:', error);
    }
  }

  getScan(scanId: string): ScanResult | undefined {
    return this.scanResults.get(scanId);
  }

  getAllScans(filters?: {
    status?: string;
    scanType?: string;
    page?: number;
    limit?: number;
  }): { scans: ScanResult[]; total: number } {
    let scans = Array.from(this.scanResults.values());

    // Apply filters
    if (filters?.status) {
      scans = scans.filter(scan => scan.status === filters.status);
    }
    if (filters?.scanType) {
      scans = scans.filter(scan => scan.scanType === filters.scanType);
    }

    // Sort by creation date (newest first)
    scans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    const paginatedScans = scans.slice(offset, offset + limit);

    return {
      scans: paginatedScans,
      total: scans.length,
    };
  }

  getVulnerabilities(filters?: {
    severity?: string;
    status?: string;
    tool?: string;
    page?: number;
    limit?: number;
  }): { vulnerabilities: Vulnerability[]; total: number } {
    let vulnerabilities = Array.from(this.vulnerabilities.values());

    // Apply filters
    if (filters?.severity) {
      vulnerabilities = vulnerabilities.filter(v => v.severity === filters.severity);
    }
    if (filters?.status) {
      vulnerabilities = vulnerabilities.filter(v => v.status === filters.status);
    }
    if (filters?.tool) {
      vulnerabilities = vulnerabilities.filter(v => v.tool === filters.tool);
    }

    // Sort by severity and creation date
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    vulnerabilities.sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Apply pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    const paginatedVulns = vulnerabilities.slice(offset, offset + limit);

    return {
      vulnerabilities: paginatedVulns,
      total: vulnerabilities.length,
    };
  }

  private generateScanId(): string {
    return `scan-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

export default async function securityScanningRoutes(fastify: FastifyInstance) {
  const scanningService = new SecurityScanningService(fastify.prisma);

  // Start a new security scan
  fastify.post<{
    Body: z.infer<typeof StartScanSchema>;
  }>('/scans', {
    schema: {
      description: 'Start a new security vulnerability scan',
      tags: ['Security Scanning'],
      body: StartScanSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            scanId: { type: 'string' },
            status: { type: 'string' },
            scanType: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await scanningService.startScan(request.body);

    reply.code(201).send({
      scanId: result.scanId,
      status: result.status,
      scanType: result.scanType,
      createdAt: result.createdAt.toISOString(),
    });
  });

  // Get all scans with filtering and pagination
  fastify.get<{
    Querystring: z.infer<typeof ScanQuerySchema>;
  }>('/scans', {
    schema: {
      description: 'List all security scans with filtering and pagination',
      tags: ['Security Scanning'],
      querystring: ScanQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            scans: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scanId: { type: 'string' },
                  status: { type: 'string' },
                  scanType: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  completedAt: { type: 'string', format: 'date-time' },
                  results: {
                    type: 'object',
                    properties: {
                      vulnerabilities: { type: 'number' },
                      critical: { type: 'number' },
                      high: { type: 'number' },
                      medium: { type: 'number' },
                      low: { type: 'number' },
                      fixable: { type: 'number' },
                    }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' },
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { scans, total } = scanningService.getAllScans({
      status: request.query.status,
      scanType: request.query.scanType,
      page: request.query.page,
      limit: request.query.limit,
    });

    const totalPages = Math.ceil(total / request.query.limit);

    reply.send({
      scans: scans.map(scan => ({
        scanId: scan.scanId,
        status: scan.status,
        scanType: scan.scanType,
        createdAt: scan.createdAt.toISOString(),
        completedAt: scan.completedAt?.toISOString(),
        results: scan.results,
      })),
      pagination: {
        page: request.query.page,
        limit: request.query.limit,
        total,
        totalPages,
      }
    });
  });

  // Get specific scan details
  fastify.get<{
    Params: z.infer<typeof ScanIdSchema>;
  }>('/scans/:scanId', {
    schema: {
      description: 'Get details of a specific security scan',
      tags: ['Security Scanning'],
      params: ScanIdSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            scanId: { type: 'string' },
            status: { type: 'string' },
            scanType: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' },
            results: {
              type: 'object',
              properties: {
                vulnerabilities: { type: 'number' },
                critical: { type: 'number' },
                high: { type: 'number' },
                medium: { type: 'number' },
                low: { type: 'number' },
                fixable: { type: 'number' },
              }
            },
            artifacts: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const scan = scanningService.getScan(request.params.scanId);

    if (!scan) {
      reply.code(404).send({
        error: 'Not Found',
        message: 'Scan not found'
      });
      return;
    }

    reply.send({
      scanId: scan.scanId,
      status: scan.status,
      scanType: scan.scanType,
      createdAt: scan.createdAt.toISOString(),
      completedAt: scan.completedAt?.toISOString(),
      results: scan.results,
      artifacts: scan.artifacts,
    });
  });

  // Get vulnerabilities with filtering and pagination
  fastify.get<{
    Querystring: z.infer<typeof VulnerabilityQuerySchema>;
  }>('/vulnerabilities', {
    schema: {
      description: 'List vulnerabilities with filtering and pagination',
      tags: ['Security Scanning'],
      querystring: VulnerabilityQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            vulnerabilities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  severity: { type: 'string' },
                  tool: { type: 'string' },
                  cve: { type: 'string' },
                  status: { type: 'string' },
                  location: {
                    type: 'object',
                    properties: {
                      file: { type: 'string' },
                      line: { type: 'number' },
                      dependency: { type: 'string' },
                      url: { type: 'string' },
                    }
                  },
                  remediation: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      fixVersion: { type: 'string' },
                      patches: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' },
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { vulnerabilities, total } = scanningService.getVulnerabilities({
      severity: request.query.severity,
      status: request.query.status,
      tool: request.query.tool,
      page: request.query.page,
      limit: request.query.limit,
    });

    const totalPages = Math.ceil(total / request.query.limit);

    reply.send({
      vulnerabilities,
      pagination: {
        page: request.query.page,
        limit: request.query.limit,
        total,
        totalPages,
      }
    });
  });

  // Health check endpoint for the security scanning service
  fastify.get('/health', {
    schema: {
      description: 'Health check for security scanning service',
      tags: ['Security Scanning'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'number' },
            services: {
              type: 'object',
              properties: {
                trivy: { type: 'string' },
                snyk: { type: 'string' },
                zap: { type: 'string' },
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Check if security tools are available
    const toolChecks = await Promise.allSettled([
      execAsync('trivy --version').then(() => 'available').catch(() => 'unavailable'),
      execAsync('snyk --version').then(() => 'available').catch(() => 'unavailable'),
      execAsync('docker --version').then(() => 'available').catch(() => 'unavailable'),
    ]);

    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        trivy: toolChecks[0].status === 'fulfilled' ? toolChecks[0].value : 'unavailable',
        snyk: toolChecks[1].status === 'fulfilled' ? toolChecks[1].value : 'unavailable',
        zap: toolChecks[2].status === 'fulfilled' ? toolChecks[2].value : 'unavailable',
      }
    });
  });
}