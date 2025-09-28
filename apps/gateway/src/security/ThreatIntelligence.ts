/**
 * Threat Intelligence Service
 *
 * Real-time threat intelligence integration for the API Gateway,
 * providing IP reputation, geolocation, attack pattern recognition,
 * and automated threat response capabilities.
 */

import { Redis } from 'ioredis';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../lib/logger.js';

interface ThreatIntelligenceConfig {
  enabled: boolean;

  // Data sources
  sources: {
    abuseIPDB: {
      enabled: boolean;
      apiKey?: string;
      endpoint: string;
      confidenceThreshold: number;
    };
    virustotal: {
      enabled: boolean;
      apiKey?: string;
      endpoint: string;
    };
    maxmind: {
      enabled: boolean;
      licenseKey?: string;
      databasePath?: string;
    };
    threatFox: {
      enabled: boolean;
      endpoint: string;
    };
    alienvault: {
      enabled: boolean;
      endpoint: string;
    };
  };

  // Caching configuration
  cache: {
    ipReputationTTL: number;
    geoLocationTTL: number;
    threatFeedTTL: number;
    malwareHashTTL: number;
  };

  // Reputation scoring
  reputation: {
    minScore: number;
    maxScore: number;
    defaultScore: number;
    weightings: {
      abuseIPDB: number;
      virustotal: number;
      threatFox: number;
      alienvault: number;
      historical: number;
    };
  };

  // Update intervals
  updates: {
    threatFeedsInterval: number;
    reputationInterval: number;
    geoUpdateInterval: number;
  };

  // Rate limiting for external APIs
  rateLimits: {
    abuseIPDB: number;
    virustotal: number;
    maxmind: number;
  };
}

interface IPReputationData {
  ip: string;
  score: number;
  confidence: number;
  sources: string[];
  lastSeen: number;
  categories: string[];
  countryCode?: string;
  isp?: string;
  isWhitelisted: boolean;
  isBlacklisted: boolean;
  details: Record<string, any>;
}

interface GeoLocationData {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  org: string;
  asn: string;
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  isHosting: boolean;
  accuracy: number;
}

interface ThreatIndicator {
  type: 'ip' | 'domain' | 'hash' | 'url';
  value: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  source: string;
  description: string;
  firstSeen: number;
  lastSeen: number;
  tags: string[];
  malwareFamily?: string;
  campaignId?: string;
}

interface AttackPattern {
  type: string;
  confidence: number;
  evidence: string[];
  timestamp?: number;
}

/**
 * Threat Intelligence Service
 */
export class ThreatIntelligence {
  private redis: Redis;
  private config: ThreatIntelligenceConfig;
  private httpClient: AxiosInstance;

  // Rate limiting tracking
  private apiCallCounts: Map<string, number> = new Map();
  private lastApiReset: Map<string, number> = new Map();

  // Threat feed cache
  private threatIndicators: Map<string, ThreatIndicator> = new Map();
  private lastThreatFeedUpdate: number = 0;

