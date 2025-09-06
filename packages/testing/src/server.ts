import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({
  status: 'healthy', 
  service: 'testing',
  timestamp: new Date().toISOString()
}));

const start = async () => {
  try {
    const port = parseInt(process.env.TESTING_PORT || '7008');
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    process.exit(1);
  }
};

start();