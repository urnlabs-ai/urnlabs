import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DashboardService } from '../services/dashboard-service.js';
import { WidgetType, ReportSchedule, ReportFormat } from '../types/metrics.js';

const createWidgetSchema = z.object({
  title: z.string(),
  type: z.nativeEnum(WidgetType),
  config: z.object({
    query: z.string(),
    time_range: z.string(),
    aggregation: z.string().optional(),
    grouping: z.array(z.string()).optional(),
    filters: z.record(z.any()).optional(),
    visualization_options: z.record(z.any()).optional()
  }),
  data_source: z.string(),
  refresh_interval_seconds: z.number(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
});

const updateWidgetSchema = z.object({
  title: z.string().optional(),
  config: z.object({
    query: z.string().optional(),
    time_range: z.string().optional(),
    aggregation: z.string().optional(),
    grouping: z.array(z.string()).optional(),
    filters: z.record(z.any()).optional(),
    visualization_options: z.record(z.any()).optional()
  }).optional(),
  refresh_interval_seconds: z.number().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).optional()
});

const createDashboardSchema = z.object({
  name: z.string(),
  description: z.string(),
  widgets: z.array(createWidgetSchema),
  created_by: z.string(),
  is_public: z.boolean().default(false),
  tags: z.array(z.string()).default([])
});

export default async function dashboardRoutes(fastify: FastifyInstance) {
  const dashboardService = fastify.dashboardService as DashboardService;

  // Create widget
  fastify.post('/dashboard/widgets', {
    schema: {
      body: createWidgetSchema,
      response: {
        201: z.object({
          id: z.string(),
          title: z.string(),
          type: z.nativeEnum(WidgetType),
          config: z.object({
            query: z.string(),
            time_range: z.string(),
            aggregation: z.string().optional(),
            grouping: z.array(z.string()).optional(),
            filters: z.record(z.any()).optional(),
            visualization_options: z.record(z.any()).optional()
          }),
          data_source: z.string(),
          refresh_interval_seconds: z.number(),
          position: z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number()
          })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const widget = await dashboardService.createWidget(request.body);
      reply.status(201);
      return widget;
    } catch (error) {
      fastify.log.error('Failed to create widget', error);
      reply.status(500);
      return { error: 'Failed to create widget' };
    }
  });

  // Get widget
  fastify.get('/dashboard/widgets/:widgetId', {
    schema: {
      params: z.object({
        widgetId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { widgetId } = request.params;
      const widget = await dashboardService.getWidget(widgetId);
      
      if (!widget) {
        reply.status(404);
        return { error: 'Widget not found' };
      }
      
      return widget;
    } catch (error) {
      fastify.log.error('Failed to get widget', error);
      reply.status(500);
      return { error: 'Failed to get widget' };
    }
  });

  // Update widget
  fastify.put('/dashboard/widgets/:widgetId', {
    schema: {
      params: z.object({
        widgetId: z.string()
      }),
      body: updateWidgetSchema
    }
  }, async (request, reply) => {
    try {
      const { widgetId } = request.params;
      const widget = await dashboardService.updateWidget(widgetId, request.body);
      
      if (!widget) {
        reply.status(404);
        return { error: 'Widget not found' };
      }
      
      return widget;
    } catch (error) {
      fastify.log.error('Failed to update widget', error);
      reply.status(500);
      return { error: 'Failed to update widget' };
    }
  });

  // Delete widget
  fastify.delete('/dashboard/widgets/:widgetId', {
    schema: {
      params: z.object({
        widgetId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { widgetId } = request.params;
      const deleted = await dashboardService.deleteWidget(widgetId);
      
      if (!deleted) {
        reply.status(404);
        return { error: 'Widget not found' };
      }
      
      return { success: true, message: 'Widget deleted successfully' };
    } catch (error) {
      fastify.log.error('Failed to delete widget', error);
      reply.status(500);
      return { error: 'Failed to delete widget' };
    }
  });

  // Get widget data
  fastify.get('/dashboard/widgets/:widgetId/data', {
    schema: {
      params: z.object({
        widgetId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { widgetId } = request.params;
      const data = await dashboardService.getWidgetData(widgetId);
      
      return data;
    } catch (error) {
      fastify.log.error('Failed to get widget data', error);
      reply.status(500);
      return { error: 'Failed to get widget data' };
    }
  });

  // Refresh widget data
  fastify.post('/dashboard/widgets/:widgetId/refresh', {
    schema: {
      params: z.object({
        widgetId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { widgetId } = request.params;
      const data = await dashboardService.refreshWidgetData(widgetId);
      
      return data;
    } catch (error) {
      fastify.log.error('Failed to refresh widget data', error);
      reply.status(500);
      return { error: 'Failed to refresh widget data' };
    }
  });

  // Render widget as image
  fastify.get('/dashboard/widgets/:widgetId/image', {
    schema: {
      params: z.object({
        widgetId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { widgetId } = request.params;
      const imageBuffer = await dashboardService.renderWidgetImage(widgetId);
      
      reply.header('Content-Type', 'image/png');
      return imageBuffer;
    } catch (error) {
      fastify.log.error('Failed to render widget image', error);
      reply.status(500);
      return { error: 'Failed to render widget image' };
    }
  });

  // Create dashboard
  fastify.post('/dashboard', {
    schema: {
      body: createDashboardSchema,
      response: {
        201: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          widgets: z.array(z.any()),
          created_by: z.string(),
          is_public: z.boolean(),
          tags: z.array(z.string())
        })
      }
    }
  }, async (request, reply) => {
    try {
      const dashboard = await dashboardService.createDashboard(request.body);
      reply.status(201);
      return dashboard;
    } catch (error) {
      fastify.log.error('Failed to create dashboard', error);
      reply.status(500);
      return { error: 'Failed to create dashboard' };
    }
  });

  // Get dashboard widgets
  fastify.get('/dashboard/:dashboardId/widgets', {
    schema: {
      params: z.object({
        dashboardId: z.string()
      })
    }
  }, async (request, reply) => {
    try {
      const { dashboardId } = request.params;
      const widgets = await dashboardService.getDashboardWidgets(dashboardId);
      
      return widgets;
    } catch (error) {
      fastify.log.error('Failed to get dashboard widgets', error);
      reply.status(500);
      return { error: 'Failed to get dashboard widgets' };
    }
  });

  // Health check endpoint
  fastify.get('/dashboard/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'analytics-dashboard'
    };
  });
}