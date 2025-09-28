import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AnalyticsService, PredictionType } from '../../../../packages/ai-agents/src/analytics';

let analyticsService: AnalyticsService;

export async function analyticsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Initialize analytics service
  if (!analyticsService) {
    analyticsService = new AnalyticsService({
      prisma: fastify.prisma,
      redis: fastify.redis,
      costingRules: {
        cpu: { name: 'CPU Hours', unit: 'cpu-hour', costPerUnit: 0.05, billing: 'hourly' },
        memory: { name: 'Memory Usage', unit: 'gb-hour', costPerUnit: 0.01, billing: 'hourly' },
        storage: { name: 'Storage', unit: 'gb-month', costPerUnit: 0.10, billing: 'monthly' },
        network: { name: 'Network Transfer', unit: 'gb', costPerUnit: 0.09, billing: 'usage' },
        ai_model: { name: 'AI Model Tokens', unit: 'token', costPerUnit: 0.0001, billing: 'usage' }
      },
      defaultCurrency: 'USD'
    });
    await analyticsService.initialize();
  }

  // Get analytics overview
  fastify.get('/overview', {
    schema: {
      tags: ['Analytics'],
      summary: 'Get analytics overview',
      description: 'Get system performance and usage analytics',
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, reply) => {
    return reply.send({
      metrics: {
        totalUsers: 0,
        activeWorkflows: 0,
        completedTasks: 0,
        systemUptime: process.uptime(),
      },
      performance: {
        avgResponseTime: 150,
        successRate: 99.5,
        errorRate: 0.5,
      }
    });
  });

  // ==========================================================================
  // PREDICTIVE ANALYTICS & MACHINE LEARNING ENDPOINTS
  // ==========================================================================

  // Generate features for an agent
  fastify.post('/features/agent/:agentId', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Generate features for agent',
      description: 'Generate comprehensive feature set for agent performance prediction',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        },
        required: ['agentId']
      },
      body: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' }
            },
            required: ['start', 'end']
          }
        },
        required: ['timeRange']
      }
    }
  }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { timeRange } = request.body as { timeRange: { start: string; end: string } };
    const user = request.user as any;

    try {
      const features = await analyticsService.featureEngineering.generateAgentFeatures(
        agentId,
        user.organizationId,
        {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end)
        }
      );

      return reply.send({
        success: true,
        data: features
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Generate features for a workflow
  fastify.post('/features/workflow/:workflowId', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Generate features for workflow',
      description: 'Generate comprehensive feature set for workflow performance prediction',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' }
        },
        required: ['workflowId']
      },
      body: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' }
            },
            required: ['start', 'end']
          }
        },
        required: ['timeRange']
      }
    }
  }, async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const { timeRange } = request.body as { timeRange: { start: string; end: string } };
    const user = request.user as any;

    try {
      const features = await analyticsService.featureEngineering.generateWorkflowFeatures(
        workflowId,
        user.organizationId,
        {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end)
        }
      );

      return reply.send({
        success: true,
        data: features
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Make a prediction
  fastify.post('/predict', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Make prediction',
      description: 'Make real-time prediction for agent or workflow performance',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          workflowId: { type: 'string' },
          predictionType: { 
            type: 'string',
            enum: ['performance', 'failure_risk', 'resource_demand', 'workflow_success', 'anomaly_detection']
          },
          horizonMinutes: { type: 'integer', minimum: 1, maximum: 10080 }, // max 7 days
          features: { type: 'object' },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        },
        required: ['predictionType', 'horizonMinutes', 'features']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const predictionRequest = {
      organizationId: user.organizationId,
      ...request.body
    } as any;

    try {
      const prediction = await analyticsService.modelServing.predict(predictionRequest);

      return reply.send({
        success: true,
        data: prediction
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ==========================================================================
  // ML PIPELINE MANAGEMENT ENDPOINTS
  // ==========================================================================

  // Create ML pipeline
  fastify.post('/pipelines', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Create ML pipeline',
      description: 'Create a new machine learning pipeline for model training',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          pipelineName: { type: 'string' },
          description: { type: 'string' },
          modelTypes: { 
            type: 'array',
            items: { type: 'string', enum: ['linear_regression', 'random_forest'] }
          },
          validationStrategy: { 
            type: 'string',
            enum: ['holdout', 'cross_validation', 'time_series_split']
          },
          validationSplit: { type: 'number', minimum: 0.1, maximum: 0.5 },
          hyperparameters: { type: 'object' },
          retraining: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              schedule: { type: 'string' },
              triggerConditions: {
                type: 'object',
                properties: {
                  performanceDrop: { type: 'number' },
                  dataPoints: { type: 'integer' },
                  timePeriod: { type: 'integer' }
                }
              }
            }
          },
          abTesting: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              trafficSplit: { type: 'number', minimum: 0.1, maximum: 0.9 },
              successMetrics: { type: 'array', items: { type: 'string' } },
              duration: { type: 'integer' }
            }
          }
        },
        required: ['pipelineName', 'modelTypes', 'validationStrategy']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const config = {
      organizationId: user.organizationId,
      ...request.body
    } as any;

    try {
      const pipelineId = await analyticsService.mlPipeline.createPipeline(config);

      return reply.send({
        success: true,
        data: { pipelineId }
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Start training job
  fastify.post('/pipelines/:pipelineId/train', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Start training job',
      description: 'Start a training job for an ML pipeline',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' }
        },
        required: ['pipelineId']
      },
      body: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { pipelineId } = request.params as { pipelineId: string };
    const { timeRange } = request.body as { timeRange?: { start: string; end: string } };

    try {
      const jobId = await analyticsService.mlPipeline.startTraining(
        pipelineId,
        timeRange ? {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end)
        } : undefined
      );

      return reply.send({
        success: true,
        data: { jobId }
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get training job status
  fastify.get('/training-jobs/:jobId', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Get training job status',
      description: 'Get the status and details of a training job',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' }
        },
        required: ['jobId']
      }
    }
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    try {
      const job = analyticsService.mlPipeline.getTrainingJob(jobId);
      
      if (!job) {
        return reply.status(404).send({
          success: false,
          error: 'Training job not found'
        });
      }

      return reply.send({
        success: true,
        data: job
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get pipeline metrics
  fastify.get('/pipelines/:pipelineId/metrics', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Get pipeline metrics',
      description: 'Get performance metrics for an ML pipeline',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' }
        },
        required: ['pipelineId']
      }
    }
  }, async (request, reply) => {
    const { pipelineId } = request.params as { pipelineId: string };

    try {
      const metrics = await analyticsService.mlPipeline.getPipelineMetrics(pipelineId);
      
      if (!metrics) {
        return reply.status(404).send({
          success: false,
          error: 'Pipeline not found'
        });
      }

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ==========================================================================
  // MODEL SERVING ENDPOINTS
  // ==========================================================================

  // Register model for serving
  fastify.post('/models/:modelId/register', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Register model for serving',
      description: 'Register a trained model for real-time serving',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          modelId: { type: 'string' }
        },
        required: ['modelId']
      },
      body: {
        type: 'object',
        properties: {
          modelInfo: {
            type: 'object',
            properties: {
              modelType: { type: 'string' },
              modelVersion: { type: 'string' },
              trainedAt: { type: 'string', format: 'date-time' },
              accuracy: { type: 'number' },
              precision: { type: 'number' },
              recall: { type: 'number' },
              f1Score: { type: 'number' },
              dataPoints: { type: 'integer' }
            },
            required: ['modelType', 'modelVersion', 'accuracy']
          },
          deployment: {
            type: 'object',
            properties: {
              environment: { type: 'string', enum: ['staging', 'production'] },
              trafficPercentage: { type: 'number', minimum: 0, maximum: 100 }
            },
            required: ['environment', 'trafficPercentage']
          }
        },
        required: ['modelInfo', 'deployment']
      }
    }
  }, async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const { modelInfo, deployment } = request.body as any;
    const user = request.user as any;

    try {
      const endpointId = await analyticsService.modelServing.registerModel(
        modelId,
        user.organizationId,
        modelInfo,
        deployment
      );

      return reply.send({
        success: true,
        data: { endpointId }
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Submit batch prediction job
  fastify.post('/batch-predict', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Submit batch prediction job',
      description: 'Submit a batch prediction job for processing multiple records',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          modelId: { type: 'string' },
          inputSource: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['file', 'database', 'api'] },
              location: { type: 'string' },
              format: { type: 'string', enum: ['json', 'csv', 'parquet'] }
            },
            required: ['type', 'location', 'format']
          },
          outputDestination: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['file', 'database', 'webhook'] },
              location: { type: 'string' },
              format: { type: 'string', enum: ['json', 'csv'] }
            },
            required: ['type', 'location', 'format']
          }
        },
        required: ['modelId', 'inputSource', 'outputDestination']
      }
    }
  }, async (request, reply) => {
    const { modelId, inputSource, outputDestination } = request.body as any;
    const user = request.user as any;

    try {
      const jobId = await analyticsService.modelServing.submitBatchJob(
        user.organizationId,
        modelId,
        inputSource,
        outputDestination
      );

      return reply.send({
        success: true,
        data: { jobId }
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get batch job status
  fastify.get('/batch-jobs/:jobId', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Get batch job status',
      description: 'Get the status and progress of a batch prediction job',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' }
        },
        required: ['jobId']
      }
    }
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    try {
      const job = analyticsService.modelServing.getBatchJobStatus(jobId);
      
      if (!job) {
        return reply.status(404).send({
          success: false,
          error: 'Batch job not found'
        });
      }

      return reply.send({
        success: true,
        data: job
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get serving metrics
  fastify.get('/serving/metrics', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Get serving metrics',
      description: 'Get real-time serving performance metrics',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    try {
      const metrics = analyticsService.modelServing.getMetrics();

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get endpoint health
  fastify.get('/serving/health', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Get endpoint health',
      description: 'Get health status of all serving endpoints',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    try {
      const health = analyticsService.modelServing.getEndpointHealth();

      return reply.send({
        success: true,
        data: health
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Scale endpoints
  fastify.post('/serving/models/:modelId/scale', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Scale model endpoints',
      description: 'Scale the number of serving endpoints for a model',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          modelId: { type: 'string' }
        },
        required: ['modelId']
      },
      body: {
        type: 'object',
        properties: {
          targetInstances: { type: 'integer', minimum: 0, maximum: 50 }
        },
        required: ['targetInstances']
      }
    }
  }, async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const { targetInstances } = request.body as { targetInstances: number };

    try {
      await analyticsService.modelServing.scaleEndpoints(modelId, targetInstances);

      return reply.send({
        success: true,
        message: `Scaled model ${modelId} to ${targetInstances} instances`
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ==========================================================================
  // COST TRACKING & ROI ANALYTICS ENDPOINTS
  // ==========================================================================

  // Track resource usage cost
  fastify.post('/costs/track', {
    schema: {
      tags: ['Analytics', 'Cost'],
      summary: 'Track resource usage cost',
      description: 'Record cost allocation for specific resource usage',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          workflowId: { type: 'string' },
          workflowRunId: { type: 'string' },
          resourceType: { type: 'string', enum: ['cpu', 'memory', 'storage', 'network', 'ai_model'] },
          usage: {
            type: 'object',
            properties: {
              computeTime: { type: 'number' },
              memoryUsage: { type: 'number' },
              storageUsage: { type: 'number' },
              networkUsage: { type: 'number' },
              tokens: { type: 'number' }
            }
          }
        },
        required: ['resourceType', 'usage']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { agentId, workflowId, workflowRunId, resourceType, usage } = request.body as any;

    try {
      const cost = await analyticsService.costTracker.trackResourceUsage(
        resourceType,
        agentId || workflowId || 'unknown',
        usage,
        {
          agentId,
          workflowId,
          workflowRunId,
          organizationId: user.organizationId
        }
      );

      return reply.send({
        success: true,
        data: { cost }
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get cost breakdown
  fastify.get('/costs/breakdown', {
    schema: {
      tags: ['Analytics', 'Cost'],
      summary: 'Get cost breakdown',
      description: 'Get detailed cost breakdown for organization',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          period: { type: 'string', enum: ['daily', 'weekly', 'monthly'] }
        },
        required: ['startDate', 'endDate']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { startDate, endDate, period = 'monthly' } = request.query as any;

    try {
      const costBreakdown = await analyticsService.costTracker.getCostBreakdown(
        user.organizationId,
        {
          start: new Date(startDate),
          end: new Date(endDate),
          type: period
        }
      );

      return reply.send({
        success: true,
        data: costBreakdown
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get real-time costs
  fastify.get('/costs/realtime', {
    schema: {
      tags: ['Analytics', 'Cost'],
      summary: 'Get real-time costs',
      description: 'Get current cost metrics and projections',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const user = request.user as any;

    try {
      const realTimeCosts = await analyticsService.costTracker.getRealTimeCosts(user.organizationId);

      return reply.send({
        success: true,
        data: realTimeCosts
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get cost optimizations
  fastify.get('/costs/optimizations', {
    schema: {
      tags: ['Analytics', 'Cost'],
      summary: 'Get cost optimization opportunities',
      description: 'Get AI-powered cost optimization recommendations',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        },
        required: ['startDate', 'endDate']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { startDate, endDate } = request.query as any;

    try {
      const optimizations = await analyticsService.costTracker.identifyOptimizations(
        user.organizationId,
        {
          start: new Date(startDate),
          end: new Date(endDate),
          type: 'monthly'
        }
      );

      return reply.send({
        success: true,
        data: optimizations
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Calculate ROI
  fastify.post('/roi/calculate', {
    schema: {
      tags: ['Analytics', 'ROI'],
      summary: 'Calculate ROI',
      description: 'Calculate return on investment for specified period',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          calculationType: { type: 'string', enum: ['comprehensive', 'agent_specific', 'workflow_specific'] },
          assumptions: {
            type: 'object',
            properties: {
              hourlyRate: { type: 'number' },
              workingHoursPerMonth: { type: 'number' },
              errorCostMultiplier: { type: 'number' }
            }
          }
        },
        required: ['startDate', 'endDate']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { startDate, endDate, calculationType = 'comprehensive', assumptions } = request.body as any;

    try {
      const roiCalculation = await analyticsService.roiCalculator.calculateROI(
        user.organizationId,
        {
          start: new Date(startDate),
          end: new Date(endDate),
          type: 'monthly'
        },
        calculationType,
        assumptions
      );

      return reply.send({
        success: true,
        data: roiCalculation
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Generate ROI forecast
  fastify.post('/roi/forecast', {
    schema: {
      tags: ['Analytics', 'ROI'],
      summary: 'Generate ROI forecast',
      description: 'Generate ROI projections for future periods',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          forecastStartDate: { type: 'string', format: 'date-time' },
          forecastEndDate: { type: 'string', format: 'date-time' },
          historicalPeriods: { type: 'integer', minimum: 1, maximum: 24 }
        },
        required: ['forecastStartDate', 'forecastEndDate']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { forecastStartDate, forecastEndDate, historicalPeriods = 6 } = request.body as any;

    try {
      const forecast = await analyticsService.roiCalculator.generateROIForecast(
        user.organizationId,
        {
          start: new Date(forecastStartDate),
          end: new Date(forecastEndDate),
          type: 'monthly'
        },
        historicalPeriods
      );

      return reply.send({
        success: true,
        data: forecast
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Compare ROI between periods
  fastify.post('/roi/compare', {
    schema: {
      tags: ['Analytics', 'ROI'],
      summary: 'Compare ROI between periods',
      description: 'Compare ROI performance between two time periods',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          baselineStart: { type: 'string', format: 'date-time' },
          baselineEnd: { type: 'string', format: 'date-time' },
          comparisonStart: { type: 'string', format: 'date-time' },
          comparisonEnd: { type: 'string', format: 'date-time' }
        },
        required: ['baselineStart', 'baselineEnd', 'comparisonStart', 'comparisonEnd']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { baselineStart, baselineEnd, comparisonStart, comparisonEnd } = request.body as any;

    try {
      const comparison = await analyticsService.roiCalculator.compareROI(
        user.organizationId,
        {
          start: new Date(baselineStart),
          end: new Date(baselineEnd),
          type: 'monthly'
        },
        {
          start: new Date(comparisonStart),
          end: new Date(comparisonEnd),
          type: 'monthly'
        }
      );

      return reply.send({
        success: true,
        data: comparison
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Create budget
  fastify.post('/budgets', {
    schema: {
      tags: ['Analytics', 'Budget'],
      summary: 'Create budget',
      description: 'Create a new budget allocation',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          totalAmount: { type: 'number', minimum: 0 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                allocatedAmount: { type: 'number', minimum: 0 },
                thresholds: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['absolute_amount', 'percentage'] },
                      value: { type: 'number' },
                      alertLevel: { type: 'string', enum: ['info', 'warning', 'critical'] }
                    }
                  }
                }
              },
              required: ['id', 'name', 'allocatedAmount']
            }
          },
          approvalRequired: { type: 'boolean' }
        },
        required: ['name', 'totalAmount', 'startDate', 'endDate', 'categories']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { name, totalAmount, startDate, endDate, categories, approvalRequired = false } = request.body as any;

    try {
      const budget = await analyticsService.budgetManager.createBudget(
        user.organizationId,
        {
          name,
          totalAmount,
          period: {
            start: new Date(startDate),
            end: new Date(endDate),
            type: 'monthly'
          },
          categories,
          approvalRequired
        }
      );

      return reply.send({
        success: true,
        data: budget
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get budgets
  fastify.get('/budgets', {
    schema: {
      tags: ['Analytics', 'Budget'],
      summary: 'Get budgets',
      description: 'Get all budgets for organization',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const user = request.user as any;

    try {
      const budgets = await analyticsService.budgetManager.getBudgetsByOrganization(user.organizationId);

      return reply.send({
        success: true,
        data: budgets
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Generate budget forecast
  fastify.get('/budgets/:budgetId/forecast', {
    schema: {
      tags: ['Analytics', 'Budget'],
      summary: 'Generate budget forecast',
      description: 'Generate spending forecast for budget',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          budgetId: { type: 'string' }
        },
        required: ['budgetId']
      }
    }
  }, async (request, reply) => {
    const { budgetId } = request.params as { budgetId: string };

    try {
      const forecast = await analyticsService.budgetManager.generateForecast(budgetId);

      return reply.send({
        success: true,
        data: forecast
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Generate budget report
  fastify.get('/budgets/:budgetId/report', {
    schema: {
      tags: ['Analytics', 'Budget'],
      summary: 'Generate budget report',
      description: 'Generate comprehensive budget analysis report',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          budgetId: { type: 'string' }
        },
        required: ['budgetId']
      }
    }
  }, async (request, reply) => {
    const { budgetId } = request.params as { budgetId: string };

    try {
      const report = await analyticsService.budgetManager.generateBudgetReport(budgetId);

      return reply.send({
        success: true,
        data: report
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Generate cost report
  fastify.post('/reports/cost', {
    schema: {
      tags: ['Analytics', 'Reports'],
      summary: 'Generate cost report',
      description: 'Generate comprehensive cost analysis report',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          reportType: { type: 'string', enum: ['executive_summary', 'detailed_analysis', 'budget_review', 'roi_analysis'] },
          templateId: { type: 'string' },
          customizations: { type: 'object' }
        },
        required: ['startDate', 'endDate']
      }
    }
  }, async (request, reply) => {
    const user = request.user as any;
    const { startDate, endDate, reportType = 'detailed_analysis', templateId, customizations } = request.body as any;

    try {
      const report = await analyticsService.costReportGenerator.generateReport(
        user.organizationId,
        {
          start: new Date(startDate),
          end: new Date(endDate),
          type: 'monthly'
        },
        reportType,
        templateId,
        customizations
      );

      return reply.send({
        success: true,
        data: report
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get report templates
  fastify.get('/reports/templates', {
    schema: {
      tags: ['Analytics', 'Reports'],
      summary: 'Get report templates',
      description: 'Get available report templates',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    try {
      const templates = await analyticsService.costReportGenerator.getTemplates();

      return reply.send({
        success: true,
        data: templates
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ==========================================================================
  // ANALYTICS SERVICE STATUS
  // ==========================================================================

  // Get analytics service status
  fastify.get('/status', {
    schema: {
      tags: ['Analytics', 'ML'],
      summary: 'Get analytics service status',
      description: 'Get overall status and statistics of the analytics service',
      security: [{ bearerAuth: [] }]
    }
  }, async (_request, reply) => {
    try {
      const stats = {
        featureEngineering: analyticsService.featureEngineering.getCacheStats(),
        predictiveModels: analyticsService.predictiveModels.getStats(),
        mlPipeline: analyticsService.mlPipeline.getStats(),
        modelServing: analyticsService.modelServing.getStats(),
        costTracking: {
          status: 'active',
          trackingEnabled: true
        },
        roiCalculations: {
          status: 'active',
          calculationsEnabled: true
        },
        budgetManagement: {
          status: 'active',
          monitoringEnabled: true
        },
        reportGeneration: {
          status: 'active',
          templatesLoaded: (await analyticsService.costReportGenerator.getTemplates()).length
        }
      };

      return reply.send({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date(),
          components: stats
        }
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
}