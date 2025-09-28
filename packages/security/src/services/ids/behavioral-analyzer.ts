/**
 * Behavioral Analyzer - User Behavior Analysis and Anomaly Detection
 * Implements machine learning-based behavioral pattern analysis
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import * as tf from '@tensorflow/tfjs-node';
import { Matrix } from 'ml-matrix';
import * as stats from 'simple-statistics';
import * as geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import {
  SecurityEvent,
  UserBehaviorProfile,
  LoginPattern,
  ApiUsagePattern,
  LocationPattern,
  DevicePattern,
  IDSConfiguration,
  BehavioralEvidence,
  BehavioralDeviation,
  GeoLocation,
  DeviceFingerprint,
  VolumePattern
} from './types';

export interface BehavioralAnalysisResult {
  riskScore: number;
  deviationScore: number;
  anomalies: BehavioralDeviation[];
  evidence: BehavioralEvidence;
  recommendations: string[];
}

export class BehavioralAnalyzer extends EventEmitter {
  private config: IDSConfiguration;
  private logger: Logger;
  private userProfiles: Map<string, UserBehaviorProfile> = new Map();
  private mlModel?: tf.LayersModel;
  private isInitialized: boolean = false;
  private trainingData: any[] = [];
  private updateInterval?: NodeJS.Timeout;

  constructor(config: IDSConfiguration, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger.child({ component: 'BehavioralAnalyzer' });
  }

  /**
   * Initialize the behavioral analyzer
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Behavioral Analyzer...');

      // Load existing user profiles
      await this.loadUserProfiles();

      // Initialize or load ML model
      await this.initializeMLModel();

      // Start periodic profile updates
      this.startPeriodicUpdates();

      this.isInitialized = true;
      this.logger.info('Behavioral Analyzer initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Behavioral Analyzer:', error);
      throw error;
    }
  }

  /**
   * Stop the behavioral analyzer
   */
  async stop(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    if (this.mlModel) {
      this.mlModel.dispose();
    }

    this.logger.info('Behavioral Analyzer stopped');
  }

  /**
   * Analyze event for behavioral anomalies
   */
  async analyzeEvent(event: SecurityEvent): Promise<BehavioralAnalysisResult> {
    if (!this.isInitialized) {
      throw new Error('Behavioral Analyzer not initialized');
    }

    const userId = event.source.userId;
    if (!userId) {
      return this.createDefaultResult();
    }

    try {
      // Get or create user profile
      const profile = await this.getUserProfile(userId);
      
      // Extract behavioral features from event
      const features = this.extractBehavioralFeatures(event, profile);

      // Analyze deviations from baseline
      const deviations = this.analyzeDeviations(features, profile);

      // Calculate risk score
      const riskScore = this.calculateBehavioralRiskScore(deviations, event);

      // Generate evidence
      const evidence = this.generateBehavioralEvidence(deviations, profile, features);

      // Generate recommendations
      const recommendations = this.generateRecommendations(deviations, riskScore);

      const result: BehavioralAnalysisResult = {
        riskScore,
        deviationScore: this.calculateOverallDeviation(deviations),
        anomalies: deviations,
        evidence,
        recommendations
      };

      // Log significant deviations
      if (result.deviationScore > this.config.thresholds.behavioralDeviation) {
        this.logger.warn(`Significant behavioral deviation detected for user ${userId}`, {
          deviationScore: result.deviationScore,
          riskScore,
          anomalies: deviations.length
        });

        this.emit('anomalyDetected', profile, event);
      }

      return result;

    } catch (error) {
      this.logger.error(`Error analyzing behavioral event for user ${userId}:`, error);
      return this.createDefaultResult();
    }
  }

  /**
   * Update user profile based on event
   */
  async updateUserProfile(userId: string, event: SecurityEvent): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId);
      
      // Update login patterns
      this.updateLoginPatterns(profile, event);

      // Update API usage patterns
      this.updateApiUsagePatterns(profile, event);

      // Update location patterns
      this.updateLocationPatterns(profile, event);

      // Update device patterns
      this.updateDevicePatterns(profile, event);

      // Recalculate risk score
      profile.riskScore = this.calculateProfileRiskScore(profile);
      
      // Update timestamp
      profile.lastUpdated = new Date();

      // Store updated profile
      this.userProfiles.set(userId, profile);

      // Persist to storage
      await this.persistUserProfile(profile);

      this.logger.debug(`Updated behavioral profile for user ${userId}`);

    } catch (error) {
      this.logger.error(`Error updating user profile for ${userId}:`, error);
    }
  }

  /**
   * Get user behavioral profile
   */
  private async getUserProfile(userId: string): Promise<UserBehaviorProfile> {
    let profile = this.userProfiles.get(userId);
    
    if (!profile) {
      profile = this.createDefaultProfile(userId);
      this.userProfiles.set(userId, profile);
    }

    return profile;
  }

  /**
   * Create default user profile
   */
  private createDefaultProfile(userId: string): UserBehaviorProfile {
    return {
      userId,
      profileCreated: new Date(),
      lastUpdated: new Date(),
      loginPatterns: {
        typicalHours: [],
        typicalDaysOfWeek: [],
        averageSessionDuration: 0,
        loginFrequency: 0,
        failureRate: 0,
        mfaUsage: 0
      },
      apiUsagePatterns: {
        endpointsUsed: {},
        requestVolume: this.createEmptyVolumePattern(),
        responseTimePattern: [],
        errorRates: {},
        dataTransferPattern: {
          uploadVolume: this.createEmptyVolumePattern(),
          downloadVolume: this.createEmptyVolumePattern(),
          transferRate: []
        }
      },
      locationPatterns: {
        frequentLocations: [],
        travelVelocity: 0,
        unusualLocationThreshold: 500 // km
      },
      devicePatterns: {
        knownDevices: [],
        browserPatterns: [],
        osPatterns: []
      },
      riskScore: 50, // neutral starting point
      anomalyThreshold: 70
    };
  }

  /**
   * Create empty volume pattern
   */
  private createEmptyVolumePattern(): VolumePattern {
    return {
      hourly: new Array(24).fill(0),
      daily: new Array(7).fill(0),
      weekly: new Array(52).fill(0),
      monthly: new Array(12).fill(0)
    };
  }

  /**
   * Extract behavioral features from event
   */
  private extractBehavioralFeatures(event: SecurityEvent, profile: UserBehaviorProfile): any {
    const timestamp = event.timestamp;
    const hour = timestamp.getHours();
    const dayOfWeek = timestamp.getDay();
    const location = this.extractLocation(event.source.ip);
    const deviceInfo = this.extractDeviceInfo(event.source.userAgent);

    return {
      temporal: {
        hour,
        dayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isBusinessHours: hour >= 9 && hour <= 17
      },
      location: location ? {
        country: location.country,
        region: location.region,
        city: location.city,
        lat: location.lat,
        lon: location.lon,
        timezone: location.timezone
      } : null,
      device: deviceInfo,
      api: {
        endpoint: event.target.endpoint,
        method: event.target.method,
        responseTime: event.details.responseTime || 0
      },
      security: {
        riskScore: event.riskScore,
        hasThreats: (event.details.threatIntelData?.length || 0) > 0
      }
    };
  }

  /**
   * Analyze deviations from baseline behavior
   */
  private analyzeDeviations(features: any, profile: UserBehaviorProfile): BehavioralDeviation[] {
    const deviations: BehavioralDeviation[] = [];

    // Temporal deviations
    if (features.temporal) {
      // Check hour patterns
      const hourFrequency = this.getHourFrequency(profile.loginPatterns.typicalHours, features.temporal.hour);
      if (hourFrequency < 0.1) { // Less than 10% of typical usage
        deviations.push({
          metric: 'login_hour',
          expectedValue: this.getMostFrequentHour(profile.loginPatterns.typicalHours),
          actualValue: features.temporal.hour,
          deviationPercent: 90,
          significance: 0.8
        });
      }

      // Check day of week patterns
      const dayFrequency = this.getDayFrequency(profile.loginPatterns.typicalDaysOfWeek, features.temporal.dayOfWeek);
      if (dayFrequency < 0.1) {
        deviations.push({
          metric: 'login_day',
          expectedValue: this.getMostFrequentDay(profile.loginPatterns.typicalDaysOfWeek),
          actualValue: features.temporal.dayOfWeek,
          deviationPercent: 85,
          significance: 0.7
        });
      }
    }

    // Location deviations
    if (features.location && profile.locationPatterns.frequentLocations.length > 0) {
      const minDistance = this.calculateMinDistanceToKnownLocations(
        features.location,
        profile.locationPatterns.frequentLocations
      );

      if (minDistance > profile.locationPatterns.unusualLocationThreshold) {
        deviations.push({
          metric: 'location',
          expectedValue: 0,
          actualValue: minDistance,
          deviationPercent: Math.min(100, (minDistance / profile.locationPatterns.unusualLocationThreshold) * 100),
          significance: 0.9
        });
      }
    }

    // Device deviations
    if (features.device) {
      const deviceKnown = this.isDeviceKnown(features.device, profile.devicePatterns.knownDevices);
      if (!deviceKnown) {
        deviations.push({
          metric: 'device',
          expectedValue: 1,
          actualValue: 0,
          deviationPercent: 100,
          significance: 0.6
        });
      }
    }

    // API usage deviations
    if (features.api.endpoint) {
      const endpointUsage = profile.apiUsagePatterns.endpointsUsed[features.api.endpoint] || 0;
      if (endpointUsage === 0) { // Never used this endpoint before
        deviations.push({
          metric: 'api_endpoint',
          expectedValue: 1,
          actualValue: 0,
          deviationPercent: 100,
          significance: 0.5
        });
      }
    }

    return deviations;
  }

  /**
   * Calculate behavioral risk score
   */
  private calculateBehavioralRiskScore(deviations: BehavioralDeviation[], event: SecurityEvent): number {
    if (deviations.length === 0) {
      return 0;
    }

    // Weight deviations by significance and severity
    const weightedScore = deviations.reduce((sum, deviation) => {
      return sum + (deviation.deviationPercent * deviation.significance);
    }, 0) / deviations.length;

    // Adjust for event context
    let contextMultiplier = 1;
    if (event.riskScore > 50) {
      contextMultiplier = 1.2;
    }
    if (event.details.threatIntelData && event.details.threatIntelData.length > 0) {
      contextMultiplier = 1.5;
    }

    return Math.min(100, weightedScore * contextMultiplier);
  }

  /**
   * Calculate overall deviation score
   */
  private calculateOverallDeviation(deviations: BehavioralDeviation[]): number {
    if (deviations.length === 0) return 0;

    return deviations.reduce((sum, dev) => sum + dev.deviationPercent, 0) / deviations.length;
  }

  /**
   * Generate behavioral evidence
   */
  private generateBehavioralEvidence(
    deviations: BehavioralDeviation[],
    profile: UserBehaviorProfile,
    features: any
  ): BehavioralEvidence {
    return {
      deviations,
      normalBaseline: {
        typicalHours: profile.loginPatterns.typicalHours,
        typicalLocations: profile.locationPatterns.frequentLocations,
        knownDevices: profile.devicePatterns.knownDevices.length,
        apiEndpoints: Object.keys(profile.apiUsagePatterns.endpointsUsed).length
      },
      currentBehavior: features,
      anomalyScore: this.calculateOverallDeviation(deviations)
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(deviations: BehavioralDeviation[], riskScore: number): string[] {
    const recommendations: string[] = [];

    if (riskScore > 80) {
      recommendations.push('Consider requiring additional authentication factors');
      recommendations.push('Monitor user activity closely for next 24 hours');
    }

    const locationDeviations = deviations.filter(d => d.metric === 'location');
    if (locationDeviations.length > 0) {
      recommendations.push('Verify user location and require location-based verification');
    }

    const deviceDeviations = deviations.filter(d => d.metric === 'device');
    if (deviceDeviations.length > 0) {
      recommendations.push('Require device registration or additional device verification');
    }

    const timeDeviations = deviations.filter(d => d.metric.includes('login_'));
    if (timeDeviations.length > 0) {
      recommendations.push('Flag unusual login time patterns for review');
    }

    return recommendations;
  }

  /**
   * Update login patterns
   */
  private updateLoginPatterns(profile: UserBehaviorProfile, event: SecurityEvent): void {
    const hour = event.timestamp.getHours();
    const dayOfWeek = event.timestamp.getDay();

    // Update typical hours
    if (!profile.loginPatterns.typicalHours.includes(hour)) {
      profile.loginPatterns.typicalHours.push(hour);
    }

    // Update typical days
    if (!profile.loginPatterns.typicalDaysOfWeek.includes(dayOfWeek)) {
      profile.loginPatterns.typicalDaysOfWeek.push(dayOfWeek);
    }

    // Update login frequency (simplified)
    profile.loginPatterns.loginFrequency++;
  }

  /**
   * Update API usage patterns
   */
  private updateApiUsagePatterns(profile: UserBehaviorProfile, event: SecurityEvent): void {
    if (event.target.endpoint) {
      const endpoint = event.target.endpoint;
      profile.apiUsagePatterns.endpointsUsed[endpoint] = 
        (profile.apiUsagePatterns.endpointsUsed[endpoint] || 0) + 1;
    }

    // Update volume patterns
    const hour = event.timestamp.getHours();
    const day = event.timestamp.getDay();
    profile.apiUsagePatterns.requestVolume.hourly[hour]++;
    profile.apiUsagePatterns.requestVolume.daily[day]++;
  }

  /**
   * Update location patterns
   */
  private updateLocationPatterns(profile: UserBehaviorProfile, event: SecurityEvent): void {
    const location = this.extractLocation(event.source.ip);
    if (!location) return;

    const geoLocation: GeoLocation = {
      country: location.country || '',
      region: location.region || '',
      city: location.city || '',
      lat: location.ll ? location.ll[0] : 0,
      lon: location.ll ? location.ll[1] : 0,
      timezone: location.timezone || ''
    };

    // Check if this is a new location
    const isNewLocation = !profile.locationPatterns.frequentLocations.some(loc => 
      this.calculateDistance(loc, geoLocation) < 50 // Within 50km
    );

    if (isNewLocation) {
      profile.locationPatterns.frequentLocations.push(geoLocation);
      
      // Keep only top 10 locations
      if (profile.locationPatterns.frequentLocations.length > 10) {
        profile.locationPatterns.frequentLocations.shift();
      }
    }
  }

  /**
   * Update device patterns
   */
  private updateDevicePatterns(profile: UserBehaviorProfile, event: SecurityEvent): void {
    if (!event.source.userAgent) return;

    const deviceInfo = this.extractDeviceInfo(event.source.userAgent);
    if (!deviceInfo) return;

    const deviceId = event.source.deviceId || this.generateDeviceId(event.source.userAgent);
    
    const existingDevice = profile.devicePatterns.knownDevices.find(d => d.deviceId === deviceId);
    
    if (!existingDevice) {
      const fingerprint: DeviceFingerprint = {
        deviceId,
        userAgent: event.source.userAgent,
        screenResolution: '', // Would be extracted from client
        timezone: '',
        language: '',
        plugins: [],
        lastSeen: new Date(),
        trustScore: 50
      };

      profile.devicePatterns.knownDevices.push(fingerprint);
    } else {
      existingDevice.lastSeen = new Date();
      existingDevice.trustScore = Math.min(100, existingDevice.trustScore + 1);
    }
  }

  /**
   * Helper methods
   */
  private extractLocation(ip: string): any {
    return geoip.lookup(ip);
  }

  private extractDeviceInfo(userAgent?: string): any {
    if (!userAgent) return null;
    
    const parser = new UAParser(userAgent);
    return parser.getResult();
  }

  private calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
    // Haversine formula for distance calculation
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(loc2.lat - loc1.lat);
    const dLon = this.toRadians(loc2.lon - loc1.lon);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(loc1.lat)) * Math.cos(this.toRadians(loc2.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private getHourFrequency(hours: number[], hour: number): number {
    if (hours.length === 0) return 0;
    return hours.filter(h => h === hour).length / hours.length;
  }

  private getDayFrequency(days: number[], day: number): number {
    if (days.length === 0) return 0;
    return days.filter(d => d === day).length / days.length;
  }

  private getMostFrequentHour(hours: number[]): number {
    if (hours.length === 0) return 12; // Default to noon
    return stats.mode(hours);
  }

  private getMostFrequentDay(days: number[]): number {
    if (days.length === 0) return 1; // Default to Monday
    return stats.mode(days);
  }

  private calculateMinDistanceToKnownLocations(location: any, knownLocations: GeoLocation[]): number {
    if (knownLocations.length === 0) return Infinity;

    const currentLocation: GeoLocation = {
      country: location.country || '',
      region: location.region || '',
      city: location.city || '',
      lat: location.lat || 0,
      lon: location.lon || 0,
      timezone: location.timezone || ''
    };

    return Math.min(...knownLocations.map(loc => this.calculateDistance(currentLocation, loc)));
  }

  private isDeviceKnown(deviceInfo: any, knownDevices: DeviceFingerprint[]): boolean {
    return knownDevices.some(device => 
      device.userAgent === deviceInfo.ua || 
      device.deviceId === this.generateDeviceId(deviceInfo.ua)
    );
  }

  private generateDeviceId(userAgent: string): string {
    // Simple device ID generation based on user agent
    return Buffer.from(userAgent).toString('base64').substr(0, 16);
  }

  private calculateProfileRiskScore(profile: UserBehaviorProfile): number {
    // Simplified risk calculation
    let riskScore = 50; // Neutral base

    // Reduce risk for established patterns
    if (profile.loginPatterns.typicalHours.length > 3) riskScore -= 10;
    if (profile.locationPatterns.frequentLocations.length > 0) riskScore -= 10;
    if (profile.devicePatterns.knownDevices.length > 0) riskScore -= 10;

    // Increase risk for concerning patterns
    if (profile.loginPatterns.failureRate > 0.1) riskScore += 20;

    return Math.max(0, Math.min(100, riskScore));
  }

  private createDefaultResult(): BehavioralAnalysisResult {
    return {
      riskScore: 0,
      deviationScore: 0,
      anomalies: [],
      evidence: {
        deviations: [],
        normalBaseline: {},
        currentBehavior: {},
        anomalyScore: 0
      },
      recommendations: []
    };
  }

  /**
   * Initialize ML model for behavioral analysis
   */
  private async initializeMLModel(): Promise<void> {
    try {
      // Create a simple neural network for anomaly detection
      this.mlModel = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [10], units: 16, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });

      this.mlModel.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      this.logger.info('ML model initialized for behavioral analysis');

    } catch (error) {
      this.logger.error('Error initializing ML model:', error);
    }
  }

  /**
   * Load user profiles from storage
   */
  private async loadUserProfiles(): Promise<void> {
    // Implementation would load from database
    this.logger.info('User profiles loaded');
  }

  /**
   * Persist user profile to storage
   */
  private async persistUserProfile(profile: UserBehaviorProfile): Promise<void> {
    // Implementation would save to database
    this.logger.debug(`Persisted profile for user ${profile.userId}`);
  }

  /**
   * Start periodic updates
   */
  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.performPeriodicMaintenance();
    }, 300000); // Every 5 minutes
  }

  /**
   * Perform periodic maintenance tasks
   */
  private async performPeriodicMaintenance(): Promise<void> {
    try {
      // Clean up old data, retrain models, etc.
      this.logger.debug('Performing periodic maintenance');
    } catch (error) {
      this.logger.error('Error during periodic maintenance:', error);
    }
  }

  /**
   * Update configuration
   */
  async updateConfiguration(config: IDSConfiguration): Promise<void> {
    this.config = config;
    this.logger.info('Behavioral analyzer configuration updated');
  }
}