import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROICalculator } from '../services/roi-calculator.js';

const calculateROISchema = z.object({
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  include_projections: z.boolean().optional().default(false)
});

const roiConfigSchema = z.object({
  average_hourly_rate_cents: z.number(),
  senior_hourly_rate_cents: z.number(),
  junior_hourly_rate_cents: z.number(),
  server_cost_per_hour_cents: z.number(),
  ai_api_cost_multiplier: z.number(),
  discount_rate: z.number(),
  tax_rate: z.number()
});

export default async function roiRoutes(fastify: FastifyInstance) {
  const roiCalculator = fastify.roiCalculator as ROICalculator;

  // Calculate ROI for period
  fastify.post('/roi/calculate', {
    schema: {
      body: calculateROISchema,
      response: {
        200: z.object({
          id: z.string(),
          period_start: z.string().datetime(),
          period_end: z.string().datetime(),
          total_cost_cents: z.number(),
          total_revenue_cents: z.number(),
          cost_savings_cents: z.number(),
          efficiency_gains_percent: z.number(),
          roi_percent: z.number(),
          payback_period_days: z.number(),
          net_present_value_cents: z.number(),
          breakdown: z.object({
            agent_costs: z.record(z.number()),
            infrastructure_costs: z.record(z.number()),
            human_labor_savings: z.record(z.number()),
            revenue_generation: z.record(z.number()),
            efficiency_improvements: z.record(z.number())
          })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { period_start, period_end, include_projections } = request.body;
      
      const roi = await roiCalculator.calculateROI(
        new Date(period_start),
        new Date(period_end),
        include_projections
      );
      
      return {
        ...roi,
        period_start: roi.period_start.toISOString(),
        period_end: roi.period_end.toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to calculate ROI', error);
      reply.status(500);
      return { error: 'Failed to calculate ROI' };
    }
  });

  // Get ROI summary for different time periods
  fastify.get('/roi/summary', {
    schema: {
      querystring: z.object({
        periods: z.enum(['7d', '30d', '90d', 'ytd']).optional().default('30d')
      }),
      response: {
        200: z.object({
          current_period: z.object({
            roi_percent: z.number(),
            total_cost_cents: z.number(),
            total_savings_cents: z.number(),
            efficiency_gains_percent: z.number()
          }),
          previous_period: z.object({
            roi_percent: z.number(),
            total_cost_cents: z.number(),
            total_savings_cents: z.number(),
            efficiency_gains_percent: z.number()
          }),
          change: z.object({
            roi_change_percent: z.number(),
            cost_change_percent: z.number(),
            savings_change_percent: z.number(),
            efficiency_change_percent: z.number()
          }),
          trends: z.array(z.object({
            period: z.string(),
            roi_percent: z.number(),
            cost_cents: z.number(),
            savings_cents: z.number()
          }))
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { periods } = request.query;
      
      // Calculate period dates
      const endDate = new Date();
      let startDate: Date;
      let previousStartDate: Date;
      
      switch (periods) {
        case '7d':
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          previousStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          previousStartDate = new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'ytd':
          startDate = new Date(endDate.getFullYear(), 0, 1);
          previousStartDate = new Date(endDate.getFullYear() - 1, 0, 1);
          break;
        default:
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Calculate current and previous period ROI
      const [currentROI, previousROI] = await Promise.all([
        roiCalculator.calculateROI(startDate, endDate),
        roiCalculator.calculateROI(previousStartDate, startDate)
      ]);

      // Calculate trends (simplified - would be more sophisticated in production)
      const trends = [];
      const trendPeriods = 12; // 12 data points
      const periodLength = (endDate.getTime() - startDate.getTime()) / trendPeriods;
      
      for (let i = 0; i < trendPeriods; i++) {
        const trendStart = new Date(startDate.getTime() + i * periodLength);
        const trendEnd = new Date(startDate.getTime() + (i + 1) * periodLength);
        
        try {
          const trendROI = await roiCalculator.calculateROI(trendStart, trendEnd);
          trends.push({
            period: trendStart.toISOString().substr(0, 10),
            roi_percent: trendROI.roi_percent,
            cost_cents: trendROI.total_cost_cents,
            savings_cents: trendROI.cost_savings_cents
          });
        } catch (error) {
          // Skip periods with insufficient data
          continue;
        }
      }

      // Calculate changes
      const roiChange = currentROI.roi_percent - previousROI.roi_percent;
      const costChange = previousROI.total_cost_cents > 0 ? 
        ((currentROI.total_cost_cents - previousROI.total_cost_cents) / previousROI.total_cost_cents) * 100 : 0;
      const savingsChange = previousROI.cost_savings_cents > 0 ?
        ((currentROI.cost_savings_cents - previousROI.cost_savings_cents) / previousROI.cost_savings_cents) * 100 : 0;
      const efficiencyChange = currentROI.efficiency_gains_percent - previousROI.efficiency_gains_percent;

      return {
        current_period: {
          roi_percent: currentROI.roi_percent,
          total_cost_cents: currentROI.total_cost_cents,
          total_savings_cents: currentROI.cost_savings_cents,
          efficiency_gains_percent: currentROI.efficiency_gains_percent
        },
        previous_period: {
          roi_percent: previousROI.roi_percent,
          total_cost_cents: previousROI.total_cost_cents,
          total_savings_cents: previousROI.cost_savings_cents,
          efficiency_gains_percent: previousROI.efficiency_gains_percent
        },
        change: {
          roi_change_percent: roiChange,
          cost_change_percent: costChange,
          savings_change_percent: savingsChange,
          efficiency_change_percent: efficiencyChange
        },
        trends
      };
    } catch (error) {
      fastify.log.error('Failed to get ROI summary', error);
      reply.status(500);
      return { error: 'Failed to get ROI summary' };
    }
  });

  // Get cost breakdown
  fastify.get('/roi/costs', {
    schema: {
      querystring: z.object({
        period_start: z.string().datetime(),
        period_end: z.string().datetime(),
        group_by: z.enum(['agent', 'service', 'category']).optional().default('agent')
      }),
      response: {
        200: z.object({
          total_cost_cents: z.number(),
          breakdown: z.record(z.number()),
          top_costs: z.array(z.object({
            name: z.string(),
            cost_cents: z.number(),
            percentage: z.number()
          }))
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { period_start, period_end, group_by } = request.query;
      
      const roi = await roiCalculator.calculateROI(
        new Date(period_start),
        new Date(period_end)
      );

      let breakdown: Record<string, number>;
      switch (group_by) {
        case 'agent':
          breakdown = roi.breakdown.agent_costs;
          break;
        case 'service':
          breakdown = roi.breakdown.infrastructure_costs;
          break;
        case 'category':
          breakdown = {
            'AI Agents': Object.values(roi.breakdown.agent_costs).reduce((sum, cost) => sum + cost, 0),
            'Infrastructure': Object.values(roi.breakdown.infrastructure_costs).reduce((sum, cost) => sum + cost, 0)
          };
          break;
        default:
          breakdown = roi.breakdown.agent_costs;
      }

      const totalCost = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);
      
      // Calculate top costs
      const topCosts = Object.entries(breakdown)
        .filter(([name]) => name !== 'total')
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([name, cost]) => ({
          name,
          cost_cents: cost,
          percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0
        }));

      return {
        total_cost_cents: totalCost,
        breakdown,
        top_costs: topCosts
      };
    } catch (error) {
      fastify.log.error('Failed to get cost breakdown', error);
      reply.status(500);
      return { error: 'Failed to get cost breakdown' };
    }
  });

  // Get savings analysis
  fastify.get('/roi/savings', {
    schema: {
      querystring: z.object({
        period_start: z.string().datetime(),
        period_end: z.string().datetime()
      }),
      response: {
        200: z.object({
          total_savings_cents: z.number(),
          labor_savings: z.record(z.number()),
          efficiency_gains: z.record(z.number()),
          projected_annual_savings_cents: z.number(),
          savings_by_category: z.array(z.object({
            category: z.string(),
            savings_cents: z.number(),
            description: z.string()
          }))
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { period_start, period_end } = request.query;
      
      const roi = await roiCalculator.calculateROI(
        new Date(period_start),
        new Date(period_end)
      );

      // Project annual savings
      const periodDays = (new Date(period_end).getTime() - new Date(period_start).getTime()) / (1000 * 60 * 60 * 24);
      const projectedAnnualSavings = (roi.cost_savings_cents * 365) / periodDays;

      // Categorize savings
      const savingsByCategory = [
        {
          category: 'Task Automation',
          savings_cents: roi.breakdown.human_labor_savings.task_automation || 0,
          description: 'Savings from automated routine tasks'
        },
        {
          category: 'Workflow Optimization',
          savings_cents: roi.breakdown.human_labor_savings.workflow_optimization || 0,
          description: 'Savings from optimized business processes'
        },
        {
          category: 'Error Reduction',
          savings_cents: roi.breakdown.human_labor_savings.reduced_errors || 0,
          description: 'Savings from reduced manual errors'
        },
        {
          category: 'Faster Processing',
          savings_cents: roi.breakdown.human_labor_savings.faster_processing || 0,
          description: 'Savings from faster task completion'
        }
      ].filter(item => item.savings_cents > 0);

      return {
        total_savings_cents: roi.cost_savings_cents,
        labor_savings: roi.breakdown.human_labor_savings,
        efficiency_gains: roi.breakdown.efficiency_improvements,
        projected_annual_savings_cents: projectedAnnualSavings,
        savings_by_category: savingsByCategory
      };
    } catch (error) {
      fastify.log.error('Failed to get savings analysis', error);
      reply.status(500);
      return { error: 'Failed to get savings analysis' };
    }
  });

  // Health check endpoint
  fastify.get('/roi/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'analytics-roi'
    };
  });
}