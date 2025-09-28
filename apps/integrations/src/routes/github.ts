import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GitHubService } from '../github/github-service.js';
import { githubLogger, logError } from '../lib/logger.js';
import { z } from 'zod';

// Request schemas
const repositoryParamsSchema = z.object({
  installationId: z.string().transform(Number),
});

const repositoryOwnerParamsSchema = z.object({
  installationId: z.string().transform(Number),
  owner: z.string(),
  repo: z.string(),
});

const pullRequestParamsSchema = z.object({
  installationId: z.string().transform(Number),
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.string().transform(Number).optional(),
});

const createPullRequestSchema = z.object({
  title: z.string().min(1),
  head: z.string().min(1),
  base: z.string().min(1),
  body: z.string().optional(),
});

const mergePullRequestSchema = z.object({
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional().default('merge'),
});

const issueParamsSchema = z.object({
  installationId: z.string().transform(Number),
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.string().transform(Number).optional(),
});

const createIssueSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

const queryParamsSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
});

export async function githubRoutes(fastify: FastifyInstance) {
  const githubService = new GitHubService();

  // Add webhook route
  fastify.post('/webhooks/github', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const signature = request.headers['x-hub-signature-256'] as string;
      const payload = JSON.stringify(request.body);

      if (!githubService.verifyWebhookSignature(payload, signature)) {
        githubLogger.warn('Invalid webhook signature', {
          signature,
          ip: request.ip,
        });
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // Webhook is processed by the service's internal handlers
      githubLogger.info('Webhook processed successfully');
      return reply.code(200).send({ status: 'ok' });
    } catch (error) {
      logError(githubLogger, 'Webhook processing failed', error as Error);
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // Get repositories for installation
  fastify.get('/installations/:installationId/repositories', {
    schema: {
      params: repositoryParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            repositories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' },
                  fullName: { type: 'string' },
                  private: { type: 'boolean' },
                  defaultBranch: { type: 'string' },
                  permissions: {
                    type: 'object',
                    properties: {
                      admin: { type: 'boolean' },
                      push: { type: 'boolean' },
                      pull: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { installationId } = repositoryParamsSchema.parse(request.params);
      const repositories = await githubService.getRepositories(installationId);
      
      return reply.send({ repositories });
    } catch (error) {
      logError(githubLogger, 'Failed to get repositories', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get repositories' });
    }
  });

  // Get pull requests
  fastify.get('/installations/:installationId/repositories/:owner/:repo/pulls', {
    schema: {
      params: repositoryOwnerParamsSchema,
      querystring: queryParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { installationId, owner, repo } = repositoryOwnerParamsSchema.parse(request.params);
      const { state } = queryParamsSchema.parse(request.query);
      
      const pullRequests = await githubService.getPullRequests(installationId, owner, repo, state);
      
      return reply.send({ pullRequests });
    } catch (error) {
      logError(githubLogger, 'Failed to get pull requests', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get pull requests' });
    }
  });

  // Create pull request
  fastify.post('/installations/:installationId/repositories/:owner/:repo/pulls', {
    schema: {
      params: repositoryOwnerParamsSchema,
      body: createPullRequestSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { installationId, owner, repo } = repositoryOwnerParamsSchema.parse(request.params);
      const { title, head, base, body } = createPullRequestSchema.parse(request.body);
      
      const pullRequest = await githubService.createPullRequest(
        installationId,
        owner,
        repo,
        title,
        head,
        base,
        body
      );
      
      return reply.code(201).send({ pullRequest });
    } catch (error) {
      logError(githubLogger, 'Failed to create pull request', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to create pull request' });
    }
  });

  // Merge pull request
  fastify.post('/installations/:installationId/repositories/:owner/:repo/pulls/:pullNumber/merge', {
    schema: {
      params: pullRequestParamsSchema,
      body: mergePullRequestSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { installationId, owner, repo, pullNumber } = pullRequestParamsSchema.parse({
        ...request.params,
        pullNumber: (request.params as any).pullNumber,
      });
      const { mergeMethod } = mergePullRequestSchema.parse(request.body);
      
      const success = await githubService.mergePullRequest(
        installationId,
        owner,
        repo,
        pullNumber!,
        mergeMethod
      );
      
      if (success) {
        return reply.send({ status: 'merged' });
      } else {
        return reply.code(400).send({ error: 'Failed to merge pull request' });
      }
    } catch (error) {
      logError(githubLogger, 'Failed to merge pull request', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to merge pull request' });
    }
  });

  // Get issues
  fastify.get('/installations/:installationId/repositories/:owner/:repo/issues', {
    schema: {
      params: repositoryOwnerParamsSchema,
      querystring: queryParamsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { installationId, owner, repo } = repositoryOwnerParamsSchema.parse(request.params);
      const { state } = queryParamsSchema.parse(request.query);
      
      const issues = await githubService.getIssues(installationId, owner, repo, state);
      
      return reply.send({ issues });
    } catch (error) {
      logError(githubLogger, 'Failed to get issues', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to get issues' });
    }
  });

  // Create issue
  fastify.post('/installations/:installationId/repositories/:owner/:repo/issues', {
    schema: {
      params: repositoryOwnerParamsSchema,
      body: createIssueSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { installationId, owner, repo } = repositoryOwnerParamsSchema.parse(request.params);
      const { title, body, labels, assignees } = createIssueSchema.parse(request.body);
      
      const issue = await githubService.createIssue(
        installationId,
        owner,
        repo,
        title,
        body,
        labels,
        assignees
      );
      
      return reply.code(201).send({ issue });
    } catch (error) {
      logError(githubLogger, 'Failed to create issue', error as Error, { params: request.params });
      return reply.code(500).send({ error: 'Failed to create issue' });
    }
  });

  // Health check
  fastify.get('/health/github', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await githubService.healthCheck();
      
      if (health.status === 'ok') {
        return reply.send(health);
      } else {
        return reply.code(503).send(health);
      }
    } catch (error) {
      logError(githubLogger, 'Health check failed', error as Error);
      return reply.code(503).send({ status: 'error', details: 'Health check failed' });
    }
  });

  githubLogger.info('GitHub routes registered');
}