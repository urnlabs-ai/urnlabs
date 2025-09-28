/**
 * Rule Engine - Security Rule Processing and Evaluation
 * Implements signature-based detection with custom rule language
 */

import EventEmitter from 'events';
import { Logger } from 'pino';
import {
  SecurityEvent,
  IDSRule,
  IDSRuleSet,
  RuleCondition,
  ConditionOperator,
  LogicOperator,
  RuleAction,
  RuleActionType,
  SecuritySeverity,
  PatternType
} from './types';

export interface RuleEvaluationResult {
  triggered: boolean;
  ruleId?: string;
  ruleName?: string;
  severity?: SecuritySeverity;
  actions: RuleAction[];
  maxSeverity: number;
  matchedConditions: string[];
}

export class RuleEngine extends EventEmitter {
  private ruleSet: IDSRuleSet;
  private logger: Logger;
  private compiledRules: Map<string, CompiledRule> = new Map();
  private ruleStats: Map<string, RuleStatistics> = new Map();
  private isInitialized: boolean = false;

  constructor(ruleSet: IDSRuleSet, logger: Logger) {
    super();
    this.ruleSet = ruleSet;
    this.logger = logger.child({ component: 'RuleEngine' });
  }

  /**
   * Initialize the rule engine
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Rule Engine...');

      // Compile all rules
      await this.compileRules();

      // Load rule statistics
      this.loadRuleStatistics();

      this.isInitialized = true;
      this.logger.info(`Rule Engine initialized with ${this.compiledRules.size} rules`);

    } catch (error) {
      this.logger.error('Failed to initialize Rule Engine:', error);
      throw error;
    }
  }

  /**
   * Stop the rule engine
   */
  async stop(): Promise<void> {
    this.logger.info('Rule Engine stopped');
  }

  /**
   * Analyze security event against all rules
   */
  async analyzeEvent(event: SecurityEvent): Promise<RuleEvaluationResult> {
    if (!this.isInitialized) {
      throw new Error('Rule Engine not initialized');
    }

    const result: RuleEvaluationResult = {
      triggered: false,
      actions: [],
      maxSeverity: 0,
      matchedConditions: []
    };

    try {
      // Evaluate against all enabled rules
      for (const [ruleId, compiledRule] of this.compiledRules) {
        if (compiledRule.rule.enabled) {
          const evaluation = await this.evaluateRule(compiledRule, event);
          
          if (evaluation.matched) {
            result.triggered = true;
            result.ruleId = ruleId;
            result.ruleName = compiledRule.rule.name;
            result.severity = compiledRule.rule.severity;
            result.actions.push(...compiledRule.rule.actions);
            result.matchedConditions.push(...evaluation.matchedConditions);

            // Update max severity
            const severityScore = this.getSeverityScore(compiledRule.rule.severity);
            if (severityScore > result.maxSeverity) {
              result.maxSeverity = severityScore;
            }

            // Update rule statistics
            this.updateRuleStats(ruleId, true);

            this.logger.debug(`Rule triggered: ${compiledRule.rule.name} for event ${event.id}`);
            this.emit('ruleTriggered', compiledRule.rule, event);

            // If rule has block action, stop processing
            if (compiledRule.rule.actions.some(a => a.type === RuleActionType.BLOCK)) {
              break;
            }
          } else {
            this.updateRuleStats(ruleId, false);
          }
        }
      }

      return result;

    } catch (error) {
      this.logger.error(`Error analyzing event ${event.id}:`, error);
      return result;
    }
  }

  /**
   * Add new rule to the engine
   */
  async addRule(rule: IDSRule): Promise<void> {
    try {
      // Compile the rule
      const compiledRule = await this.compileRule(rule);
      
      // Add to rule set
      this.ruleSet.customRules.push(rule);
      
      // Store compiled rule
      this.compiledRules.set(rule.id, compiledRule);
      
      // Initialize statistics
      this.ruleStats.set(rule.id, {
        ruleId: rule.id,
        evaluations: 0,
        matches: 0,
        lastMatch: null,
        averageEvaluationTime: 0,
        falsePositives: 0
      });

      this.logger.info(`Added rule: ${rule.name} (${rule.id})`);
      this.emit('ruleAdded', rule);

    } catch (error) {
      this.logger.error(`Error adding rule ${rule.id}:`, error);
      throw error;
    }
  }

