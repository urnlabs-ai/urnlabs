import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({
  status: 'healthy', 
  service: 'security',
  timestamp: new Date().toISOString()
}));

const start = async () => {
  try {
    const port = parseInt(process.env.SECURITY_PORT || '7009');
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    process.exit(1);
  }
};

start();