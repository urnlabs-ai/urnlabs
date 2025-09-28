import { EventEmitter } from 'events';
import { SecurityIncident, IncidentType, IncidentCategory, IncidentSeverity, ThreatIndicator } from './incident-response';

export interface ClassificationRule {
  id: string;
  name: string;
  description: string;
  conditions: ClassificationCondition[];
  actions: ClassificationAction[];
  priority: number;
  enabled: boolean;
  lastUpdated: Date;
  accuracy?: number; // Track rule accuracy over time
}

export interface ClassificationCondition {
  field: string;
  operator: 'contains' | 'equals' | 'matches' | 'gt' | 'lt' | 'in' | 'not_in';
  value: any;
  weight: number; // Weight of this condition (0-1)
}

export interface ClassificationAction {
  type: 'set_incident_type' | 'set_severity' | 'set_category' | 'add_tag' | 'assign_team' | 'escalate' | 'auto_contain';
  value: any;
  confidence: number; // Confidence level (0-1)
}

export interface ThreatIntelligenceSource {
  id: string;
  name: string;
  type: 'ioc_feed' | 'reputation_service' | 'malware_database' | 'vulnerability_database';
  url?: string;
  apiKey?: string;
  updateInterval: number; // minutes
  enabled: boolean;
  lastUpdate?: Date;
}

export interface ThreatIntelligenceData {
  indicator: string;
  type: 'ip' | 'domain' | 'hash' | 'email' | 'url' | 'file';
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  sources: string[];
  tags: string[];
  firstSeen: Date;
  lastSeen: Date;
  attributes: Record<string, any>;
}

export interface MLModel {
  id: string;
  name: string;
  type: 'classification' | 'anomaly_detection' | 'threat_scoring';
  version: string;
  accuracy: number;
  lastTrained: Date;
  features: string[];
  enabled: boolean;
}

export interface ClassificationResult {
  incidentType: IncidentType;
  category: IncidentCategory;
  severity: IncidentSeverity;
  confidence: number;
  reasoning: string[];
  suggestedActions: string[];
  riskScore: number;
  tags: string[];
}

