/**
 * Budget Manager
 *
 * Manages budget allocation, tracking, and forecasting for AI agents and workflows
 * with real-time monitoring, alerts, and cost optimization recommendations.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { CostTracker, BillingPeriod, CostThreshold } from './CostTracker';

export interface Budget {
  id: string;
  name: string;
  organizationId: string;
  totalAmount: number;
  currency: string;
  period: BillingPeriod;
  categories: BudgetCategory[];
  allocations: BudgetAllocation[];
  status: BudgetStatus;
  approvals: BudgetApproval[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetCategory {
  id: string;
  name: string;
  description: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  utilization: number; // percentage
  forecastedAmount: number;
  thresholds: BudgetThreshold[];
  subcategories?: BudgetCategory[];
}

export interface BudgetAllocation {
  id: string;
  budgetId: string;
  categoryId: string;
  resourceType: AllocationResourceType;
  resourceId: string;
  allocatedAmount: number;
  priority: AllocationPriority;
  justification: string;
  approvedBy?: string;
  approvedAt?: Date;
  status: AllocationStatus;
}

export interface BudgetThreshold {
  id: string;
  type: ThresholdType;
  value: number;
  percentage?: number;
  alertLevel: AlertLevel;
  actions: ThresholdAction[];
  isActive: boolean;
}

export interface ThresholdAction {
  type: ActionType;
  trigger: number; // percentage threshold
  parameters: Record<string, any>;
  recipients: string[];
}

export interface BudgetApproval {
  id: string;
  budgetId: string;
  approverId: string;
  status: ApprovalStatus;
  comments?: string;
  approvedAt?: Date;
  level: ApprovalLevel;
}

export interface BudgetForecast {
  budgetId: string;
  period: BillingPeriod;
  projectedSpending: number;
  projectedOverrun: number;
  confidence: number;
  factors: ForecastFactor[];
  scenarios: ForecastScenario[];
  recommendations: ForecastRecommendation[];
}

export interface ForecastFactor {
  name: string;
  impact: number; // percentage impact on spending
  probability: number; // likelihood of occurrence
  description: string;
  category: string;
}

export interface ForecastScenario {
  name: string;
  probability: number;
  projectedSpending: number;
  description: string;
}

export interface ForecastRecommendation {
  type: RecommendationType;
  description: string;
  expectedSavings: number;
  implementationEffort: ImplementationEffort;
  priority: RecommendationPriority;
  deadline?: Date;
}

export interface BudgetReport {
  budgetId: string;
  period: BillingPeriod;
  summary: BudgetSummary;
  categoryBreakdown: CategoryBreakdown[];
  trends: BudgetTrend[];
  alerts: BudgetAlert[];
  variance: BudgetVariance;
  recommendations: BudgetRecommendation[];
}

export interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationPercentage: number;
  forecastedTotal: number;
  projectedOverrun: number;
  daysRemaining: number;
  burnRate: number; // spending per day
}

export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  budget: number;
  spent: number;
  remaining: number;
  utilization: number;
  forecast: number;
  variance: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface BudgetTrend {
  date: Date;
  spentAmount: number;
  forecastAmount: number;
  category?: string;
}

export interface BudgetAlert {
  id: string;
  budgetId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  categoryId?: string;
  threshold: number;
  currentValue: number;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface BudgetVariance {
  plannedVsActual: number;
  budgetVsForecast: number;
  categoryVariances: CategoryVariance[];
  varianceAnalysis: VarianceAnalysis;
}

export interface CategoryVariance {
  categoryId: string;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
  explanation: string;
}

export interface VarianceAnalysis {
  significantVariances: CategoryVariance[];
  rootCauses: string[];
  recommendations: string[];
}

export interface BudgetRecommendation {
  type: BudgetRecommendationType;
  description: string;
  impact: number;
  effort: ImplementationEffort;
  priority: RecommendationPriority;
  category?: string;
}

export enum BudgetStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  ACTIVE = 'active',
  EXCEEDED = 'exceeded',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum AllocationResourceType {
  AGENT = 'agent',
  WORKFLOW = 'workflow',
  PROJECT = 'project',
  INFRASTRUCTURE = 'infrastructure',
  EXTERNAL_SERVICE = 'external_service'
}

export enum AllocationPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum AllocationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired'
}

export enum ThresholdType {
  ABSOLUTE_AMOUNT = 'absolute_amount',
  PERCENTAGE = 'percentage',
  BURN_RATE = 'burn_rate',
  FORECAST_OVERRUN = 'forecast_overrun'
}

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export enum ActionType {
  EMAIL_ALERT = 'email_alert',
  SLACK_NOTIFICATION = 'slack_notification',
  FREEZE_SPENDING = 'freeze_spending',
  REQUIRE_APPROVAL = 'require_approval',
  AUTO_SCALE_DOWN = 'auto_scale_down'
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export enum ApprovalLevel {
  MANAGER = 'manager',
  DIRECTOR = 'director',
  EXECUTIVE = 'executive',
  BOARD = 'board'
}

export enum RecommendationType {
  COST_OPTIMIZATION = 'cost_optimization',
  REALLOCATION = 'reallocation',
  SCALE_ADJUSTMENT = 'scale_adjustment',
  PROCESS_IMPROVEMENT = 'process_improvement'
}

export enum ImplementationEffort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AlertType {
  THRESHOLD_EXCEEDED = 'threshold_exceeded',
  FORECAST_OVERRUN = 'forecast_overrun',
  BURN_RATE_HIGH = 'burn_rate_high',
  BUDGET_EXHAUSTED = 'budget_exhausted'
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum BudgetRecommendationType {
  INCREASE_BUDGET = 'increase_budget',
  REALLOCATE_FUNDS = 'reallocate_funds',
  OPTIMIZE_SPENDING = 'optimize_spending',
  DEFER_EXPENSES = 'defer_expenses'
}

export class BudgetManager extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private costTracker: CostTracker;
  private budgets: Map<string, Budget> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: {
      redis: Redis;
      prisma: PrismaClient;
      costTracker: CostTracker;
      monitoringIntervalMs?: number;
      defaultCurrency?: string;
      alertChannels?: Record<string, any>;
    }
  ) {
    super();
    this.redis = config.redis;
    this.prisma = config.prisma;
    this.costTracker = config.costTracker;
    this.initializeMonitoring();
  }

  /**
   * Initialize budget monitoring
   */
  private async initializeMonitoring(): Promise<void> {
    // Load existing budgets
    await this.loadBudgets();

    // Start monitoring interval
    const interval = this.config.monitoringIntervalMs || 300000; // 5 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorBudgets();
      } catch (error) {
        this.emit('error', error);
      }
    }, interval);

    this.emit('initialized');
  }

  /**
   * Create a new budget
   */
  async createBudget(
    organizationId: string,
    budgetData: {
      name: string;
      totalAmount: number;
      period: BillingPeriod;
      categories: Omit<BudgetCategory, 'spentAmount' | 'remainingAmount' | 'utilization' | 'forecastedAmount'>[];
      approvalRequired?: boolean;
    }
  ): Promise<Budget> {
    try {
      const budgetId = `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Process categories
      const categories = budgetData.categories.map(cat => ({
        ...cat,
        spentAmount: 0,
        remainingAmount: cat.allocatedAmount,
        utilization: 0,
        forecastedAmount: cat.allocatedAmount
      }));

      const budget: Budget = {
        id: budgetId,
        name: budgetData.name,
        organizationId,
        totalAmount: budgetData.totalAmount,
        currency: this.config.defaultCurrency || 'USD',
        period: budgetData.period,
        categories,
        allocations: [],
        status: budgetData.approvalRequired ? BudgetStatus.PENDING_APPROVAL : BudgetStatus.APPROVED,
        approvals: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store budget
      this.budgets.set(budgetId, budget);
      await this.storeBudget(budget);

      // Set up default thresholds
      await this.createDefaultThresholds(budget);

      this.emit('budgetCreated', budget);
      return budget;

    } catch (error) {
      this.emit('error', new Error(`Failed to create budget: ${error.message}`));
      throw error;
    }
  }

  /**
   * Allocate budget to specific resources
   */
  async allocateBudget(
    budgetId: string,
    allocation: Omit<BudgetAllocation, 'id' | 'budgetId' | 'status'>
  ): Promise<BudgetAllocation> {
    try {
      const budget = this.budgets.get(budgetId);
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`);
      }

      const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const budgetAllocation: BudgetAllocation = {
        ...allocation,
        id: allocationId,
        budgetId,
        status: AllocationStatus.PENDING
      };

      // Check if allocation exceeds available budget
      const category = budget.categories.find(c => c.id === allocation.categoryId);
      if (category && category.remainingAmount < allocation.allocatedAmount) {
        throw new Error(`Allocation exceeds available budget for category ${category.name}`);
      }

      // Add allocation to budget
      budget.allocations.push(budgetAllocation);
      budget.updatedAt = new Date();

      // Update category remaining amount
      if (category) {
        category.remainingAmount -= allocation.allocatedAmount;
        category.utilization = ((category.allocatedAmount - category.remainingAmount) / category.allocatedAmount) * 100;
      }

      await this.storeBudget(budget);

      this.emit('budgetAllocated', budgetAllocation);
      return budgetAllocation;

    } catch (error) {
      this.emit('error', new Error(`Failed to allocate budget: ${error.message}`));
      throw error;
    }
  }

  /**
   * Generate budget forecast
   */
  async generateForecast(
    budgetId: string,
    forecastPeriod?: BillingPeriod
  ): Promise<BudgetForecast> {
    try {
      const budget = this.budgets.get(budgetId);
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`);
      }

      const period = forecastPeriod || budget.period;

      // Get historical spending data
      const costBreakdown = await this.costTracker.getCostBreakdown(budget.organizationId, period);

      // Calculate current burn rate
      const currentSpending = costBreakdown.totalCost;
      const daysElapsed = this.getDaysInPeriod(budget.period.start, new Date());
      const burnRate = daysElapsed > 0 ? currentSpending / daysElapsed : 0;

      // Calculate projected spending
      const daysRemaining = this.getDaysInPeriod(new Date(), period.end);
      const projectedSpending = currentSpending + (burnRate * daysRemaining);
      const projectedOverrun = Math.max(0, projectedSpending - budget.totalAmount);

      // Generate forecast factors
      const factors = await this.generateForecastFactors(budget, costBreakdown);

      // Generate scenarios
      const scenarios = this.generateForecastScenarios(projectedSpending, factors);

      // Calculate confidence based on historical data stability
      const confidence = this.calculateForecastConfidence(budget, costBreakdown);

      // Generate recommendations
      const recommendations = await this.generateForecastRecommendations(budget, projectedOverrun);

      const forecast: BudgetForecast = {
        budgetId,
        period,
        projectedSpending,
        projectedOverrun,
        confidence,
        factors,
        scenarios,
        recommendations
      };

      // Store forecast
      await this.storeForecast(forecast);

      this.emit('forecastGenerated', forecast);
      return forecast;

    } catch (error) {
      this.emit('error', new Error(`Failed to generate forecast: ${error.message}`));
      throw error;
    }
  }

  /**
   * Generate comprehensive budget report
   */
  async generateBudgetReport(
    budgetId: string,
    reportPeriod?: BillingPeriod
  ): Promise<BudgetReport> {
    try {
      const budget = this.budgets.get(budgetId);
      if (!budget) {
        throw new Error(`Budget ${budgetId} not found`);
      }

      const period = reportPeriod || budget.period;

      // Get current spending data
      const costBreakdown = await this.costTracker.getCostBreakdown(budget.organizationId, period);

      // Calculate summary
      const summary = this.calculateBudgetSummary(budget, costBreakdown, period);

      // Calculate category breakdown
      const categoryBreakdown = this.calculateCategoryBreakdown(budget, costBreakdown);

      // Get trends
      const trends = await this.getBudgetTrends(budgetId, period);

      // Get active alerts
      const alerts = await this.getBudgetAlerts(budgetId);

      // Calculate variance
      const variance = this.calculateBudgetVariance(budget, costBreakdown);

      // Generate recommendations
      const recommendations = await this.generateBudgetRecommendations(budget, summary, variance);

      const report: BudgetReport = {
        budgetId,
        period,
        summary,
        categoryBreakdown,
        trends,
        alerts,
        variance,
        recommendations
      };

      this.emit('reportGenerated', report);
      return report;

    } catch (error) {
      this.emit('error', new Error(`Failed to generate budget report: ${error.message}`));
      throw error;
    }
  }

  /**
   * Monitor budgets for threshold violations
   */
  private async monitorBudgets(): Promise<void> {
    for (const [budgetId, budget] of this.budgets) {
      try {
        if (budget.status === BudgetStatus.ACTIVE) {
          await this.checkBudgetThresholds(budget);
          await this.updateBudgetSpending(budget);
        }
      } catch (error) {
        this.emit('error', new Error(`Failed to monitor budget ${budgetId}: ${error.message}`));
      }
    }
  }

  /**
   * Check budget thresholds and generate alerts
   */
  private async checkBudgetThresholds(budget: Budget): Promise<void> {
    const costBreakdown = await this.costTracker.getCostBreakdown(budget.organizationId, budget.period);
    const utilizationPercentage = (costBreakdown.totalCost / budget.totalAmount) * 100;

    // Check overall budget thresholds
    for (const category of budget.categories) {
      for (const threshold of category.thresholds) {
        if (threshold.isActive) {
          const shouldTrigger = this.evaluateThreshold(threshold, category, utilizationPercentage);
          if (shouldTrigger) {
            await this.triggerBudgetAlert(budget, category, threshold);
          }
        }
      }
    }
  }

  /**
   * Update budget spending from cost tracker
   */
  private async updateBudgetSpending(budget: Budget): Promise<void> {
    const costBreakdown = await this.costTracker.getCostBreakdown(budget.organizationId, budget.period);

    // Update total spending
    const totalSpent = costBreakdown.totalCost;

    // Update category spending (simplified mapping)
    for (const category of budget.categories) {
      // This would need more sophisticated mapping between cost categories and budget categories
      const categorySpent = this.mapCostToCategory(costBreakdown, category);
      category.spentAmount = categorySpent;
      category.remainingAmount = Math.max(0, category.allocatedAmount - categorySpent);
      category.utilization = (categorySpent / category.allocatedAmount) * 100;
    }

    budget.updatedAt = new Date();
    await this.storeBudget(budget);
  }

  /**
   * Helper methods
   */
  private getDaysInPeriod(start: Date, end: Date): number {
    return Math.max(0, (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  }

  private calculateBudgetSummary(budget: Budget, costBreakdown: any, period: BillingPeriod): BudgetSummary {
    const totalSpent = costBreakdown.totalCost;
    const totalRemaining = Math.max(0, budget.totalAmount - totalSpent);
    const utilizationPercentage = (totalSpent / budget.totalAmount) * 100;

    const daysElapsed = this.getDaysInPeriod(period.start, new Date());
    const daysRemaining = this.getDaysInPeriod(new Date(), period.end);
    const burnRate = daysElapsed > 0 ? totalSpent / daysElapsed : 0;

    const forecastedTotal = totalSpent + (burnRate * daysRemaining);
    const projectedOverrun = Math.max(0, forecastedTotal - budget.totalAmount);

    return {
      totalBudget: budget.totalAmount,
      totalSpent,
      totalRemaining,
      utilizationPercentage,
      forecastedTotal,
      projectedOverrun,
      daysRemaining,
      burnRate
    };
  }

  // Placeholder implementations for other methods
  private async loadBudgets(): Promise<void> {}
  private async storeBudget(budget: Budget): Promise<void> {}
  private async createDefaultThresholds(budget: Budget): Promise<void> {}
  private async generateForecastFactors(budget: Budget, costBreakdown: any): Promise<ForecastFactor[]> { return []; }
  private generateForecastScenarios(projectedSpending: number, factors: ForecastFactor[]): ForecastScenario[] { return []; }
  private calculateForecastConfidence(budget: Budget, costBreakdown: any): number { return 85; }
  private async generateForecastRecommendations(budget: Budget, projectedOverrun: number): Promise<ForecastRecommendation[]> { return []; }
  private async storeForecast(forecast: BudgetForecast): Promise<void> {}
  private calculateCategoryBreakdown(budget: Budget, costBreakdown: any): CategoryBreakdown[] { return []; }
  private async getBudgetTrends(budgetId: string, period: BillingPeriod): Promise<BudgetTrend[]> { return []; }
  private async getBudgetAlerts(budgetId: string): Promise<BudgetAlert[]> { return []; }
  private calculateBudgetVariance(budget: Budget, costBreakdown: any): BudgetVariance {
    return {
      plannedVsActual: 0,
      budgetVsForecast: 0,
      categoryVariances: [],
      varianceAnalysis: { significantVariances: [], rootCauses: [], recommendations: [] }
    };
  }
  private async generateBudgetRecommendations(budget: Budget, summary: BudgetSummary, variance: BudgetVariance): Promise<BudgetRecommendation[]> { return []; }
  private evaluateThreshold(threshold: BudgetThreshold, category: BudgetCategory, utilization: number): boolean { return false; }
  private async triggerBudgetAlert(budget: Budget, category: BudgetCategory, threshold: BudgetThreshold): Promise<void> {}
  private mapCostToCategory(costBreakdown: any, category: BudgetCategory): number { return 0; }

  /**
   * Get budget by ID
   */
  async getBudget(budgetId: string): Promise<Budget | null> {
    return this.budgets.get(budgetId) || null;
  }

  /**
   * Get budgets for organization
   */
  async getBudgetsByOrganization(organizationId: string): Promise<Budget[]> {
    return Array.from(this.budgets.values())
      .filter(budget => budget.organizationId === organizationId);
  }

  /**
   * Update budget
   */
  async updateBudget(budgetId: string, updates: Partial<Budget>): Promise<Budget> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const updatedBudget = { ...budget, ...updates, updatedAt: new Date() };
    this.budgets.set(budgetId, updatedBudget);
    await this.storeBudget(updatedBudget);

    this.emit('budgetUpdated', updatedBudget);
    return updatedBudget;
  }

  /**
   * Delete budget
   */
  async deleteBudget(budgetId: string): Promise<void> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    this.budgets.delete(budgetId);

    // Remove from Redis
    await this.redis.del(`budget:${budgetId}`);

    this.emit('budgetDeleted', { budgetId });
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.budgets.clear();
    this.removeAllListeners();
  }
}

export default BudgetManager;