  /**
   * Remove rule from the engine
   */
  async removeRule(ruleId: string): Promise<void> {
    const compiledRule = this.compiledRules.get(ruleId);
    if (!compiledRule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Remove from compiled rules
    this.compiledRules.delete(ruleId);
    
    // Remove from rule set
    this.ruleSet.customRules = this.ruleSet.customRules.filter(r => r.id !== ruleId);
    
    // Remove statistics
    this.ruleStats.delete(ruleId);

    this.logger.info(`Removed rule: ${ruleId}`);
    this.emit('ruleRemoved', ruleId);
  }

  /**
   * Update rule configuration
   */
  async updateRule(rule: IDSRule): Promise<void> {
    await this.removeRule(rule.id);
    await this.addRule(rule);
  }

  /**
   * Enable/disable rule
   */
  async toggleRule(ruleId: string, enabled: boolean): Promise<void> {
    const compiledRule = this.compiledRules.get(ruleId);
    if (!compiledRule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    compiledRule.rule.enabled = enabled;
    
    this.logger.info(`Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('ruleToggled', ruleId, enabled);
  }

  /**
   * Get rule statistics
   */
  getRuleStatistics(ruleId?: string): RuleStatistics | RuleStatistics[] {
    if (ruleId) {
      const stats = this.ruleStats.get(ruleId);
      if (!stats) {
        throw new Error(`Rule statistics not found: ${ruleId}`);
      }
      return stats;
    }

    return Array.from(this.ruleStats.values());
  }

  /**
   * Get rule performance metrics
   */
  getPerformanceMetrics(): any {
    const stats = Array.from(this.ruleStats.values());
    
    return {
      totalRules: this.compiledRules.size,
      enabledRules: Array.from(this.compiledRules.values()).filter(r => r.rule.enabled).length,
      totalEvaluations: stats.reduce((sum, s) => sum + s.evaluations, 0),
      totalMatches: stats.reduce((sum, s) => sum + s.matches, 0),
      averageEvaluationTime: stats.reduce((sum, s) => sum + s.averageEvaluationTime, 0) / stats.length,
      matchRate: stats.reduce((sum, s) => sum + (s.matches / Math.max(1, s.evaluations)), 0) / stats.length * 100,
      falsePositiveRate: stats.reduce((sum, s) => sum + (s.falsePositives / Math.max(1, s.matches)), 0) / stats.length * 100
    };
  }

  /**
   * Update configuration
   */
  async updateConfiguration(ruleSet: IDSRuleSet): Promise<void> {
    this.ruleSet = ruleSet;
    await this.compileRules();
    this.logger.info('Rule engine configuration updated');
  }

  /**
   * Compile all rules
   */
  private async compileRules(): Promise<void> {
    this.compiledRules.clear();

    const allRules = [
      ...this.ruleSet.signatureRules,
      ...this.ruleSet.anomalyRules,
      ...this.ruleSet.behavioralRules,
      ...this.ruleSet.customRules
    ];

    for (const rule of allRules) {
      try {
        const compiledRule = await this.compileRule(rule);
        this.compiledRules.set(rule.id, compiledRule);
      } catch (error) {
        this.logger.error(`Failed to compile rule ${rule.id}:`, error);
      }
    }

    this.logger.info(`Compiled ${this.compiledRules.size} rules`);
  }

  /**
   * Compile individual rule
   */
  private async compileRule(rule: IDSRule): Promise<CompiledRule> {
    const compiledRule: CompiledRule = {
      rule,
      compiledPattern: null,
      compiledConditions: []
    };

    // Compile pattern based on type
    switch (rule.patternType) {
      case PatternType.REGEX:
        compiledRule.compiledPattern = new RegExp(rule.pattern, 'i');
        break;
      case PatternType.SIGNATURE:
        compiledRule.compiledPattern = this.compileSignature(rule.pattern);
        break;
      default:
        compiledRule.compiledPattern = rule.pattern;
    }

    // Compile conditions
    for (const condition of rule.conditions) {
      compiledRule.compiledConditions.push(this.compileCondition(condition));
    }

    return compiledRule;
  }

  /**
   * Compile signature pattern
   */
  private compileSignature(pattern: string): any {
    // Simplified signature compilation
    // In production, implement full Suricata/Snort signature parsing
    const parts = pattern.split(';').map(p => p.trim());
    const signature: any = {};

    for (const part of parts) {
      if (part.startsWith('content:')) {
        signature.content = part.substring(8).replace(/"/g, '');
      } else if (part.startsWith('msg:')) {
        signature.msg = part.substring(4).replace(/"/g, '');
      } else if (part.startsWith('sid:')) {
        signature.sid = part.substring(4);
      }
    }

    return signature;
  }

  /**
   * Compile condition
   */
  private compileCondition(condition: RuleCondition): CompiledCondition {
    return {
      condition,
      evaluator: this.createConditionEvaluator(condition)
    };
  }

  /**
   * Create condition evaluator function
   */
  private createConditionEvaluator(condition: RuleCondition): (event: SecurityEvent) => boolean {
    return (event: SecurityEvent) => {
      const fieldValue = this.extractFieldValue(event, condition.field);
      return this.evaluateCondition(fieldValue, condition.operator, condition.value);
    };
  }

  /**
   * Extract field value from event
   */
  private extractFieldValue(event: SecurityEvent, field: string): any {
    const parts = field.split('.');
    let value: any = event;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Evaluate individual rule against event
   */
  private async evaluateRule(compiledRule: CompiledRule, event: SecurityEvent): Promise<RuleEvaluationResult> {
    const startTime = Date.now();
    
    try {
      let matched = false;
      const matchedConditions: string[] = [];

      // Check pattern match
      if (compiledRule.compiledPattern) {
        matched = this.evaluatePattern(compiledRule, event);
        if (matched) {
          matchedConditions.push('pattern');
        }
      }

      // Check conditions
      if (compiledRule.compiledConditions.length > 0) {
        const conditionResults = compiledRule.compiledConditions.map(cc => {
          const result = cc.evaluator(event);
          if (result) {
            matchedConditions.push(cc.condition.field);
          }
          return result;
        });

        // Apply logic operators (simplified - assumes AND for now)
        const conditionsMatched = conditionResults.every(result => result);
        matched = matched || conditionsMatched;
      }

      return {
        matched,
        matchedConditions
      };

    } finally {
      // Update evaluation time statistics
      const evaluationTime = Date.now() - startTime;
      this.updateEvaluationTime(compiledRule.rule.id, evaluationTime);
    }
  }

  /**
   * Evaluate pattern match
   */
  private evaluatePattern(compiledRule: CompiledRule, event: SecurityEvent): boolean {
    const pattern = compiledRule.compiledPattern;
    
    switch (compiledRule.rule.patternType) {
      case PatternType.REGEX:
        return this.evaluateRegexPattern(pattern, event);
      case PatternType.SIGNATURE:
        return this.evaluateSignaturePattern(pattern, event);
      case PatternType.BEHAVIORAL:
        return this.evaluateBehavioralPattern(pattern, event);
      default:
        return false;
    }
  }

  /**
   * Evaluate regex pattern
   */
  private evaluateRegexPattern(regex: RegExp, event: SecurityEvent): boolean {
    const searchFields = [
      event.target.endpoint,
      event.source.userAgent,
      JSON.stringify(event.details.requestData),
      JSON.stringify(event.details.responseData)
    ].filter(Boolean);

    return searchFields.some(field => regex.test(field as string));
  }

  /**
   * Evaluate signature pattern
   */
  private evaluateSignaturePattern(signature: any, event: SecurityEvent): boolean {
    if (signature.content) {
      const searchFields = [
        event.target.endpoint,
        JSON.stringify(event.details.requestData),
        JSON.stringify(event.details.responseData)
      ].filter(Boolean);

      return searchFields.some(field => 
        (field as string).toLowerCase().includes(signature.content.toLowerCase())
      );
    }

    return false;
  }

  /**
   * Evaluate behavioral pattern
   */
  private evaluateBehavioralPattern(pattern: any, event: SecurityEvent): boolean {
    // Simplified behavioral pattern evaluation
    // In production, implement sophisticated behavioral analysis
    return event.details.baselineDeviation ? event.details.baselineDeviation > 50 : false;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(fieldValue: any, operator: ConditionOperator, conditionValue: any): boolean {
    switch (operator) {
      case ConditionOperator.EQUALS:
        return fieldValue === conditionValue;
      case ConditionOperator.NOT_EQUALS:
        return fieldValue !== conditionValue;
      case ConditionOperator.CONTAINS:
        return typeof fieldValue === 'string' && fieldValue.includes(conditionValue);
      case ConditionOperator.NOT_CONTAINS:
        return typeof fieldValue === 'string' && !fieldValue.includes(conditionValue);
      case ConditionOperator.STARTS_WITH:
        return typeof fieldValue === 'string' && fieldValue.startsWith(conditionValue);
      case ConditionOperator.ENDS_WITH:
        return typeof fieldValue === 'string' && fieldValue.endsWith(conditionValue);
      case ConditionOperator.REGEX_MATCH:
        try {
          const regex = new RegExp(conditionValue);
          return typeof fieldValue === 'string' && regex.test(fieldValue);
        } catch {
          return false;
        }
      case ConditionOperator.GREATER_THAN:
        return typeof fieldValue === 'number' && fieldValue > conditionValue;
      case ConditionOperator.LESS_THAN:
        return typeof fieldValue === 'number' && fieldValue < conditionValue;
      case ConditionOperator.IN_LIST:
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
      case ConditionOperator.NOT_IN_LIST:
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Get severity score for comparison
   */
  private getSeverityScore(severity: SecuritySeverity): number {
    const scores = {
      [SecuritySeverity.LOW]: 1,
      [SecuritySeverity.MEDIUM]: 2,
      [SecuritySeverity.HIGH]: 3,
      [SecuritySeverity.CRITICAL]: 4
    };

    return scores[severity] || 0;
  }

  /**
   * Update rule statistics
   */
  private updateRuleStats(ruleId: string, matched: boolean): void {
    let stats = this.ruleStats.get(ruleId);
    
    if (!stats) {
      stats = {
        ruleId,
        evaluations: 0,
        matches: 0,
        lastMatch: null,
        averageEvaluationTime: 0,
        falsePositives: 0
      };
      this.ruleStats.set(ruleId, stats);
    }

    stats.evaluations++;
    
    if (matched) {
      stats.matches++;
      stats.lastMatch = new Date();
    }
  }

  /**
   * Update evaluation time statistics
   */
  private updateEvaluationTime(ruleId: string, evaluationTime: number): void {
    const stats = this.ruleStats.get(ruleId);
    if (stats) {
      stats.averageEvaluationTime = 
        (stats.averageEvaluationTime * (stats.evaluations - 1) + evaluationTime) / stats.evaluations;
    }
  }

  /**
   * Load rule statistics from storage
   */
  private loadRuleStatistics(): void {
    // Implementation would load from database
    this.logger.debug('Rule statistics loaded');
  }
}

interface CompiledRule {
  rule: IDSRule;
  compiledPattern: any;
  compiledConditions: CompiledCondition[];
}

interface CompiledCondition {
  condition: RuleCondition;
  evaluator: (event: SecurityEvent) => boolean;
}

interface RuleEvaluationResult {
  matched: boolean;
  matchedConditions: string[];
}

interface RuleStatistics {
  ruleId: string;
  evaluations: number;
  matches: number;
  lastMatch: Date | null;
  averageEvaluationTime: number;
  falsePositives: number;
}