export class AutomatedIncidentClassifier extends EventEmitter {
  private classificationRules: Map<string, ClassificationRule> = new Map();
  private threatIntelligence: Map<string, ThreatIntelligenceData> = new Map();
  private threatSources: Map<string, ThreatIntelligenceSource> = new Map();
  private mlModels: Map<string, MLModel> = new Map();
  private classificationHistory: Map<string, ClassificationResult> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeClassifier();
  }

  private initializeClassifier(): void {
    this.setupDefaultRules();
    this.setupThreatIntelligenceSources();
    this.startThreatIntelligenceUpdates();
    this.initializeMLModels();
  }

  /**
   * Classify an incident using multiple techniques
   */
  async classifyIncident(incident: Partial<SecurityIncident>): Promise<ClassificationResult> {
    const results: ClassificationResult[] = [];

    // Rule-based classification
    const ruleResult = await this.classifyWithRules(incident);
    if (ruleResult) results.push(ruleResult);

    // Threat intelligence classification
    const threatResult = await this.classifyWithThreatIntelligence(incident);
    if (threatResult) results.push(threatResult);

    // ML-based classification
    const mlResult = await this.classifyWithML(incident);
    if (mlResult) results.push(mlResult);

    // Pattern-based classification
    const patternResult = await this.classifyWithPatterns(incident);
    if (patternResult) results.push(patternResult);

    // Combine results using weighted voting
    const finalResult = this.combineClassificationResults(results);

    // Store for learning
    this.classificationHistory.set(
      incident.incidentId || this.generateTempId(),
      finalResult
    );

    this.emit('incident_classified', { incident, result: finalResult });

    return finalResult;
  }

  /**
   * Rule-based classification
   */
  private async classifyWithRules(incident: Partial<SecurityIncident>): Promise<ClassificationResult | null> {
    const applicableRules: Array<{ rule: ClassificationRule; score: number }> = [];

    for (const rule of this.classificationRules.values()) {
      if (!rule.enabled) continue;

      const score = this.evaluateRule(rule, incident);
      if (score > 0.5) { // Threshold for rule applicability
        applicableRules.push({ rule, score });
      }
    }

    if (applicableRules.length === 0) return null;

    // Sort by priority and score
    applicableRules.sort((a, b) =>
      (b.rule.priority - a.rule.priority) || (b.score - a.score)
    );

    // Apply the highest scoring rule
    const topRule = applicableRules[0];
    return this.applyRuleActions(topRule.rule, topRule.score, incident);
  }

  /**
   * Threat intelligence-based classification
   */
  private async classifyWithThreatIntelligence(incident: Partial<SecurityIncident>): Promise<ClassificationResult | null> {
    if (!incident.indicators || incident.indicators.length === 0) return null;

    let maxThreatLevel = 'low';
    let totalConfidence = 0;
    let matchedIndicators = 0;
    const reasoning: string[] = [];
    const tags: string[] = [];

    for (const indicator of incident.indicators) {
      const threatData = this.threatIntelligence.get(indicator.value);
      if (threatData) {
        matchedIndicators++;
        totalConfidence += threatData.confidence;

        if (this.compareThreatLevel(threatData.threatLevel, maxThreatLevel) > 0) {
          maxThreatLevel = threatData.threatLevel;
        }

        reasoning.push(`Indicator ${indicator.value} found in threat intelligence: ${threatData.threatLevel} threat`);
        tags.push(...threatData.tags);
      }
    }

    if (matchedIndicators === 0) return null;

    const confidence = totalConfidence / matchedIndicators;
    const severity = this.mapThreatLevelToSeverity(maxThreatLevel);

    return {
      incidentType: this.inferTypeFromTags(tags),
      category: 'confidentiality',
      severity,
      confidence,
      reasoning,
      suggestedActions: this.getSuggestedActionsForThreat(maxThreatLevel),
      riskScore: this.calculateRiskScore(severity, confidence, matchedIndicators),
      tags: [...new Set(tags)]
    };
  }

  /**
   * ML-based classification
   */
  private async classifyWithML(incident: Partial<SecurityIncident>): Promise<ClassificationResult | null> {
    // Simplified ML classification - in production would use actual ML models
    const features = this.extractFeatures(incident);

    // Simulate ML model prediction
    const prediction = this.simulateMLPrediction(features);

    if (prediction.confidence < 0.6) return null;

    return {
      incidentType: prediction.type,
      category: prediction.category,
      severity: prediction.severity,
      confidence: prediction.confidence,
      reasoning: [`ML model ${prediction.modelId} prediction with ${(prediction.confidence * 100).toFixed(1)}% confidence`],
      suggestedActions: prediction.suggestedActions,
      riskScore: prediction.riskScore,
      tags: prediction.tags
    };
  }

  /**
   * Pattern-based classification
   */
  private async classifyWithPatterns(incident: Partial<SecurityIncident>): Promise<ClassificationResult | null> {
    const patterns = this.getKnownAttackPatterns();
    const description = incident.description?.toLowerCase() || '';
    const title = incident.title?.toLowerCase() || '';
    const content = `${title} ${description}`;

    for (const pattern of patterns) {
      const matches = pattern.keywords.filter(keyword =>
        content.includes(keyword.toLowerCase())
      ).length;

      if (matches >= pattern.threshold) {
        return {
          incidentType: pattern.type,
          category: pattern.category,
          severity: pattern.severity,
          confidence: Math.min(matches / pattern.keywords.length, 1.0),
          reasoning: [`Pattern match: ${matches}/${pattern.keywords.length} keywords matched for ${pattern.name}`],
          suggestedActions: pattern.suggestedActions,
          riskScore: pattern.baseRiskScore * (matches / pattern.keywords.length),
          tags: pattern.tags
        };
      }
    }

    return null;
  }

  /**
   * Combine multiple classification results
   */
  private combineClassificationResults(results: ClassificationResult[]): ClassificationResult {
    if (results.length === 0) {
      return this.getDefaultClassification();
    }

    if (results.length === 1) {
      return results[0];
    }

    // Weighted voting based on confidence
    const weights = results.map(r => r.confidence);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Determine incident type by highest weighted confidence
    const typeVotes = new Map<IncidentType, number>();
    const severityVotes = new Map<IncidentSeverity, number>();
    const categoryVotes = new Map<IncidentCategory, number>();

    results.forEach((result, index) => {
      const weight = weights[index] / totalWeight;

      typeVotes.set(result.incidentType, (typeVotes.get(result.incidentType) || 0) + weight);
      severityVotes.set(result.severity, (severityVotes.get(result.severity) || 0) + weight);
      categoryVotes.set(result.category, (categoryVotes.get(result.category) || 0) + weight);
    });

    const winningType = this.getMapWinner(typeVotes);
    const winningSeverity = this.getMapWinner(severityVotes);
    const winningCategory = this.getMapWinner(categoryVotes);

    // Combine reasoning and actions
    const allReasoning = results.flatMap(r => r.reasoning);
    const allActions = [...new Set(results.flatMap(r => r.suggestedActions))];
    const allTags = [...new Set(results.flatMap(r => r.tags))];

    // Calculate combined confidence and risk score
    const combinedConfidence = results.reduce((sum, r, i) =>
      sum + (r.confidence * weights[i] / totalWeight), 0
    );
    const combinedRiskScore = results.reduce((sum, r, i) =>
      sum + (r.riskScore * weights[i] / totalWeight), 0
    );

    return {
      incidentType: winningType,
      category: winningCategory,
      severity: winningSeverity,
      confidence: combinedConfidence,
      reasoning: allReasoning,
      suggestedActions: allActions,
      riskScore: combinedRiskScore,
      tags: allTags
    };
  }

  /**
   * Update threat intelligence from external sources
   */
  async updateThreatIntelligence(): Promise<void> {
    for (const source of this.threatSources.values()) {
      if (!source.enabled) continue;

      try {
        const threatData = await this.fetchThreatData(source);
        this.processThreatData(threatData, source);

        source.lastUpdate = new Date();
        this.emit('threat_intelligence_updated', { source: source.id, count: threatData.length });
      } catch (error) {
        console.error(`Failed to update threat intelligence from ${source.name}:`, error);
        this.emit('threat_intelligence_error', { source: source.id, error });
      }
    }
  }

  /**
   * Add or update classification rule
   */
  addClassificationRule(rule: ClassificationRule): void {
    this.classificationRules.set(rule.id, rule);
    this.emit('rule_added', rule);
  }

  /**
   * Train and improve classification accuracy
   */
  async trainClassifier(incidents: SecurityIncident[], feedbackData: Map<string, ClassificationResult>): Promise<void> {
    // Analyze classification accuracy
    for (const [incidentId, actualResult] of feedbackData.entries()) {
      const predictedResult = this.classificationHistory.get(incidentId);
      if (predictedResult) {
        const accuracy = this.calculateAccuracy(predictedResult, actualResult);

        // Update rule accuracies based on feedback
        await this.updateRuleAccuracies(incidentId, accuracy);
      }
    }

    // Retrain ML models if accuracy drops below threshold
    await this.retrainMLModels(incidents, feedbackData);

    this.emit('classifier_trained', {
      incidents: incidents.length,
      feedback: feedbackData.size
    });
  }

  /**
   * Get classification statistics
   */
  getClassificationStats(): any {
    const totalClassifications = this.classificationHistory.size;
    const typeDistribution = new Map<IncidentType, number>();
    const severityDistribution = new Map<IncidentSeverity, number>();

    let totalConfidence = 0;
    let totalRiskScore = 0;

    for (const result of this.classificationHistory.values()) {
      typeDistribution.set(result.incidentType, (typeDistribution.get(result.incidentType) || 0) + 1);
      severityDistribution.set(result.severity, (severityDistribution.get(result.severity) || 0) + 1);
      totalConfidence += result.confidence;
      totalRiskScore += result.riskScore;
    }

    return {
      totalClassifications,
      averageConfidence: totalClassifications > 0 ? totalConfidence / totalClassifications : 0,
      averageRiskScore: totalClassifications > 0 ? totalRiskScore / totalClassifications : 0,
      typeDistribution: Object.fromEntries(typeDistribution),
      severityDistribution: Object.fromEntries(severityDistribution),
      ruleCount: this.classificationRules.size,
      threatIntelligenceCount: this.threatIntelligence.size,
      mlModelCount: this.mlModels.size
    };
  }

  /**
   * Private helper methods
   */

  private setupDefaultRules(): void {
    const defaultRules: ClassificationRule[] = [
      {
        id: 'malware_detection',
        name: 'Malware Detection Rule',
        description: 'Detects malware-related incidents',
        conditions: [
          { field: 'description', operator: 'contains', value: 'malware', weight: 0.8 },
          { field: 'description', operator: 'contains', value: 'virus', weight: 0.7 },
          { field: 'title', operator: 'contains', value: 'trojan', weight: 0.9 }
        ],
        actions: [
          { type: 'set_incident_type', value: 'malware', confidence: 0.9 },
          { type: 'set_severity', value: 'high', confidence: 0.8 },
          { type: 'set_category', value: 'integrity', confidence: 0.7 },
          { type: 'add_tag', value: 'automated_classification', confidence: 1.0 }
        ],
        priority: 10,
        enabled: true,
        lastUpdated: new Date()
      },
      {
        id: 'data_breach_detection',
        name: 'Data Breach Detection Rule',
        description: 'Detects data breach incidents',
        conditions: [
          { field: 'description', operator: 'contains', value: 'data breach', weight: 0.9 },
          { field: 'description', operator: 'contains', value: 'personal data', weight: 0.7 },
          { field: 'affectedUsers', operator: 'gt', value: 0, weight: 0.8 }
        ],
        actions: [
          { type: 'set_incident_type', value: 'data_breach', confidence: 0.95 },
          { type: 'set_severity', value: 'critical', confidence: 0.9 },
          { type: 'set_category', value: 'confidentiality', confidence: 0.9 },
          { type: 'escalate', value: 'privacy_team', confidence: 0.8 }
        ],
        priority: 20,
        enabled: true,
        lastUpdated: new Date()
      },
      {
        id: 'ddos_detection',
        name: 'DDoS Detection Rule',
        description: 'Detects DDoS attacks',
        conditions: [
          { field: 'description', operator: 'contains', value: 'ddos', weight: 0.9 },
          { field: 'description', operator: 'contains', value: 'traffic spike', weight: 0.7 },
          { field: 'type', operator: 'equals', value: 'ddos', weight: 1.0 }
        ],
        actions: [
          { type: 'set_incident_type', value: 'ddos', confidence: 0.9 },
          { type: 'set_severity', value: 'high', confidence: 0.8 },
          { type: 'set_category', value: 'availability', confidence: 0.9 },
          { type: 'auto_contain', value: 'block_suspicious_ips', confidence: 0.7 }
        ],
        priority: 15,
        enabled: true,
        lastUpdated: new Date()
      }
    ];

    defaultRules.forEach(rule => this.classificationRules.set(rule.id, rule));
  }

  private setupThreatIntelligenceSources(): void {
    const sources: ThreatIntelligenceSource[] = [
      {
        id: 'abuse_ch_malware',
        name: 'Abuse.ch Malware Feed',
        type: 'malware_database',
        url: 'https://bazaar.abuse.ch/api/v1/',
        updateInterval: 60,
        enabled: true
      },
      {
        id: 'alienvault_otx',
        name: 'AlienVault OTX',
        type: 'ioc_feed',
        url: 'https://otx.alienvault.com/api/v1/',
        updateInterval: 120,
        enabled: false // Requires API key
      }
    ];

    sources.forEach(source => this.threatSources.set(source.id, source));
  }

  private startThreatIntelligenceUpdates(): void {
    // Update threat intelligence every hour
    this.updateInterval = setInterval(() => {
      this.updateThreatIntelligence();
    }, 60 * 60 * 1000);

    // Initial update
    this.updateThreatIntelligence();
  }

  private initializeMLModels(): void {
    const models: MLModel[] = [
      {
        id: 'incident_classifier_v1',
        name: 'Incident Type Classifier',
        type: 'classification',
        version: '1.0.0',
        accuracy: 0.85,
        lastTrained: new Date(),
        features: ['description_length', 'keyword_count', 'source_confidence', 'affected_systems'],
        enabled: true
      }
    ];

    models.forEach(model => this.mlModels.set(model.id, model));
  }

  private evaluateRule(rule: ClassificationRule, incident: Partial<SecurityIncident>): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const condition of rule.conditions) {
      const fieldValue = this.getFieldValue(incident, condition.field);
      const conditionMet = this.evaluateCondition(fieldValue, condition.operator, condition.value);

      if (conditionMet) {
        totalScore += condition.weight;
      }
      totalWeight += condition.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private getFieldValue(incident: Partial<SecurityIncident>, field: string): any {
    const parts = field.split('.');
    let current = incident as any;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }

    return current;
  }

  private evaluateCondition(fieldValue: any, operator: string, value: any): boolean {
    if (fieldValue === null || fieldValue === undefined) return false;

    switch (operator) {
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      case 'equals':
        return fieldValue === value;
      case 'matches':
        return new RegExp(value, 'i').test(String(fieldValue));
      case 'gt':
        return Number(fieldValue) > Number(value);
      case 'lt':
        return Number(fieldValue) < Number(value);
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(fieldValue);
      default:
        return false;
    }
  }

  private applyRuleActions(rule: ClassificationRule, score: number, incident: Partial<SecurityIncident>): ClassificationResult {
    let incidentType: IncidentType = 'other';
    let category: IncidentCategory = 'operational';
    let severity: IncidentSeverity = 'medium';
    const suggestedActions: string[] = [];
    const tags: string[] = [];

    for (const action of rule.actions) {
      switch (action.type) {
        case 'set_incident_type':
          incidentType = action.value;
          break;
        case 'set_severity':
          severity = action.value;
          break;
        case 'set_category':
          category = action.value;
          break;
        case 'add_tag':
          tags.push(action.value);
          break;
        case 'auto_contain':
          suggestedActions.push(`Auto-containment: ${action.value}`);
          break;
        case 'escalate':
          suggestedActions.push(`Escalate to: ${action.value}`);
          break;
      }
    }

    return {
      incidentType,
      category,
      severity,
      confidence: score,
      reasoning: [`Rule ${rule.name} applied with score ${(score * 100).toFixed(1)}%`],
      suggestedActions,
      riskScore: this.calculateRiskScore(severity, score, rule.priority),
      tags
    };
  }

  private async fetchThreatData(source: ThreatIntelligenceSource): Promise<any[]> {
    // Simplified threat data fetching - in production would use real APIs
    if (source.id === 'abuse_ch_malware') {
      return [
        {
          indicator: '192.168.1.100',
          type: 'ip',
          threatLevel: 'high',
          confidence: 0.9,
          tags: ['malware', 'c2']
        }
      ];
    }
    return [];
  }

  private processThreatData(data: any[], source: ThreatIntelligenceSource): void {
    for (const item of data) {
      const threatData: ThreatIntelligenceData = {
        indicator: item.indicator,
        type: item.type,
        threatLevel: item.threatLevel,
        confidence: item.confidence,
        sources: [source.id],
        tags: item.tags || [],
        firstSeen: new Date(),
        lastSeen: new Date(),
        attributes: item.attributes || {}
      };

      this.threatIntelligence.set(item.indicator, threatData);
    }
  }

  private compareThreatLevel(level1: string, level2: string): number {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return (levels[level1 as keyof typeof levels] || 0) - (levels[level2 as keyof typeof levels] || 0);
  }

  private mapThreatLevelToSeverity(threatLevel: string): IncidentSeverity {
    switch (threatLevel) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private inferTypeFromTags(tags: string[]): IncidentType {
    if (tags.includes('malware')) return 'malware';
    if (tags.includes('phishing')) return 'phishing';
    if (tags.includes('ddos')) return 'ddos';
    if (tags.includes('data_breach')) return 'data_breach';
    return 'other';
  }

  private getSuggestedActionsForThreat(threatLevel: string): string[] {
    switch (threatLevel) {
      case 'critical':
        return ['Immediate isolation', 'Executive notification', 'Emergency response activation'];
      case 'high':
        return ['System isolation', 'Team notification', 'Threat hunting activation'];
      case 'medium':
        return ['Enhanced monitoring', 'Team notification', 'Evidence collection'];
      case 'low':
        return ['Log analysis', 'Routine monitoring'];
      default:
        return ['Standard investigation'];
    }
  }

  private calculateRiskScore(severity: IncidentSeverity, confidence: number, factor: number = 1): number {
    const severityScores = { low: 2, medium: 5, high: 8, critical: 10 };
    const baseScore = severityScores[severity] || 5;
    return baseScore * confidence * (factor / 10);
  }

  private extractFeatures(incident: Partial<SecurityIncident>): Record<string, number> {
    return {
      description_length: incident.description?.length || 0,
      keyword_count: this.countSecurityKeywords(incident.description || ''),
      source_confidence: incident.source?.confidence || 0,
      affected_systems: incident.affectedSystems?.length || 0,
      affected_users: incident.affectedUsers?.length || 0,
      indicators_count: incident.indicators?.length || 0
    };
  }

  private countSecurityKeywords(text: string): number {
    const keywords = ['malware', 'virus', 'trojan', 'phishing', 'breach', 'attack', 'compromise', 'unauthorized'];
    const lowerText = text.toLowerCase();
    return keywords.filter(keyword => lowerText.includes(keyword)).length;
  }

  private simulateMLPrediction(features: Record<string, number>): any {
    // Simplified ML prediction simulation
    const keywordWeight = features.keyword_count * 0.3;
    const confidenceWeight = features.source_confidence * 0.2;
    const impactWeight = (features.affected_systems + features.affected_users) * 0.1;

    const totalScore = keywordWeight + confidenceWeight + impactWeight;

    let type: IncidentType = 'other';
    let severity: IncidentSeverity = 'medium';

    if (features.keyword_count > 2) {
      type = 'malware';
      severity = 'high';
    } else if (features.affected_users > 10) {
      type = 'data_breach';
      severity = 'critical';
    }

    return {
      type,
      category: 'confidentiality' as IncidentCategory,
      severity,
      confidence: Math.min(totalScore / 5, 1),
      modelId: 'incident_classifier_v1',
      suggestedActions: ['ML-based investigation', 'Pattern analysis'],
      riskScore: totalScore,
      tags: ['ml_classified']
    };
  }

  private getKnownAttackPatterns(): any[] {
    return [
      {
        name: 'Ransomware Pattern',
        type: 'ransomware' as IncidentType,
        category: 'integrity' as IncidentCategory,
        severity: 'critical' as IncidentSeverity,
        keywords: ['ransomware', 'encrypted files', 'bitcoin', 'payment', 'decrypt'],
        threshold: 2,
        baseRiskScore: 9,
        suggestedActions: ['Immediate isolation', 'Backup verification', 'Law enforcement contact'],
        tags: ['ransomware', 'financial_impact']
      },
      {
        name: 'Phishing Pattern',
        type: 'phishing' as IncidentType,
        category: 'confidentiality' as IncidentCategory,
        severity: 'medium' as IncidentSeverity,
        keywords: ['phishing', 'fake email', 'credential', 'login', 'suspicious link'],
        threshold: 2,
        baseRiskScore: 6,
        suggestedActions: ['User notification', 'Email blocking', 'Credential reset'],
        tags: ['phishing', 'social_engineering']
      }
    ];
  }

  private getMapWinner<T>(map: Map<T, number>): T {
    let maxValue = -1;
    let winner = Array.from(map.keys())[0];

    for (const [key, value] of map.entries()) {
      if (value > maxValue) {
        maxValue = value;
        winner = key;
      }
    }

    return winner;
  }

  private getDefaultClassification(): ClassificationResult {
    return {
      incidentType: 'other',
      category: 'operational',
      severity: 'medium',
      confidence: 0.5,
      reasoning: ['Default classification - insufficient data for automated classification'],
      suggestedActions: ['Manual investigation required'],
      riskScore: 5,
      tags: ['manual_review_needed']
    };
  }

  private generateTempId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateAccuracy(predicted: ClassificationResult, actual: ClassificationResult): number {
    let score = 0;
    let total = 0;

    // Compare incident type
    if (predicted.incidentType === actual.incidentType) score += 0.4;
    total += 0.4;

    // Compare severity
    if (predicted.severity === actual.severity) score += 0.3;
    total += 0.3;

    // Compare category
    if (predicted.category === actual.category) score += 0.2;
    total += 0.2;

    // Compare confidence (within 0.2 range)
    if (Math.abs(predicted.confidence - actual.confidence) <= 0.2) score += 0.1;
    total += 0.1;

    return total > 0 ? score / total : 0;
  }

  private async updateRuleAccuracies(incidentId: string, accuracy: number): Promise<void> {
    // Update rule accuracies based on feedback
    // This would update the accuracy field of rules that were used for this incident
    console.log(`Updating rule accuracies for incident ${incidentId}: ${accuracy}`);
  }

  private async retrainMLModels(incidents: SecurityIncident[], feedback: Map<string, ClassificationResult>): Promise<void> {
    // Retrain ML models based on new data
    console.log(`Retraining ML models with ${incidents.length} incidents and ${feedback.size} feedback entries`);
  }

  public destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.removeAllListeners();
  }
}

export const automatedIncidentClassifier = new AutomatedIncidentClassifier();