import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportingService } from '../services/reporting-service.js';
import { ReportSchedule, ReportFormat } from '../types/metrics.js';

const createReportSchema = z.object({
  name: z.string(),
  description: z.string(),
  schedule: z.nativeEnum(ReportSchedule),
  recipients: z.array(z.string().email()),
  format: z.nativeEnum(ReportFormat),
  sections: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    widget_ids: z.array(z.string()),
    custom_content: z.string().optional()
  }))
});

const updateReportSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  schedule: z.nativeEnum(ReportSchedule).optional(),
  recipients: z.array(z.string().email()).optional(),
  format: z.nativeEnum(ReportFormat).optional(),
  sections: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    widget_ids: z.array(z.string()),
    custom_content: z.string().optional()
  })).optional()
});

export default async function reportsRoutes(fastify: FastifyInstance) {
  const reportingService = fastify.reportingService as ReportingService;

  // Create report
  fastify.post('/reports', {
    schema: {
      body: createReportSchema,
      response: {
        201: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          schedule: z.nativeEnum(ReportSchedule),
          recipients: z.array(z.string()),
          format: z.nativeEnum(ReportFormat),
          sections: z.array(z.object({
            title: z.string(),
            description: z.string().optional(),
            widget_ids: z.array(z.string()),
            custom_content: z.string().optional()
          })),
          last_generated: z.string().datetime().nullable(),
          next_generation: z.string().datetime()
        })
      }
    }
  }, async (request, reply) => {
    try {
      const report = await reportingService.createReport(request.body);
      reply.status(201);
      
      return {
        ...report,
        last_generated: report.last_generated?.toISOString() || null,
        next_generation: report.next_generation.toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to create report', error);
      reply.status(500);
      return { error: 'Failed to create report' };
    }
  });

  // Generate report immediately
  fastify.post('/reports/:reportId/generate', {
    schema: {
      params: z.object({
        reportId: z.string()
      }),
      response: {
        200: z.object({
          id: z.string(),
          report_id: z.string(),
          generated_at: z.string().datetime(),
          format: z.nativeEnum(ReportFormat),
          file_path: z.string().optional(),
          email_sent: z.boolean().optional(),
          slack_sent: z.boolean().optional(),
          webhook_sent: z.boolean().optional(),
          size_bytes: z.number(),
          generation_time_ms: z.number()
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { reportId } = request.params;
      const generatedReport = await reportingService.generateReport(reportId);
      
      return {
        ...generatedReport,
        generated_at: generatedReport.generated_at.toISOString()
      };
    } catch (error) {
      fastify.log.error('Failed to generate report', error);
      reply.status(500);
      return { error: 'Failed to generate report' };
    }
  });

  // List all reports
  fastify.get('/reports', {
    schema: {
      querystring: z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
        format: z.nativeEnum(ReportFormat).optional(),
        schedule: z.nativeEnum(ReportSchedule).optional()
      }),
      response: {
        200: z.object({
          reports: z.array(z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            schedule: z.nativeEnum(ReportSchedule),
            format: z.nativeEnum(ReportFormat),
            recipients_count: z.number(),
            last_generated: z.string().datetime().nullable(),
            next_generation: z.string().datetime()
          })),
          total: z.number(),
          has_more: z.boolean()
        })
      }
    }
  }, async (request, reply) => {
    try {
      // This would typically fetch from a database
      // For now, return mock data structure
      return {
        reports: [],
        total: 0,
        has_more: false
      };
    } catch (error) {
      fastify.log.error('Failed to list reports', error);
      reply.status(500);
      return { error: 'Failed to list reports' };
    }
  });

  // Get report details
  fastify.get('/reports/:reportId', {
    schema: {
      params: z.object({
        reportId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { reportId } = request.params;
      // Implementation would fetch from database
      reply.status(404);
      return { error: 'Report not found' };
    } catch (error) {
      fastify.log.error('Failed to get report', error);
      reply.status(500);
      return { error: 'Failed to get report' };
    }
  });

  // Update report
  fastify.put('/reports/:reportId', {
    schema: {
      params: z.object({
        reportId: z.string()
      }),
      body: updateReportSchema
    }
  }, async (request, reply) => {
    try {
      const { reportId } = request.params;
      // Implementation would update in database
      reply.status(404);
      return { error: 'Report not found' };
    } catch (error) {
      fastify.log.error('Failed to update report', error);
      reply.status(500);
      return { error: 'Failed to update report' };
    }
  });

  // Delete report
  fastify.delete('/reports/:reportId', {
    schema: {
      params: z.object({
        reportId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { reportId } = request.params;
      // Implementation would delete from database and stop scheduling
      reply.status(404);
      return { error: 'Report not found' };
    } catch (error) {
      fastify.log.error('Failed to delete report', error);
      reply.status(500);
      return { error: 'Failed to delete report' };
    }
  });

  // Get report generation history
  fastify.get('/reports/:reportId/history', {
    schema: {
      params: z.object({
        reportId: z.string()
      }),
      querystring: z.object({
        limit: z.number().optional().default(10)
      }),
      response: {
        200: z.array(z.object({
          id: z.string(),
          generated_at: z.string().datetime(),
          format: z.nativeEnum(ReportFormat),
          file_path: z.string().optional(),
          email_sent: z.boolean().optional(),
          slack_sent: z.boolean().optional(),
          webhook_sent: z.boolean().optional(),
          size_bytes: z.number(),
          generation_time_ms: z.number()
        }))
      }
    }
  }, async (request, reply) => {
    try {
      const { reportId } = request.params;
      const { limit } = request.query;
      
      // Implementation would fetch generation history from Redis
      return [];
    } catch (error) {
      fastify.log.error('Failed to get report history', error);
      reply.status(500);
      return { error: 'Failed to get report history' };
    }
  });

  // Download report file
  fastify.get('/reports/:reportId/download/:generatedReportId', {
    schema: {
      params: z.object({
        reportId: z.string(),
        generatedReportId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { reportId, generatedReportId } = request.params;
      
      // Implementation would fetch file and stream it
      reply.status(404);
      return { error: 'Report file not found' };
    } catch (error) {
      fastify.log.error('Failed to download report', error);
      reply.status(500);
      return { error: 'Failed to download report' };
    }
  });

  // Test report configuration (generate preview)
  fastify.post('/reports/test', {
    schema: {
      body: createReportSchema,
      response: {
        200: z.object({
          preview: z.string(),
          estimated_size: z.number(),
          widget_data_available: z.record(z.boolean()),
          validation_errors: z.array(z.string())
        })
      }
    }
  }, async (request, reply) => {
    try {
      // Implementation would validate report configuration and generate preview
      const validationErrors: string[] = [];
      
      // Check if widgets exist
      const widgetDataAvailable: Record<string, boolean> = {};
      for (const section of request.body.sections) {
        for (const widgetId of section.widget_ids) {
          // Check if widget exists and has data
          widgetDataAvailable[widgetId] = true; // Mock implementation
        }
      }

      return {
        preview: 'Report preview would be generated here',
        estimated_size: 1024 * 50, // 50KB estimate
        widget_data_available: widgetDataAvailable,
        validation_errors: validationErrors
      };
    } catch (error) {
      fastify.log.error('Failed to test report', error);
      reply.status(500);
      return { error: 'Failed to test report' };
    }
  });

  // Health check endpoint
  fastify.get('/reports/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'analytics-reports'
    };
  });
}