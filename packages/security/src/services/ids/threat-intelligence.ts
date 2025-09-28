/**
 * Threat Intelligence Service - External Threat Feed Integration
 * Integrates with multiple threat intelligence providers for IoC enrichment
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import axios, { AxiosInstance } from 'axios';
import * as cron from 'node-cron';
import {
  ThreatIntelligence,
  ThreatType,
  ThreatIntelConfig
} from './types';

export interface ThreatIndicators {
  ip?: string;
  domain?: string;
  url?: string;
  userAgent?: string;
  fileHash?: string;
  email?: string;
}

export interface ThreatProvider {
  name: string;
  apiClient: AxiosInstance;
  config: ThreatIntelConfig;
  lastUpdate: Date;
  status: 'active' | 'inactive' | 'error';
  indicators: Map<string, ThreatIntelligence>;
}

export class ThreatIntelligenceService extends EventEmitter {
  private logger: Logger;
  private providers: Map<string, ThreatProvider> = new Map();
  private cache: Map<string, ThreatIntelligence[]> = new Map();
  private updateSchedulers: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized: boolean = false;

  constructor(configs: ThreatIntelConfig[], logger: Logger) {
    super();
    this.logger = logger.child({ component: 'ThreatIntelligence' });
    this.initializeProviders(configs);
  }

  /**
   * Initialize threat intelligence service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Threat Intelligence Service...');

      // Initialize all providers
      for (const [name, provider] of this.providers) {
        if (provider.config.enabled) {
          await this.initializeProvider(name, provider);
        }
      }

      // Start update schedulers
      this.startUpdateSchedulers();

      this.isInitialized = true;
      this.logger.info('Threat Intelligence Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Threat Intelligence Service:', error);
      throw error;
    }
  }

  /**
   * Stop the threat intelligence service
   */
  async stop(): Promise<void> {
    // Stop all schedulers
    for (const [name, scheduler] of this.updateSchedulers) {
      scheduler.destroy();
      this.logger.debug(`Stopped scheduler for ${name}`);
    }

    this.updateSchedulers.clear();
    this.logger.info('Threat Intelligence Service stopped');
  }

  /**
   * Check indicators against threat intelligence
   */
  async checkIndicators(indicators: ThreatIndicators): Promise<ThreatIntelligence[]> {
    if (!this.isInitialized) {
      throw new Error('Threat Intelligence Service not initialized');
    }

    const matches: ThreatIntelligence[] = [];

    try {
      // Check each indicator type
      if (indicators.ip) {
        matches.push(...await this.checkIP(indicators.ip));
      }

      if (indicators.domain) {
        matches.push(...await this.checkDomain(indicators.domain));
      }

      if (indicators.url) {
        matches.push(...await this.checkURL(indicators.url));
      }

      if (indicators.userAgent) {
        matches.push(...await this.checkUserAgent(indicators.userAgent));
      }

      if (indicators.fileHash) {
        matches.push(...await this.checkFileHash(indicators.fileHash));
      }

      if (indicators.email) {
        matches.push(...await this.checkEmail(indicators.email));
      }

      // Remove duplicates and sort by confidence
      const uniqueMatches = this.deduplicateMatches(matches);
      
      if (uniqueMatches.length > 0) {
        this.logger.info(`Found ${uniqueMatches.length} threat intelligence matches`, {
          indicators: Object.keys(indicators),
          matches: uniqueMatches.length
        });
      }

      return uniqueMatches;

    } catch (error) {
      this.logger.error('Error checking threat indicators:', error);
      return [];
    }
  }

  /**
   * Update threat feeds from all providers
   */
  async updateAllFeeds(): Promise<void> {
    const updatePromises: Promise<void>[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.config.enabled) {
        updatePromises.push(this.updateProviderFeed(name, provider));
      }
    }

    try {
      await Promise.allSettled(updatePromises);
      this.logger.info('All threat feeds updated');
    } catch (error) {
      this.logger.error('Error updating threat feeds:', error);
    }
  }

  /**
   * Get threat intelligence statistics
   */
  getStatistics(): any {
    const stats = {
      providers: {},
      totalIndicators: 0,
      cacheSize: this.cache.size,
      lastUpdate: new Date()
    };

    for (const [name, provider] of this.providers) {
      (stats.providers as any)[name] = {
        status: provider.status,
        indicators: provider.indicators.size,
        lastUpdate: provider.lastUpdate,
        enabled: provider.config.enabled
      };
      stats.totalIndicators += provider.indicators.size;
    }

    return stats;
  }

  /**
   * Initialize providers from configurations
   */
  private initializeProviders(configs: ThreatIntelConfig[]): void {
    for (const config of configs) {
      const provider: ThreatProvider = {
        name: config.provider,
        apiClient: this.createApiClient(config),
        config,
        lastUpdate: new Date(0),
        status: 'inactive',
        indicators: new Map()
      };

      this.providers.set(config.provider, provider);
      this.logger.debug(`Initialized provider: ${config.provider}`);
    }
  }

  /**
   * Create HTTP client for provider
   */
  private createApiClient(config: ThreatIntelConfig): AxiosInstance {
    return axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Urnlabs-IDS/1.0',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Initialize individual provider
   */
  private async initializeProvider(name: string, provider: ThreatProvider): Promise<void> {
    try {
      this.logger.info(`Initializing threat provider: ${name}`);

      // Test connection
      await this.testProviderConnection(provider);

      // Load initial feed
      await this.updateProviderFeed(name, provider);

      provider.status = 'active';
      this.logger.info(`Provider ${name} initialized successfully`);

    } catch (error) {
      provider.status = 'error';
      this.logger.error(`Failed to initialize provider ${name}:`, error);
    }
  }

  /**
   * Test provider connection
   */
  private async testProviderConnection(provider: ThreatProvider): Promise<void> {
    // Implementation would depend on specific provider APIs
    // This is a generic test
    try {
      await provider.apiClient.get('/health');
    } catch (error) {
      // Some providers might not have health endpoints
      this.logger.debug(`Health check failed for ${provider.name}, continuing...`);
    }
  }

  /**
   * Update feed from specific provider
   */
  private async updateProviderFeed(name: string, provider: ThreatProvider): Promise<void> {
    try {
      this.logger.debug(`Updating feed for provider: ${name}`);

      let indicators: ThreatIntelligence[] = [];

      // Handle different provider types
      switch (name.toLowerCase()) {
        case 'alienvault':
          indicators = await this.fetchAlienVaultFeed(provider);
          break;
        case 'virustotal':
          indicators = await this.fetchVirusTotalFeed(provider);
          break;
        case 'misp':
          indicators = await this.fetchMISPFeed(provider);
          break;
        case 'threatfox':
          indicators = await this.fetchThreatFoxFeed(provider);
          break;
        case 'abuseipdb':
          indicators = await this.fetchAbuseIPDBFeed(provider);
          break;
        default:
          indicators = await this.fetchGenericFeed(provider);
      }

      // Store indicators
      provider.indicators.clear();
      for (const indicator of indicators) {
        provider.indicators.set(indicator.indicator, indicator);
      }

      provider.lastUpdate = new Date();
      
      this.logger.info(`Updated ${name} feed: ${indicators.length} indicators`);
      this.emit('feedUpdated', name, indicators.length);

    } catch (error) {
      provider.status = 'error';
      this.logger.error(`Error updating feed for ${name}:`, error);
    }
  }

  /**
   * Fetch AlienVault OTX feed
   */
  private async fetchAlienVaultFeed(provider: ThreatProvider): Promise<ThreatIntelligence[]> {
    try {
      const response = await provider.apiClient.get('/api/v1/indicators/export', {
        params: {
          types: 'IPv4,domain,hostname,url',
          modified_since: this.getLastUpdateISO(provider.lastUpdate)
        }
      });

      return this.parseAlienVaultResponse(response.data);

    } catch (error) {
      this.logger.error('Error fetching AlienVault feed:', error);
      return [];
    }
  }

  /**
   * Fetch VirusTotal feed
   */
  private async fetchVirusTotalFeed(provider: ThreatProvider): Promise<ThreatIntelligence[]> {
    try {
      // VirusTotal requires specific endpoint calls
      const indicators: ThreatIntelligence[] = [];

      // This would be implemented based on VirusTotal API
      // For now, returning empty array
      
      return indicators;

    } catch (error) {
      this.logger.error('Error fetching VirusTotal feed:', error);
      return [];
    }
  }

  /**
   * Fetch MISP feed
   */
  private async fetchMISPFeed(provider: ThreatProvider): Promise<ThreatIntelligence[]> {
    try {
      const response = await provider.apiClient.post('/attributes/restSearch', {
        returnFormat: 'json',
        type: ['ip-src', 'ip-dst', 'domain', 'hostname', 'url'],
        timestamp: this.getUnixTimestamp(provider.lastUpdate)
      });

      return this.parseMISPResponse(response.data);

    } catch (error) {
      this.logger.error('Error fetching MISP feed:', error);
      return [];
    }
  }

  /**
   * Fetch ThreatFox feed
   */
  private async fetchThreatFoxFeed(provider: ThreatProvider): Promise<ThreatIntelligence[]> {
    try {
      const response = await provider.apiClient.post('/api/v1/', {
        query: 'get_iocs',
        days: 1
      });

      return this.parseThreatFoxResponse(response.data);

    } catch (error) {
      this.logger.error('Error fetching ThreatFox feed:', error);
      return [];
    }
  }

  /**
   * Fetch AbuseIPDB feed
   */
  private async fetchAbuseIPDBFeed(provider: ThreatProvider): Promise<ThreatIntelligence[]> {
    try {
      const response = await provider.apiClient.get('/api/v2/blacklist', {
        params: {
          confidenceMinimum: 75,
          limit: 10000
        }
      });

      return this.parseAbuseIPDBResponse(response.data);

    } catch (error) {
      this.logger.error('Error fetching AbuseIPDB feed:', error);
      return [];
    }
  }

  /**
   * Fetch generic feed
   */
  private async fetchGenericFeed(provider: ThreatProvider): Promise<ThreatIntelligence[]> {
    try {
      const response = await provider.apiClient.get(provider.config.feedUrl);
      return this.parseGenericResponse(response.data, provider.name);

    } catch (error) {
      this.logger.error(`Error fetching generic feed for ${provider.name}:`, error);
      return [];
    }
  }

  /**
   * Check IP against threat intelligence
   */
  private async checkIP(ip: string): Promise<ThreatIntelligence[]> {
    const cacheKey = `ip:${ip}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const matches: ThreatIntelligence[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.status === 'active') {
        const indicator = provider.indicators.get(ip);
        if (indicator) {
          matches.push(indicator);
        }
      }
    }

    // Cache for 5 minutes
    this.cache.set(cacheKey, matches);
    setTimeout(() => this.cache.delete(cacheKey), 300000);

    return matches;
  }

  /**
   * Check domain against threat intelligence
   */
  private async checkDomain(domain: string): Promise<ThreatIntelligence[]> {
    const cacheKey = `domain:${domain}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const matches: ThreatIntelligence[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.status === 'active') {
        const indicator = provider.indicators.get(domain);
        if (indicator) {
          matches.push(indicator);
        }
      }
    }

    this.cache.set(cacheKey, matches);
    setTimeout(() => this.cache.delete(cacheKey), 300000);

    return matches;
  }

  /**
   * Check URL against threat intelligence
   */
  private async checkURL(url: string): Promise<ThreatIntelligence[]> {
    const matches: ThreatIntelligence[] = [];

    // Extract domain from URL for additional checking
    try {
      const parsedUrl = new URL(url);
      const domainMatches = await this.checkDomain(parsedUrl.hostname);
      matches.push(...domainMatches);
    } catch (error) {
      // Invalid URL, skip domain check
    }

    // Check full URL
    for (const [name, provider] of this.providers) {
      if (provider.status === 'active') {
        const indicator = provider.indicators.get(url);
        if (indicator) {
          matches.push(indicator);
        }
      }
    }

    return matches;
  }

  /**
   * Check user agent against threat intelligence
   */
  private async checkUserAgent(userAgent: string): Promise<ThreatIntelligence[]> {
    const matches: ThreatIntelligence[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.status === 'active') {
        const indicator = provider.indicators.get(userAgent);
        if (indicator) {
          matches.push(indicator);
        }
      }
    }

    return matches;
  }

  /**
   * Check file hash against threat intelligence
   */
  private async checkFileHash(hash: string): Promise<ThreatIntelligence[]> {
    const matches: ThreatIntelligence[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.status === 'active') {
        const indicator = provider.indicators.get(hash);
        if (indicator) {
          matches.push(indicator);
        }
      }
    }

    return matches;
  }

  /**
   * Check email against threat intelligence
   */
  private async checkEmail(email: string): Promise<ThreatIntelligence[]> {
    const matches: ThreatIntelligence[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.status === 'active') {
        const indicator = provider.indicators.get(email);
        if (indicator) {
          matches.push(indicator);
        }
      }
    }

    return matches;
  }

  /**
   * Remove duplicate matches and sort by confidence
   */
  private deduplicateMatches(matches: ThreatIntelligence[]): ThreatIntelligence[] {
    const uniqueMap = new Map<string, ThreatIntelligence>();

    for (const match of matches) {
      const key = `${match.type}:${match.indicator}`;
      const existing = uniqueMap.get(key);

      if (!existing || match.confidence > existing.confidence) {
        uniqueMap.set(key, match);
      }
    }

    return Array.from(uniqueMap.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Start update schedulers for all providers
   */
  private startUpdateSchedulers(): void {
    for (const [name, provider] of this.providers) {
      if (provider.config.enabled && provider.config.updateInterval > 0) {
        // Convert interval to cron expression (simplified)
        const cronExpression = this.intervalToCron(provider.config.updateInterval);
        
        const scheduler = cron.schedule(cronExpression, async () => {
          await this.updateProviderFeed(name, provider);
        }, {
          scheduled: false
        });

        scheduler.start();
        this.updateSchedulers.set(name, scheduler);
        
        this.logger.info(`Scheduled updates for ${name}: ${cronExpression}`);
      }
    }
  }

  /**
   * Convert interval (minutes) to cron expression
   */
  private intervalToCron(intervalMinutes: number): string {
    if (intervalMinutes >= 60) {
      const hours = Math.floor(intervalMinutes / 60);
      return `0 */${hours} * * *`; // Every N hours
    } else {
      return `*/${intervalMinutes} * * * *`; // Every N minutes
    }
  }

  /**
   * Parser methods for different providers
   */
  private parseAlienVaultResponse(data: any): ThreatIntelligence[] {
    const indicators: ThreatIntelligence[] = [];

    if (data.results) {
      for (const item of data.results) {
        indicators.push({
          id: item.id || `otx-${Date.now()}-${Math.random()}`,
          type: this.mapAlienVaultType(item.type),
          indicator: item.indicator,
          confidence: item.pulse_info?.pulses?.length || 50,
          source: 'AlienVault OTX',
          firstSeen: new Date(item.created),
          lastSeen: new Date(item.modified),
          tags: item.pulse_info?.pulses?.map((p: any) => p.name) || [],
          description: item.description || '',
          references: item.pulse_info?.pulses?.map((p: any) => p.references).flat() || []
        });
      }
    }

    return indicators;
  }

  private parseMISPResponse(data: any): ThreatIntelligence[] {
    const indicators: ThreatIntelligence[] = [];

    if (data.response?.Attribute) {
      for (const attr of data.response.Attribute) {
        indicators.push({
          id: `misp-${attr.id}`,
          type: this.mapMISPType(attr.type),
          indicator: attr.value,
          confidence: parseInt(attr.to_ids) ? 80 : 50,
          source: 'MISP',
          firstSeen: new Date(attr.timestamp * 1000),
          lastSeen: new Date(attr.timestamp * 1000),
          tags: attr.Tag?.map((t: any) => t.name) || [],
          description: attr.comment || '',
          references: []
        });
      }
    }

    return indicators;
  }

  private parseThreatFoxResponse(data: any): ThreatIntelligence[] {
    const indicators: ThreatIntelligence[] = [];

    if (data.query_status === 'ok' && data.data) {
      for (const item of data.data) {
        indicators.push({
          id: `threatfox-${item.id}`,
          type: this.mapThreatFoxType(item.ioc_type),
          indicator: item.ioc,
          confidence: item.confidence_level || 50,
          source: 'ThreatFox',
          firstSeen: new Date(item.first_seen),
          lastSeen: new Date(item.last_seen || item.first_seen),
          tags: item.tags || [],
          description: item.malware || '',
          references: item.reference ? [item.reference] : []
        });
      }
    }

    return indicators;
  }

  private parseAbuseIPDBResponse(data: any): ThreatIntelligence[] {
    const indicators: ThreatIntelligence[] = [];

    if (data.data) {
      for (const item of data.data) {
        indicators.push({
          id: `abuseipdb-${item.ipAddress}`,
          type: ThreatType.IP_ADDRESS,
          indicator: item.ipAddress,
          confidence: item.abuseConfidencePercentage,
          source: 'AbuseIPDB',
          firstSeen: new Date(),
          lastSeen: new Date(item.lastReportedAt),
          tags: [],
          description: `Abuse confidence: ${item.abuseConfidencePercentage}%`,
          references: []
        });
      }
    }

    return indicators;
  }

  private parseGenericResponse(data: any, providerName: string): ThreatIntelligence[] {
    // Generic parser for custom feeds
    const indicators: ThreatIntelligence[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'string') {
          // Simple list of indicators
          indicators.push({
            id: `${providerName}-${item}`,
            type: this.detectIndicatorType(item),
            indicator: item,
            confidence: 50,
            source: providerName,
            firstSeen: new Date(),
            lastSeen: new Date(),
            tags: [],
            description: '',
            references: []
          });
        }
      }
    }

    return indicators;
  }

  /**
   * Type mapping methods
   */
  private mapAlienVaultType(type: string): ThreatType {
    const typeMap: { [key: string]: ThreatType } = {
      'IPv4': ThreatType.IP_ADDRESS,
      'domain': ThreatType.DOMAIN,
      'hostname': ThreatType.DOMAIN,
      'url': ThreatType.URL,
      'file_hash': ThreatType.FILE_HASH,
      'email': ThreatType.EMAIL
    };

    return typeMap[type] || ThreatType.IP_ADDRESS;
  }

  private mapMISPType(type: string): ThreatType {
    const typeMap: { [key: string]: ThreatType } = {
      'ip-src': ThreatType.IP_ADDRESS,
      'ip-dst': ThreatType.IP_ADDRESS,
      'domain': ThreatType.DOMAIN,
      'hostname': ThreatType.DOMAIN,
      'url': ThreatType.URL,
      'md5': ThreatType.FILE_HASH,
      'sha1': ThreatType.FILE_HASH,
      'sha256': ThreatType.FILE_HASH,
      'email-src': ThreatType.EMAIL
    };

    return typeMap[type] || ThreatType.IP_ADDRESS;
  }

  private mapThreatFoxType(type: string): ThreatType {
    const typeMap: { [key: string]: ThreatType } = {
      'ip:port': ThreatType.IP_ADDRESS,
      'domain': ThreatType.DOMAIN,
      'url': ThreatType.URL,
      'md5_hash': ThreatType.FILE_HASH,
      'sha1_hash': ThreatType.FILE_HASH,
      'sha256_hash': ThreatType.FILE_HASH
    };

    return typeMap[type] || ThreatType.IP_ADDRESS;
  }

  private detectIndicatorType(indicator: string): ThreatType {
    // Simple detection based on pattern
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(indicator)) {
      return ThreatType.IP_ADDRESS;
    }
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(indicator)) {
      return ThreatType.DOMAIN;
    }
    if (indicator.startsWith('http')) {
      return ThreatType.URL;
    }
    if (/^[a-f0-9]{32}$/.test(indicator) || /^[a-f0-9]{40}$/.test(indicator) || /^[a-f0-9]{64}$/.test(indicator)) {
      return ThreatType.FILE_HASH;
    }
    
    return ThreatType.IP_ADDRESS; // Default
  }

  /**
   * Utility methods
   */
  private getLastUpdateISO(date: Date): string {
    return date.toISOString();
  }

  private getUnixTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }
}