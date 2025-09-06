import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

fastify.get('/health', async () => {
  return { 
    status: 'healthy', 
    service: 'mcp-integration',
    timestamp: new Date().toISOString()
  };
});

const start = async () => {
  try {
    const port = parseInt(process.env.MCP_SERVICE_PORT || '7007');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`MCP Integration service running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();