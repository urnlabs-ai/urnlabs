import { MarketplaceConnector, Integration } from '../types/index.js';
import { marketplaceLogger, logError, createPerformanceLogger } from '../lib/logger.js';
import { z } from 'zod';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectorConfig {
  id: string;
  config: Record<string, any>;
  credentials: Record<string, string>;
  enabled: boolean;
}

export interface ConnectorInstance {
  id: string;
  connectorId: string;
  name: string;
  config: ConnectorConfig;
  status: 'active' | 'inactive' | 'error' | 'configuring';
  lastSyncAt?: Date;
  error?: string;
  metrics: {
    eventsProcessed: number;
    lastEventAt?: Date;
    errors: number;
  };
}

export class MarketplaceService {
  private connectors: Map<string, MarketplaceConnector> = new Map();
  private instances: Map<string, ConnectorInstance> = new Map();

  constructor() {
    this.initializeBuiltInConnectors();
    marketplaceLogger.info('Marketplace service initialized');
  }

  /**
   * Get all available connectors
   */
  getConnectors(category?: string): MarketplaceConnector[] {
    let connectors = Array.from(this.connectors.values());
    
    if (category) {
      connectors = connectors.filter(connector => connector.category === category);
    }

    return connectors.sort((a, b) => {
      // Sort by verified status, then rating, then install count
      if (a.verified !== b.verified) {
        return a.verified ? -1 : 1;
      }
      if (a.rating !== b.rating) {
        return b.rating - a.rating;
      }
      return b.installCount - a.installCount;
    });
  }

  /**
   * Get connector by ID
   */
  getConnector(id: string): MarketplaceConnector | null {
    return this.connectors.get(id) || null;
  }

  /**
   * Search connectors
   */
  searchConnectors(query: string, category?: string): MarketplaceConnector[] {
    const normalizedQuery = query.toLowerCase();
    let connectors = Array.from(this.connectors.values());

    if (category) {
      connectors = connectors.filter(connector => connector.category === category);
    }

    return connectors
      .filter(connector => 
        connector.name.toLowerCase().includes(normalizedQuery) ||
        connector.description.toLowerCase().includes(normalizedQuery) ||
        connector.category.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => b.rating - a.rating);
  }

