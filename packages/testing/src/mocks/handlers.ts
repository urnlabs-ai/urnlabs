import { http, HttpResponse } from 'msw';
import { userFixtures } from '../fixtures/user';
import { agentFixtures } from '../fixtures/agent';
import { workflowFixtures } from '../fixtures/workflow';

export const testHandlers = [
  // Auth endpoints
  http.post('*/auth/login', () => {
    return HttpResponse.json({
      access_token: 'mock-jwt-token',
      refresh_token: 'mock-refresh-token',
      user: userFixtures.defaultUser(),
      expires_in: 3600
    });
  }),

  http.post('*/auth/register', () => {
    return HttpResponse.json({
      user: userFixtures.defaultUser(),
      message: 'User registered successfully'
    });
  }),

  http.post('*/auth/refresh', () => {
    return HttpResponse.json({
      access_token: 'new-mock-jwt-token',
      expires_in: 3600
    });
  }),

  // User endpoints
  http.get('*/users/me', () => {
    return HttpResponse.json(userFixtures.defaultUser());
  }),

  http.get('*/users/:id', ({ params }) => {
    const { id } = params;
    return HttpResponse.json(userFixtures.userWithId(id as string));
  }),

  http.put('*/users/:id', async ({ request, params }) => {
    const { id } = params;
    const updates = await request.json();
    return HttpResponse.json({
      ...userFixtures.userWithId(id as string),
      ...updates
    });
  }),

  // Agent endpoints
  http.get('*/agents', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    return HttpResponse.json({
      agents: agentFixtures.list(limit),
      pagination: {
        page,
        limit,
        total: 100,
        totalPages: 10
      }
    });
  }),

  http.get('*/agents/:id', ({ params }) => {
    const { id } = params;
    return HttpResponse.json(agentFixtures.agentWithId(id as string));
  }),

  http.post('*/agents', async ({ request }) => {
    const agentData = await request.json();
    return HttpResponse.json(
      agentFixtures.create(agentData),
      { status: 201 }
    );
  }),

  http.put('*/agents/:id', async ({ request, params }) => {
    const { id } = params;
    const updates = await request.json();
    return HttpResponse.json({
      ...agentFixtures.agentWithId(id as string),
      ...updates
    });
  }),

  http.delete('*/agents/:id', ({ params }) => {
    return HttpResponse.json({ message: 'Agent deleted successfully' });
  }),

  // Workflow endpoints
  http.get('*/workflows', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    return HttpResponse.json({
      workflows: workflowFixtures.list(limit),
      pagination: {
        page,
        limit,
        total: 50,
        totalPages: 5
      }
    });
  }),

  http.get('*/workflows/:id', ({ params }) => {
    const { id } = params;
    return HttpResponse.json(workflowFixtures.workflowWithId(id as string));
  }),

  http.post('*/workflows', async ({ request }) => {
    const workflowData = await request.json();
    return HttpResponse.json(
      workflowFixtures.create(workflowData),
      { status: 201 }
    );
  }),

  http.post('*/workflows/:id/execute', ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      executionId: `exec-${Date.now()}`,
      workflowId: id,
      status: 'running',
      startedAt: new Date().toISOString()
    });
  }),

  // Health check endpoints
  http.get('*/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }),

  // Error scenarios for testing
  http.get('*/test/error/500', () => {
    return HttpResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }),

  http.get('*/test/error/404', () => {
    return HttpResponse.json(
      { error: 'Not Found' },
      { status: 404 }
    );
  }),

  http.get('*/test/error/401', () => {
    return HttpResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }),

  // Slow response for testing timeouts
  http.get('*/test/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    return HttpResponse.json({ message: 'Slow response' });
  })
];

// Error handlers for unhandled requests
export const errorHandlers = [
  http.all('*', ({ request }) => {
    console.warn(`Unhandled ${request.method} request to ${request.url}`);
    return HttpResponse.json(
      { error: 'Mock handler not found' },
      { status: 404 }
    );
  })
];