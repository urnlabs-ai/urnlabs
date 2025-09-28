import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { FastifyInstance } from 'fastify';

describe('Integration Service Health Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should respond to health check', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('integrations');
  });

  it('should have GitHub health endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/github/health/github',
    });

    // Should return either 200 (if configured) or 503 (if not configured)
    expect([200, 503]).toContain(response.statusCode);
  });

  it('should have Slack health endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/slack/health/slack',
    });

    // Should return either 200 (if configured) or 503 (if not configured)
    expect([200, 503]).toContain(response.statusCode);
  });

  it('should have webhook health endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/health/webhooks',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should have marketplace health endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/marketplace/health/marketplace',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should return 404 for unknown routes', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/unknown-route',
    });

    expect(response.statusCode).toBe(404);
  });

  it('should have API documentation', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});