  constructor(redis: Redis, config: ThreatIntelligenceConfig) {
    this.redis = redis;
    this.config = config;

    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Urnlabs-Gateway-ThreatIntel/1.0'
      }
    });

    this.initializeService();
  }

  /**
   * Initialize threat intelligence service
   */
  private async initializeService(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('Threat Intelligence service disabled');
        return;
      }

      // Load cached threat data
      await this.loadCachedData();

      // Start background updates
      this.startBackgroundUpdates();

      // Initial threat feed update
      await this.updateThreatFeeds();

      logger.info('Threat Intelligence service initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Threat Intelligence service');
      throw error;
    }
  }

  /**
   * Get IP reputation score (0.0 = malicious, 1.0 = clean)
   */
  public async getIPReputation(ip: string): Promise<number> {
    try {
      // Check cache first
      const cacheKey = `threat:ip_reputation:${ip}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const data: IPReputationData = JSON.parse(cached);
        return data.score;
      }

      // Fetch reputation from multiple sources
      const reputation = await this.fetchIPReputation(ip);

      // Cache the result
      await this.redis.setex(
        cacheKey,
        this.config.cache.ipReputationTTL,
        JSON.stringify(reputation)
      );

      return reputation.score;
    } catch (error) {
      logger.error({ error, ip }, 'Failed to get IP reputation');
      return this.config.reputation.defaultScore;
    }
  }

  /**
   * Get detailed IP reputation data
   */
  public async getDetailedIPReputation(ip: string): Promise<IPReputationData> {
    const cacheKey = `threat:ip_reputation:${ip}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    return await this.fetchIPReputation(ip);
  }

  /**
   * Get geolocation data for IP
   */
  public async getGeoLocation(ip: string): Promise<GeoLocationData | null> {
    try {
      const cacheKey = `threat:geo:${ip}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const geoData = await this.fetchGeoLocation(ip);

      if (geoData) {
        await this.redis.setex(
          cacheKey,
          this.config.cache.geoLocationTTL,
          JSON.stringify(geoData)
        );
      }

      return geoData;
    } catch (error) {
      logger.error({ error, ip }, 'Failed to get geolocation');
      return null;
    }
  }

  /**
   * Check if IP is associated with known threats
   */
  public async checkThreatIndicators(ip: string): Promise<ThreatIndicator[]> {
    const indicators: ThreatIndicator[] = [];

    // Check local threat feed
    for (const [key, indicator] of this.threatIndicators.entries()) {
      if (indicator.type === 'ip' && indicator.value === ip) {
        indicators.push(indicator);
      }
    }

    // Check external threat feeds if local cache is empty
    if (indicators.length === 0) {
      const externalIndicators = await this.fetchThreatIndicators(ip);
      indicators.push(...externalIndicators);
    }

    return indicators;
  }

  /**
   * Report malicious IP for threat sharing
   */
  public async reportMaliciousIP(ip: string, attackPatterns: AttackPattern[]): Promise<void> {
    try {
      const reportData = {
        ip,
        attackPatterns,
        timestamp: Date.now(),
        source: 'urnlabs-gateway',
        confidence: this.calculateConfidence(attackPatterns)
      };

      // Store in local database
      await this.redis.lpush('threat:reports', JSON.stringify(reportData));

      // Submit to external threat sharing platforms (if configured)
      if (this.config.sources.abuseIPDB.enabled && this.config.sources.abuseIPDB.apiKey) {
        await this.submitToAbuseIPDB(ip, attackPatterns);
      }

      logger.info({ ip, attackPatterns }, 'Malicious IP reported');
    } catch (error) {
      logger.error({ error, ip }, 'Failed to report malicious IP');
    }
  }

  /**
   * Update threat feeds from external sources
   */
  public async updateThreatFeeds(): Promise<void> {
    if (!this.shouldUpdateThreatFeeds()) {
      return;
    }

    try {
      logger.info('Updating threat feeds');

      const updatePromises: Promise<any>[] = [];

      // ThreatFox feed
      if (this.config.sources.threatFox.enabled) {
        updatePromises.push(this.updateThreatFoxFeed());
      }

      // AlienVault OTX feed
      if (this.config.sources.alienvault.enabled) {
        updatePromises.push(this.updateAlienVaultFeed());
      }

      await Promise.allSettled(updatePromises);

      this.lastThreatFeedUpdate = Date.now();
      await this.redis.set('threat:last_feed_update', this.lastThreatFeedUpdate);

      logger.info('Threat feeds updated successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to update threat feeds');
    }
  }

  /**
   * Fetch IP reputation from multiple sources
   */
  private async fetchIPReputation(ip: string): Promise<IPReputationData> {
    const sources: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;
    const details: Record<string, any> = {};
    const categories: string[] = [];

    // AbuseIPDB
    if (this.config.sources.abuseIPDB.enabled && this.canMakeAPICall('abuseIPDB')) {
      try {
        const abuseData = await this.fetchAbuseIPDBData(ip);
        if (abuseData) {
          sources.push('abuseIPDB');
          const weight = this.config.reputation.weightings.abuseIPDB;
          totalScore += abuseData.score * weight;
          totalWeight += weight;
          details.abuseIPDB = abuseData;
          categories.push(...abuseData.categories);
        }
      } catch (error) {
        logger.debug({ error, ip }, 'AbuseIPDB lookup failed');
      }
    }

    // VirusTotal
    if (this.config.sources.virustotal.enabled && this.canMakeAPICall('virustotal')) {
      try {
        const vtData = await this.fetchVirusTotalData(ip);
        if (vtData) {
          sources.push('virustotal');
          const weight = this.config.reputation.weightings.virustotal;
          totalScore += vtData.score * weight;
          totalWeight += weight;
          details.virustotal = vtData;
        }
      } catch (error) {
        logger.debug({ error, ip }, 'VirusTotal lookup failed');
      }
    }

    // Calculate final score
    const finalScore = totalWeight > 0
      ? totalScore / totalWeight
      : this.config.reputation.defaultScore;

    // Check whitelist/blacklist
    const isWhitelisted = await this.isWhitelisted(ip);
    const isBlacklisted = await this.isBlacklisted(ip);

    return {
      ip,
      score: isWhitelisted ? 1.0 : (isBlacklisted ? 0.0 : finalScore),
      confidence: Math.min(sources.length * 0.3, 1.0),
      sources,
      lastSeen: Date.now(),
      categories: [...new Set(categories)],
      isWhitelisted,
      isBlacklisted,
      details
    };
  }

  /**
   * Fetch geolocation data
   */
  private async fetchGeoLocation(ip: string): Promise<GeoLocationData | null> {
    if (!this.config.sources.maxmind.enabled) {
      return null;
    }

    try {
      // This would integrate with MaxMind GeoIP2 or similar service
      // For now, using a mock implementation
      const response = await this.httpClient.get(`https://ipapi.co/${ip}/json/`);
      const data = response.data;

      return {
        ip,
        country: data.country_name,
        countryCode: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        isp: data.org,
        org: data.org,
        asn: data.asn,
        isProxy: false, // Would be determined by MaxMind data
        isVpn: false,
        isTor: false,
        isHosting: false,
        accuracy: 0.8
      };
    } catch (error) {
      logger.debug({ error, ip }, 'Geolocation lookup failed');
      return null;
    }
  }

  /**
   * Fetch threat indicators for IP
   */
  private async fetchThreatIndicators(ip: string): Promise<ThreatIndicator[]> {
    const indicators: ThreatIndicator[] = [];

    // Check ThreatFox
    if (this.config.sources.threatFox.enabled) {
      const threatFoxData = await this.fetchThreatFoxData(ip);
      indicators.push(...threatFoxData);
    }

    return indicators;
  }

  /**
   * Fetch data from AbuseIPDB
   */
  private async fetchAbuseIPDBData(ip: string): Promise<any> {
    if (!this.config.sources.abuseIPDB.apiKey) {
      return null;
    }

    const response = await this.httpClient.get(
      `${this.config.sources.abuseIPDB.endpoint}/check`,
      {
        headers: {
          'Key': this.config.sources.abuseIPDB.apiKey,
          'Accept': 'application/json'
        },
        params: {
          ipAddress: ip,
          maxAgeInDays: 90,
          verbose: ''
        }
      }
    );

    this.recordAPICall('abuseIPDB');

    const data = response.data.data;
    return {
      score: Math.max(0, 1 - (data.abuseConfidencePercentage / 100)),
      confidence: data.abuseConfidencePercentage / 100,
      categories: data.usageType ? [data.usageType] : [],
      lastReported: data.lastReportedAt,
      totalReports: data.totalReports
    };
  }

  /**
   * Fetch data from VirusTotal
   */
  private async fetchVirusTotalData(ip: string): Promise<any> {
    if (!this.config.sources.virustotal.apiKey) {
      return null;
    }

    const response = await this.httpClient.get(
      `${this.config.sources.virustotal.endpoint}/ip_addresses/${ip}`,
      {
        headers: {
          'x-apikey': this.config.sources.virustotal.apiKey
        }
      }
    );

    this.recordAPICall('virustotal');

    const data = response.data.data.attributes;
    const maliciousCount = data.last_analysis_stats.malicious || 0;
    const totalCount = Object.values(data.last_analysis_stats).reduce((a: any, b: any) => a + b, 0);

    return {
      score: totalCount > 0 ? Math.max(0, 1 - (maliciousCount / totalCount)) : 0.5,
      maliciousCount,
      totalCount,
      reputation: data.reputation,
      country: data.country
    };
  }

  /**
   * Fetch data from ThreatFox
   */
  private async fetchThreatFoxData(ip: string): Promise<ThreatIndicator[]> {
    try {
      const response = await this.httpClient.post(
        this.config.sources.threatFox.endpoint,
        {
          query: 'search_ioc',
          search_term: ip
        }
      );

      const indicators: ThreatIndicator[] = [];

      if (response.data.query_status === 'ok' && response.data.data) {
        response.data.data.forEach((item: any) => {
          indicators.push({
            type: 'ip',
            value: ip,
            severity: this.mapThreatSeverity(item.confidence_level),
            confidence: item.confidence_level / 100,
            source: 'threatfox',
            description: item.threat_type_desc,
            firstSeen: new Date(item.first_seen).getTime(),
            lastSeen: new Date(item.last_seen || item.first_seen).getTime(),
            tags: item.tags || [],
            malwareFamily: item.malware,
            campaignId: item.reference
          });
        });
      }

      return indicators;
    } catch (error) {
      logger.debug({ error, ip }, 'ThreatFox lookup failed');
      return [];
    }
  }

  /**
   * Submit malicious IP to AbuseIPDB
   */
  private async submitToAbuseIPDB(ip: string, attackPatterns: AttackPattern[]): Promise<void> {
    if (!this.config.sources.abuseIPDB.apiKey || !this.canMakeAPICall('abuseIPDB')) {
      return;
    }

    try {
      const categories = this.mapAttackPatternsToAbuseCategories(attackPatterns);
      const comment = `Automated report from Urnlabs Gateway: ${attackPatterns.map(p => p.type).join(', ')}`;

      await this.httpClient.post(
        `${this.config.sources.abuseIPDB.endpoint}/report`,
        {
          ip,
          categories: categories.join(','),
          comment
        },
        {
          headers: {
            'Key': this.config.sources.abuseIPDB.apiKey,
            'Accept': 'application/json'
          }
        }
      );

      this.recordAPICall('abuseIPDB');
      logger.info({ ip, categories }, 'Reported to AbuseIPDB');
    } catch (error) {
      logger.error({ error, ip }, 'Failed to report to AbuseIPDB');
    }
  }

  /**
   * Update ThreatFox feed
   */
  private async updateThreatFoxFeed(): Promise<void> {
    try {
      const response = await this.httpClient.post(
        this.config.sources.threatFox.endpoint,
        {
          query: 'get_iocs',
          days: 1
        }
      );

      if (response.data.query_status === 'ok' && response.data.data) {
        response.data.data.forEach((item: any) => {
          const indicator: ThreatIndicator = {
            type: item.ioc_type.toLowerCase(),
            value: item.ioc_value,
            severity: this.mapThreatSeverity(item.confidence_level),
            confidence: item.confidence_level / 100,
            source: 'threatfox',
            description: item.threat_type_desc,
            firstSeen: new Date(item.first_seen).getTime(),
            lastSeen: new Date(item.last_seen || item.first_seen).getTime(),
            tags: item.tags || [],
            malwareFamily: item.malware
          };

          this.threatIndicators.set(`${indicator.type}:${indicator.value}`, indicator);
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update ThreatFox feed');
    }
  }

  /**
   * Update AlienVault OTX feed
   */
  private async updateAlienVaultFeed(): Promise<void> {
    try {
      // This would integrate with AlienVault OTX API
      // Implementation would fetch and parse OTX pulses
      logger.debug('AlienVault OTX feed update not implemented');
    } catch (error) {
      logger.error({ error }, 'Failed to update AlienVault feed');
    }
  }

  // Utility methods
  private shouldUpdateThreatFeeds(): boolean {
    const now = Date.now();
    return now - this.lastThreatFeedUpdate > this.config.updates.threatFeedsInterval;
  }

  private canMakeAPICall(service: string): boolean {
    const now = Date.now();
    const limit = this.config.rateLimits[service as keyof typeof this.config.rateLimits];

    if (!limit) return true;

    const lastReset = this.lastApiReset.get(service) || 0;
    if (now - lastReset > 3600000) { // Reset every hour
      this.apiCallCounts.set(service, 0);
      this.lastApiReset.set(service, now);
    }

    const count = this.apiCallCounts.get(service) || 0;
    return count < limit;
  }

  private recordAPICall(service: string): void {
    const current = this.apiCallCounts.get(service) || 0;
    this.apiCallCounts.set(service, current + 1);
  }

  private async isWhitelisted(ip: string): Promise<boolean> {
    const result = await this.redis.sismember('threat:whitelist', ip);
    return result === 1;
  }

  private async isBlacklisted(ip: string): Promise<boolean> {
    const result = await this.redis.sismember('threat:blacklist', ip);
    return result === 1;
  }

  private calculateConfidence(attackPatterns: AttackPattern[]): number {
    const totalConfidence = attackPatterns.reduce((sum, pattern) => sum + pattern.confidence, 0);
    return Math.min(totalConfidence / attackPatterns.length, 1.0);
  }

  private mapThreatSeverity(level: number): 'low' | 'medium' | 'high' | 'critical' {
    if (level >= 90) return 'critical';
    if (level >= 70) return 'high';
    if (level >= 50) return 'medium';
    return 'low';
  }

  private mapAttackPatternsToAbuseCategories(patterns: AttackPattern[]): number[] {
    const categoryMap: Record<string, number> = {
      'brute_force': 18,
      'ddos': 4,
      'scanning': 14,
      'malware': 20,
      'phishing': 17,
      'spam': 10
    };

    const categories: number[] = [];
    patterns.forEach(pattern => {
      const category = categoryMap[pattern.type];
      if (category && !categories.includes(category)) {
        categories.push(category);
      }
    });

    return categories.length > 0 ? categories : [14]; // Default to scanning
  }

  private async loadCachedData(): Promise<void> {
    const lastUpdate = await this.redis.get('threat:last_feed_update');
    if (lastUpdate) {
      this.lastThreatFeedUpdate = parseInt(lastUpdate);
    }
  }

  private startBackgroundUpdates(): void {
    // Update threat feeds periodically
    setInterval(() => {
      this.updateThreatFeeds().catch(error => {
        logger.error({ error }, 'Background threat feed update failed');
      });
    }, this.config.updates.threatFeedsInterval);
  }
}

/**
 * Factory function to create threat intelligence service
 */
export function createThreatIntelligence(redis: Redis, config: ThreatIntelligenceConfig): ThreatIntelligence {
  return new ThreatIntelligence(redis, config);
}

/**
 * Default threat intelligence configuration
 */
export const DEFAULT_THREAT_INTEL_CONFIG: ThreatIntelligenceConfig = {
  enabled: true,

  sources: {
    abuseIPDB: {
      enabled: true,
      endpoint: 'https://api.abuseipdb.com/api/v2',
      confidenceThreshold: 75
    },
    virustotal: {
      enabled: true,
      endpoint: 'https://www.virustotal.com/vtapi/v2'
    },
    maxmind: {
      enabled: true
    },
    threatFox: {
      enabled: true,
      endpoint: 'https://threatfox-api.abuse.ch/api/v1/'
    },
    alienvault: {
      enabled: false,
      endpoint: 'https://otx.alienvault.com/api/v1'
    }
  },

  cache: {
    ipReputationTTL: 3600, // 1 hour
    geoLocationTTL: 86400, // 24 hours
    threatFeedTTL: 3600, // 1 hour
    malwareHashTTL: 86400 // 24 hours
  },

  reputation: {
    minScore: 0.0,
    maxScore: 1.0,
    defaultScore: 0.5,
    weightings: {
      abuseIPDB: 0.4,
      virustotal: 0.3,
      threatFox: 0.2,
      alienvault: 0.1,
      historical: 0.2
    }
  },

  updates: {
    threatFeedsInterval: 3600000, // 1 hour
    reputationInterval: 1800000, // 30 minutes
    geoUpdateInterval: 86400000 // 24 hours
  },

  rateLimits: {
    abuseIPDB: 1000, // per hour
    virustotal: 500, // per hour
    maxmind: 2000 // per hour
  }
};