  /**
   * Install connector
   */
  async installConnector(
    connectorId: string,
    name: string,
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<ConnectorInstance> {
    const perf = createPerformanceLogger('marketplace-install-connector');
    
    try {
      const connector = this.connectors.get(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      // Validate configuration against schema
      this.validateConnectorConfig(connector, config);

      // Test connection
      await this.testConnectorConnection(connectorId, config, credentials);

      const instance: ConnectorInstance = {
        id: uuidv4(),
        connectorId,
        name,
        config: {
          id: uuidv4(),
          config,
          credentials,
          enabled: true,
        },
        status: 'active',
        metrics: {
          eventsProcessed: 0,
          errors: 0,
        },
      };

      this.instances.set(instance.id, instance);

      // Update connector install count
      connector.installCount++;

      perf.end(true, { connectorId, instanceId: instance.id });
      marketplaceLogger.info('Connector installed successfully', {
        connectorId,
        instanceId: instance.id,
        name,
      });

      return instance;
    } catch (error) {
      perf.end(false, { connectorId, error: (error as Error).message });
      logError(marketplaceLogger, 'Failed to install connector', error as Error, { connectorId });
      throw error;
    }
  }

  /**
   * Uninstall connector instance
   */
  async uninstallConnector(instanceId: string): Promise<boolean> {
    const perf = createPerformanceLogger('marketplace-uninstall-connector');
    
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Connector instance ${instanceId} not found`);
      }

      // Disable the instance first
      instance.status = 'inactive';
      instance.config.enabled = false;

      // Remove from instances
      this.instances.delete(instanceId);

      // Update connector install count
      const connector = this.connectors.get(instance.connectorId);
      if (connector && connector.installCount > 0) {
        connector.installCount--;
      }

      perf.end(true, { instanceId, connectorId: instance.connectorId });
      marketplaceLogger.info('Connector uninstalled successfully', {
        instanceId,
        connectorId: instance.connectorId,
      });

      return true;
    } catch (error) {
      perf.end(false, { instanceId, error: (error as Error).message });
      logError(marketplaceLogger, 'Failed to uninstall connector', error as Error, { instanceId });
      return false;
    }
  }

  /**
   * Get installed connector instances
   */
  getInstalledConnectors(): ConnectorInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get connector instance by ID
   */
  getConnectorInstance(instanceId: string): ConnectorInstance | null {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Update connector instance configuration
   */
  async updateConnectorConfig(
    instanceId: string,
    config: Record<string, any>,
    credentials?: Record<string, string>
  ): Promise<boolean> {
    const perf = createPerformanceLogger('marketplace-update-connector');
    
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Connector instance ${instanceId} not found`);
      }

      const connector = this.connectors.get(instance.connectorId);
      if (!connector) {
        throw new Error(`Connector ${instance.connectorId} not found`);
      }

      // Validate new configuration
      this.validateConnectorConfig(connector, config);

      // Test connection with new config
      const testCredentials = credentials || instance.config.credentials;
      await this.testConnectorConnection(instance.connectorId, config, testCredentials);

      // Update configuration
      instance.config.config = config;
      if (credentials) {
        instance.config.credentials = credentials;
      }
      instance.status = 'active';
      delete instance.error;

      perf.end(true, { instanceId, connectorId: instance.connectorId });
      marketplaceLogger.info('Connector configuration updated', {
        instanceId,
        connectorId: instance.connectorId,
      });

      return true;
    } catch (error) {
      const instance = this.instances.get(instanceId);
      if (instance) {
        instance.status = 'error';
        instance.error = (error as Error).message;
      }

      perf.end(false, { instanceId, error: (error as Error).message });
      logError(marketplaceLogger, 'Failed to update connector config', error as Error, { instanceId });
      return false;
    }
  }

  /**
   * Enable/disable connector instance
   */
  async toggleConnector(instanceId: string, enabled: boolean): Promise<boolean> {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Connector instance ${instanceId} not found`);
      }

      instance.config.enabled = enabled;
      instance.status = enabled ? 'active' : 'inactive';

      marketplaceLogger.info('Connector toggled', {
        instanceId,
        connectorId: instance.connectorId,
        enabled,
      });

      return true;
    } catch (error) {
      logError(marketplaceLogger, 'Failed to toggle connector', error as Error, { instanceId, enabled });
      return false;
    }
  }

  /**
   * Test connector connection
   */
  async testConnectorConnection(
    connectorId: string,
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    const perf = createPerformanceLogger('marketplace-test-connection');
    
    try {
      const connector = this.connectors.get(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      // Implement specific test logic based on connector type
      switch (connectorId) {
        case 'jira':
          return await this.testJiraConnection(config, credentials);
        case 'confluence':
          return await this.testConfluenceConnection(config, credentials);
        case 'jenkins':
          return await this.testJenkinsConnection(config, credentials);
        case 'gitlab':
          return await this.testGitLabConnection(config, credentials);
        default:
          // Generic HTTP test
          return await this.testGenericConnection(config, credentials);
      }
    } catch (error) {
      perf.end(false, { connectorId, error: (error as Error).message });
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  /**
   * Get connector marketplace categories
   */
  getCategories(): Array<{ name: string; count: number }> {
    const categories = new Map<string, number>();
    
    for (const connector of this.connectors.values()) {
      const count = categories.get(connector.category) || 0;
      categories.set(connector.category, count + 1);
    }

    return Array.from(categories.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Validate connector configuration against schema
   */
  private validateConnectorConfig(
    connector: MarketplaceConnector,
    config: Record<string, any>
  ): void {
    const schema = z.object(connector.configSchema);
    schema.parse(config);
  }

  /**
   * Test Jira connection
   */
  private async testJiraConnection(
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.get(`${config.baseUrl}/rest/api/2/myself`, {
        auth: {
          username: credentials.username,
          password: credentials.apiToken,
        },
        timeout: 10000,
      });

      return {
        success: response.status === 200,
        message: `Connected to Jira as ${response.data.displayName}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Jira connection failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Test Confluence connection
   */
  private async testConfluenceConnection(
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.get(`${config.baseUrl}/rest/api/user/current`, {
        auth: {
          username: credentials.username,
          password: credentials.apiToken,
        },
        timeout: 10000,
      });

      return {
        success: response.status === 200,
        message: `Connected to Confluence as ${response.data.displayName}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Confluence connection failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Test Jenkins connection
   */
  private async testJenkinsConnection(
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.get(`${config.baseUrl}/api/json`, {
        auth: {
          username: credentials.username,
          password: credentials.apiToken,
        },
        timeout: 10000,
      });

      return {
        success: response.status === 200,
        message: `Connected to Jenkins - Mode: ${response.data.mode}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Jenkins connection failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Test GitLab connection
   */
  private async testGitLabConnection(
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.get(`${config.baseUrl}/api/v4/user`, {
        headers: {
          'Private-Token': credentials.accessToken,
        },
        timeout: 10000,
      });

      return {
        success: response.status === 200,
        message: `Connected to GitLab as ${response.data.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `GitLab connection failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Test generic HTTP connection
   */
  private async testGenericConnection(
    config: Record<string, any>,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.get(config.testUrl || config.baseUrl, {
        headers: credentials,
        timeout: 10000,
      });

      return {
        success: response.status < 400,
        message: `Connection successful - Status: ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Initialize built-in connectors
   */
  private initializeBuiltInConnectors(): void {
    const builtInConnectors: MarketplaceConnector[] = [
      {
        id: 'jira',
        name: 'Jira Cloud',
        description: 'Connect to Jira Cloud for issue tracking and project management integration',
        version: '1.0.0',
        author: 'Urnlabs',
        category: 'Project Management',
        icon: '🎯',
        configSchema: {
          baseUrl: { type: 'string', description: 'Jira instance URL' },
          projectKeys: { type: 'array', items: { type: 'string' }, description: 'Project keys to sync' },
        },
        supportedEvents: ['issue_created', 'issue_updated', 'issue_deleted', 'comment_added'],
        installCount: 0,
        rating: 4.8,
        verified: true,
      },
      {
        id: 'confluence',
        name: 'Confluence Cloud',
        description: 'Integrate with Confluence for documentation and knowledge management',
        version: '1.0.0',
        author: 'Urnlabs',
        category: 'Documentation',
        icon: '📚',
        configSchema: {
          baseUrl: { type: 'string', description: 'Confluence instance URL' },
          spaceKeys: { type: 'array', items: { type: 'string' }, description: 'Space keys to sync' },
        },
        supportedEvents: ['page_created', 'page_updated', 'page_deleted', 'space_created'],
        installCount: 0,
        rating: 4.6,
        verified: true,
      },
      {
        id: 'jenkins',
        name: 'Jenkins CI/CD',
        description: 'Connect to Jenkins for continuous integration and deployment workflows',
        version: '1.0.0',
        author: 'Urnlabs',
        category: 'CI/CD',
        icon: '🔧',
        configSchema: {
          baseUrl: { type: 'string', description: 'Jenkins server URL' },
          jobs: { type: 'array', items: { type: 'string' }, description: 'Job names to monitor' },
        },
        supportedEvents: ['build_started', 'build_completed', 'build_failed', 'job_created'],
        installCount: 0,
        rating: 4.5,
        verified: true,
      },
      {
        id: 'gitlab',
        name: 'GitLab',
        description: 'Integrate with GitLab for repository management and CI/CD pipelines',
        version: '1.0.0',
        author: 'Urnlabs',
        category: 'Version Control',
        icon: '🦊',
        configSchema: {
          baseUrl: { type: 'string', description: 'GitLab instance URL', default: 'https://gitlab.com' },
          projectIds: { type: 'array', items: { type: 'number' }, description: 'Project IDs to monitor' },
        },
        supportedEvents: ['push', 'merge_request', 'pipeline_success', 'pipeline_failure'],
        installCount: 0,
        rating: 4.7,
        verified: true,
      },
      {
        id: 'docker-hub',
        name: 'Docker Hub',
        description: 'Monitor Docker Hub repositories for image updates and security alerts',
        version: '1.0.0',
        author: 'Urnlabs',
        category: 'Container Registry',
        icon: '🐳',
        configSchema: {
          repositories: { type: 'array', items: { type: 'string' }, description: 'Repository names to monitor' },
        },
        supportedEvents: ['image_pushed', 'image_updated', 'security_scan_completed'],
        installCount: 0,
        rating: 4.3,
        verified: true,
      },
      {
        id: 'aws-cloudwatch',
        name: 'AWS CloudWatch',
        description: 'Integrate with AWS CloudWatch for monitoring and alerting',
        version: '1.0.0',
        author: 'Urnlabs',
        category: 'Monitoring',
        icon: '☁️',
        configSchema: {
          region: { type: 'string', description: 'AWS region' },
          logGroups: { type: 'array', items: { type: 'string' }, description: 'Log groups to monitor' },
        },
        supportedEvents: ['alarm_triggered', 'log_event', 'metric_threshold_breached'],
        installCount: 0,
        rating: 4.4,
        verified: true,
      },
    ];

    for (const connector of builtInConnectors) {
      this.connectors.set(connector.id, connector);
    }

    marketplaceLogger.info('Built-in connectors initialized', {
      count: builtInConnectors.length,
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; details?: any }> {
    try {
      const stats = {
        availableConnectors: this.connectors.size,
        installedInstances: this.instances.size,
        activeInstances: Array.from(this.instances.values()).filter(i => i.status === 'active').length,
        categories: this.getCategories().length,
      };

      return {
        status: 'ok',
        details: stats,
      };
    } catch (error) {
      return {
        status: 'error',
        details: (error as Error).message,
      };
    }
  }
}