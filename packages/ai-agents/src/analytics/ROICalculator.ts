/**
 * ROI Calculator
 *
 * Calculates return on investment for AI agents and workflows by measuring
 * operational savings, productivity gains, and cost benefits against investments.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { CostTracker, BillingPeriod, CostAllocation } from './CostTracker';

export interface ROIMetrics {
  totalInvestment: number;
  totalSavings: number;
  netSavings: number;
  roiPercentage: number;
  paybackPeriod: number; // months
  breakEvenDate: Date;
  period: BillingPeriod;
  currency: string;
}

export interface OperationalSavings {
  manualProcessReduction: number;
  timeReduction: number; // hours saved
  errorReduction: number; // cost of errors prevented
  qualityImprovement: number; // value of quality gains
  scalabilityBenefit: number; // cost avoided through scaling
  complianceValue: number; // value of compliance automation
}

export interface ProductivityGains {
  developerHoursSaved: number;
  deploymentTimeReduction: number;
  bugFixTimeReduction: number;
  testingAutomation: number;
  documentationAutomation: number;
  codeQualityImprovement: number;
}

export interface BusinessMetrics {
  timeToMarket: number; // days reduced
  customerSatisfaction: number; // score improvement
  teamProductivity: number; // percentage increase
  qualityScore: number; // improvement in quality metrics
  riskReduction: number; // value of risk mitigation
  innovationIndex: number; // innovation capacity increase
}

export interface ROICalculation {
  id: string;
  organizationId: string;
  calculationType: ROICalculationType;
  period: BillingPeriod;
  metrics: ROIMetrics;
  operationalSavings: OperationalSavings;
  productivityGains: ProductivityGains;
  businessMetrics: BusinessMetrics;
  breakdown: ROIBreakdown;
  assumptions: ROIAssumptions;
  confidence: number; // 0-100
  calculatedAt: Date;
  validUntil: Date;
}

export interface ROIBreakdown {
  directSavings: ROISavingsItem[];
  indirectSavings: ROISavingsItem[];
  costs: ROICostItem[];
  risks: ROIRiskItem[];
}

export interface ROISavingsItem {
  category: SavingsCategory;
  description: string;
  amount: number;
  confidence: number;
  source: string;
  methodology: string;
}

export interface ROICostItem {
  category: CostCategory;
  description: string;
  amount: number;
  type: 'one_time' | 'recurring';
  allocation: string;
}

export interface ROIRiskItem {
  description: string;
  probability: number;
  impact: number;
  riskValue: number;
  mitigation: string;
}

export interface ROIAssumptions {
  hourlyRate: number; // average developer hourly rate
  workingHoursPerMonth: number;
  errorCostMultiplier: number;
  qualityValueMultiplier: number;
  inflationRate: number;
  discountRate: number;
  customAssumptions: Record<string, any>;
}

export interface ROIComparison {
  baseline: ROICalculation;
  current: ROICalculation;
  improvement: {
    roiIncrease: number;
    paybackReduction: number;
    savingsIncrease: number;
  };
  trends: ROITrend[];
}

export interface ROITrend {
  date: Date;
  roi: number;
  savings: number;
  investment: number;
}

export interface ROIForecast {
  period: BillingPeriod;
  projectedROI: number;
  projectedSavings: number;
  projectedInvestment: number;
  confidence: number;
  factors: ROIForecastFactor[];
}

export interface ROIForecastFactor {
  name: string;
  impact: number; // percentage impact on ROI
  probability: number; // likelihood of occurrence
  description: string;
}

export enum ROICalculationType {
  COMPREHENSIVE = 'comprehensive',
  AGENT_SPECIFIC = 'agent_specific',
  WORKFLOW_SPECIFIC = 'workflow_specific',
  PROJECT_SPECIFIC = 'project_specific',
  INCREMENTAL = 'incremental'
}

export enum SavingsCategory {
  LABOR_REDUCTION = 'labor_reduction',
  ERROR_PREVENTION = 'error_prevention',
  TIME_SAVINGS = 'time_savings',
  QUALITY_IMPROVEMENT = 'quality_improvement',
  COMPLIANCE_AUTOMATION = 'compliance_automation',
  SCALABILITY = 'scalability',
  INNOVATION = 'innovation',
  RISK_MITIGATION = 'risk_mitigation'
}

export enum CostCategory {
  DEVELOPMENT = 'development',
  INFRASTRUCTURE = 'infrastructure',
  LICENSING = 'licensing',
  TRAINING = 'training',
  MAINTENANCE = 'maintenance',
  INTEGRATION = 'integration'
}

export class ROICalculator extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private costTracker: CostTracker;
  private calculationCache: Map<string, ROICalculation> = new Map();

  constructor(
    private config: {
      redis: Redis;
      prisma: PrismaClient;
      costTracker: CostTracker;
      defaultAssumptions?: ROIAssumptions;
      cacheTTL?: number;
    }
  ) {
    super();
    this.redis = config.redis;
    this.prisma = config.prisma;
    this.costTracker = config.costTracker;
  }

  /**
   * Calculate comprehensive ROI for organization
   */
  async calculateROI(
    organizationId: string,
    period: BillingPeriod,
    type: ROICalculationType = ROICalculationType.COMPREHENSIVE,
    assumptions?: Partial<ROIAssumptions>
  ): Promise<ROICalculation> {
    try {
      const calculationId = this.generateCalculationId(organizationId, period, type);

      // Check cache first
      const cached = this.calculationCache.get(calculationId);
      if (cached && cached.validUntil > new Date()) {
        return cached;
      }

      // Get cost data
      const costBreakdown = await this.costTracker.getCostBreakdown(organizationId, period);
      const totalInvestment = costBreakdown.totalCost;

      // Calculate operational savings
      const operationalSavings = await this.calculateOperationalSavings(organizationId, period);

      // Calculate productivity gains
      const productivityGains = await this.calculateProductivityGains(organizationId, period);

      // Calculate business metrics
      const businessMetrics = await this.calculateBusinessMetrics(organizationId, period);

      // Apply assumptions
      const finalAssumptions = this.mergeAssumptions(assumptions);

      // Calculate total savings
      const totalSavings = this.calculateTotalSavings(
        operationalSavings,
        productivityGains,
        businessMetrics,
        finalAssumptions
      );

      // Calculate ROI metrics
      const metrics = this.calculateROIMetrics(totalInvestment, totalSavings, period);

      // Generate breakdown
      const breakdown = await this.generateROIBreakdown(
        organizationId,
        period,
        operationalSavings,
        productivityGains,
        businessMetrics,
        finalAssumptions
      );

      // Calculate confidence
      const confidence = this.calculateConfidence(breakdown, metrics);

      const calculation: ROICalculation = {
        id: calculationId,
        organizationId,
        calculationType: type,
        period,
        metrics,
        operationalSavings,
        productivityGains,
        businessMetrics,
        breakdown,
        assumptions: finalAssumptions,
        confidence,
        calculatedAt: new Date(),
        validUntil: new Date(Date.now() + (this.config.cacheTTL || 3600000)) // 1 hour
      };

      // Cache the result
      this.calculationCache.set(calculationId, calculation);

      // Store in Redis for persistence
      await this.storeCalculation(calculation);

      this.emit('roiCalculated', calculation);
      return calculation;

    } catch (error) {
      this.emit('error', new Error(`Failed to calculate ROI: ${error.message}`));
      throw error;
    }
  }

  /**
   * Calculate operational savings from automation
   */
  async calculateOperationalSavings(
    organizationId: string,
    period: BillingPeriod
  ): Promise<OperationalSavings> {
    try {
      // Get workflow execution data
      const workflowExecutions = await this.prisma.workflowExecution.findMany({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      // Get task executions
      const taskExecutions = await this.prisma.taskExecution.findMany({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      // Calculate manual process reduction
      const manualProcessReduction = await this.calculateManualProcessReduction(
        workflowExecutions,
        taskExecutions
      );

      // Calculate time reduction
      const timeReduction = await this.calculateTimeReduction(
        workflowExecutions,
        taskExecutions
      );

      // Calculate error reduction value
      const errorReduction = await this.calculateErrorReduction(
        workflowExecutions,
        taskExecutions
      );

      // Calculate quality improvement value
      const qualityImprovement = await this.calculateQualityImprovement(
        organizationId,
        period
      );

      // Calculate scalability benefit
      const scalabilityBenefit = await this.calculateScalabilityBenefit(
        organizationId,
        period
      );

      // Calculate compliance value
      const complianceValue = await this.calculateComplianceValue(
        organizationId,
        period
      );

      return {
        manualProcessReduction,
        timeReduction,
        errorReduction,
        qualityImprovement,
        scalabilityBenefit,
        complianceValue
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to calculate operational savings: ${error.message}`));
      throw error;
    }
  }

  /**
   * Calculate productivity gains from AI automation
   */
  async calculateProductivityGains(
    organizationId: string,
    period: BillingPeriod
  ): Promise<ProductivityGains> {
    try {
      // Get performance metrics for the period
      const metrics = await this.prisma.performanceMetric.findMany({
        where: {
          organizationId,
          timestamp: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      // Calculate developer hours saved
      const developerHoursSaved = await this.calculateDeveloperHoursSaved(metrics);

      // Calculate deployment time reduction
      const deploymentTimeReduction = await this.calculateDeploymentTimeReduction(metrics);

      // Calculate bug fix time reduction
      const bugFixTimeReduction = await this.calculateBugFixTimeReduction(metrics);

      // Calculate testing automation value
      const testingAutomation = await this.calculateTestingAutomationValue(metrics);

      // Calculate documentation automation value
      const documentationAutomation = await this.calculateDocumentationAutomationValue(metrics);

      // Calculate code quality improvement value
      const codeQualityImprovement = await this.calculateCodeQualityImprovementValue(metrics);

      return {
        developerHoursSaved,
        deploymentTimeReduction,
        bugFixTimeReduction,
        testingAutomation,
        documentationAutomation,
        codeQualityImprovement
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to calculate productivity gains: ${error.message}`));
      throw error;
    }
  }

  /**
   * Calculate business impact metrics
   */
  async calculateBusinessMetrics(
    organizationId: string,
    period: BillingPeriod
  ): Promise<BusinessMetrics> {
    try {
      // These would be calculated based on historical data and benchmarks
      return {
        timeToMarket: 15, // 15 days reduction on average
        customerSatisfaction: 0.8, // 0.8 point improvement
        teamProductivity: 25, // 25% increase
        qualityScore: 20, // 20% improvement
        riskReduction: 50000, // $50k in risk mitigation value
        innovationIndex: 30 // 30% increase in innovation capacity
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to calculate business metrics: ${error.message}`));
      throw error;
    }
  }

  /**
   * Generate ROI forecast for future periods
   */
  async generateROIForecast(
    organizationId: string,
    forecastPeriod: BillingPeriod,
    historicalPeriods: number = 6
  ): Promise<ROIForecast> {
    try {
      // Get historical ROI data
      const historicalData = await this.getHistoricalROI(organizationId, historicalPeriods);

      // Analyze trends
      const trends = this.analyzeTrends(historicalData);

      // Project future ROI
      const projectedROI = this.projectROI(trends, forecastPeriod);

      // Identify forecast factors
      const factors = await this.identifyForecastFactors(organizationId, trends);

      // Calculate confidence based on data quality and trend stability
      const confidence = this.calculateForecastConfidence(historicalData, trends);

      return {
        period: forecastPeriod,
        projectedROI: projectedROI.roi,
        projectedSavings: projectedROI.savings,
        projectedInvestment: projectedROI.investment,
        confidence,
        factors
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to generate ROI forecast: ${error.message}`));
      throw error;
    }
  }

  /**
   * Compare ROI between periods or configurations
   */
  async compareROI(
    organizationId: string,
    baselinePeriod: BillingPeriod,
    comparisonPeriod: BillingPeriod
  ): Promise<ROIComparison> {
    try {
      const baseline = await this.calculateROI(organizationId, baselinePeriod);
      const current = await this.calculateROI(organizationId, comparisonPeriod);

      const improvement = {
        roiIncrease: current.metrics.roiPercentage - baseline.metrics.roiPercentage,
        paybackReduction: baseline.metrics.paybackPeriod - current.metrics.paybackPeriod,
        savingsIncrease: current.metrics.totalSavings - baseline.metrics.totalSavings
      };

      const trends = await this.getROITrends(organizationId, baselinePeriod, comparisonPeriod);

      return {
        baseline,
        current,
        improvement,
        trends
      };

    } catch (error) {
      this.emit('error', new Error(`Failed to compare ROI: ${error.message}`));
      throw error;
    }
  }

  /**
   * Calculate ROI metrics from investment and savings
   */
  private calculateROIMetrics(
    totalInvestment: number,
    totalSavings: number,
    period: BillingPeriod
  ): ROIMetrics {
    const netSavings = totalSavings - totalInvestment;
    const roiPercentage = totalInvestment > 0 ? (netSavings / totalInvestment) * 100 : 0;

    // Calculate payback period (in months)
    const periodMonths = this.getPeriodInMonths(period);
    const monthlySavings = totalSavings / periodMonths;
    const paybackPeriod = totalInvestment > 0 && monthlySavings > 0
      ? totalInvestment / monthlySavings
      : Infinity;

    // Calculate break-even date
    const breakEvenDate = paybackPeriod < Infinity
      ? new Date(period.start.getTime() + (paybackPeriod * 30 * 24 * 60 * 60 * 1000))
      : new Date(period.end.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year from end

    return {
      totalInvestment,
      totalSavings,
      netSavings,
      roiPercentage,
      paybackPeriod,
      breakEvenDate,
      period,
      currency: 'USD'
    };
  }

  /**
   * Calculate total savings from all categories
   */
  private calculateTotalSavings(
    operationalSavings: OperationalSavings,
    productivityGains: ProductivityGains,
    businessMetrics: BusinessMetrics,
    assumptions: ROIAssumptions
  ): number {
    // Convert productivity gains to monetary value
    const hourlyValue = assumptions.hourlyRate;

    const operationalValue =
      operationalSavings.manualProcessReduction +
      (operationalSavings.timeReduction * hourlyValue) +
      operationalSavings.errorReduction +
      operationalSavings.qualityImprovement +
      operationalSavings.scalabilityBenefit +
      operationalSavings.complianceValue;

    const productivityValue =
      (productivityGains.developerHoursSaved * hourlyValue) +
      (productivityGains.deploymentTimeReduction * hourlyValue * 0.5) + // Deployment time valued at 50% of dev time
      (productivityGains.bugFixTimeReduction * hourlyValue) +
      productivityGains.testingAutomation +
      productivityGains.documentationAutomation +
      productivityGains.codeQualityImprovement;

    const businessValue = businessMetrics.riskReduction; // Other business metrics are harder to quantify directly

    return operationalValue + productivityValue + businessValue;
  }

  /**
   * Helper methods
   */
  private generateCalculationId(
    organizationId: string,
    period: BillingPeriod,
    type: ROICalculationType
  ): string {
    const periodStr = `${period.start.getTime()}-${period.end.getTime()}`;
    return `roi:${organizationId}:${type}:${periodStr}`;
  }

  private mergeAssumptions(assumptions?: Partial<ROIAssumptions>): ROIAssumptions {
    const defaults: ROIAssumptions = {
      hourlyRate: 100, // $100/hour average developer rate
      workingHoursPerMonth: 160, // 40 hours/week * 4 weeks
      errorCostMultiplier: 10, // Errors cost 10x to fix
      qualityValueMultiplier: 2, // Quality improvements worth 2x the time invested
      inflationRate: 0.03, // 3% annual inflation
      discountRate: 0.08, // 8% discount rate
      customAssumptions: {}
    };

    return {
      ...defaults,
      ...this.config.defaultAssumptions,
      ...assumptions
    };
  }

  private getPeriodInMonths(period: BillingPeriod): number {
    const days = (period.end.getTime() - period.start.getTime()) / (24 * 60 * 60 * 1000);
    return days / 30.44; // Average days per month
  }

  // Placeholder implementations for detailed calculation methods
  private async calculateManualProcessReduction(workflowExecutions: any[], taskExecutions: any[]): Promise<number> {
    // Implementation would analyze automation impact
    return 50000; // $50k in manual process reduction
  }

  private async calculateTimeReduction(workflowExecutions: any[], taskExecutions: any[]): Promise<number> {
    // Implementation would analyze time savings
    return 500; // 500 hours saved
  }

  private async calculateErrorReduction(workflowExecutions: any[], taskExecutions: any[]): Promise<number> {
    // Implementation would analyze error prevention value
    return 25000; // $25k in error prevention
  }

  // ... other calculation methods would be implemented here

  private async storeCalculation(calculation: ROICalculation): Promise<void> {
    const key = `roi_calculation:${calculation.id}`;
    await this.redis.setex(key, 86400, JSON.stringify(calculation)); // 24 hours
  }

  // Additional placeholder methods
  private async generateROIBreakdown(...args: any[]): Promise<ROIBreakdown> {
    return { directSavings: [], indirectSavings: [], costs: [], risks: [] };
  }

  private calculateConfidence(breakdown: ROIBreakdown, metrics: ROIMetrics): number {
    return 85; // 85% confidence
  }

  private async getHistoricalROI(organizationId: string, periods: number): Promise<ROICalculation[]> {
    return [];
  }

  private analyzeTrends(data: ROICalculation[]): any {
    return {};
  }

  private projectROI(trends: any, period: BillingPeriod): any {
    return { roi: 0, savings: 0, investment: 0 };
  }

  private async identifyForecastFactors(organizationId: string, trends: any): Promise<ROIForecastFactor[]> {
    return [];
  }

  private calculateForecastConfidence(data: ROICalculation[], trends: any): number {
    return 75;
  }

  private async getROITrends(organizationId: string, start: BillingPeriod, end: BillingPeriod): Promise<ROITrend[]> {
    return [];
  }

  // Placeholder productivity calculation methods
  private async calculateDeveloperHoursSaved(metrics: any[]): Promise<number> { return 100; }
  private async calculateDeploymentTimeReduction(metrics: any[]): Promise<number> { return 50; }
  private async calculateBugFixTimeReduction(metrics: any[]): Promise<number> { return 75; }
  private async calculateTestingAutomationValue(metrics: any[]): Promise<number> { return 15000; }
  private async calculateDocumentationAutomationValue(metrics: any[]): Promise<number> { return 10000; }
  private async calculateCodeQualityImprovementValue(metrics: any[]): Promise<number> { return 20000; }
  private async calculateQualityImprovement(organizationId: string, period: BillingPeriod): Promise<number> { return 30000; }
  private async calculateScalabilityBenefit(organizationId: string, period: BillingPeriod): Promise<number> { return 40000; }
  private async calculateComplianceValue(organizationId: string, period: BillingPeriod): Promise<number> { return 25000; }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.calculationCache.clear();
    this.removeAllListeners();
  }
}

export default ROICalculator;