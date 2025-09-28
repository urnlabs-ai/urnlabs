export async function analyticsRoutes(fastify, _opts) {
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
}
//# sourceMappingURL=analytics.js.map