export async function workflowsRoutes(fastify, _opts) {
    // List available workflows
    fastify.get('/', {
        schema: {
            tags: ['Workflows'],
            summary: 'List available workflows',
            description: 'Get list of all available AI workflows',
            security: [{ bearerAuth: [] }],
        },
    }, async (_request, reply) => {
        return reply.send({
            workflows: [
                {
                    id: 'feature-development',
                    name: 'Feature Development',
                    description: 'Complete feature development from requirements to deployment',
                    status: 'active',
                    agents: ['architecture-agent', 'code-reviewer', 'testing-agent'],
                }
            ]
        });
    });
}
//# sourceMappingURL=workflows.js.map