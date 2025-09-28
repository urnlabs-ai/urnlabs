import type { BaseAgent, AgentConfig, AgentTask, AgentResponse, AgentMetrics } from '../types/AgentTypes';
/**
 * Production-ready Code Review Agent for URN Labs
 * Provides automated code review with security, performance, and quality analysis
 */
export declare class CodeReviewAgent implements BaseAgent {
    readonly id: string;
    readonly config: AgentConfig;
    metrics: AgentMetrics;
    private isInitialized;
    constructor(config?: Partial<AgentConfig>);
    /**
     * Initialize the agent
     */
    initialize(): Promise<void>;
    /**
     * Process a code review task
     */
    processTask(task: AgentTask): Promise<AgentResponse>;
    /**
     * Validate a task before processing
     */
    validateTask(task: AgentTask): Promise<boolean>;
    /**
     * Cleanup agent resources
     */
    cleanup(): Promise<void>;
    /**
     * Get agent health status
     */
    getHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: Record<string, any>;
    }>;
    /**
     * Check compliance
     */
    checkCompliance(task: AgentTask): Promise<{
        compliant: boolean;
        violations: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    }>;
    /**
     * Private methods
     */
    private extractCodeFromTask;
    private performSecurityAnalysis;
    private performPerformanceAnalysis;
    private performQualityAnalysis;
    private performComplianceCheck;
    private generateReview;
    private calculateScores;
    private generateRecommendations;
    private generateActionItems;
    private collectWarnings;
    private calculateConfidenceScore;
    private assessRisk;
    private updateMetrics;
    private calculateComplexity;
    private containsSensitiveData;
    private initializeSecurityAnalyzer;
    private initializePerformanceAnalyzer;
    private initializeQualityAnalyzer;
    private initializeComplianceChecker;
}
//# sourceMappingURL=CodeReviewAgent.d.ts.map