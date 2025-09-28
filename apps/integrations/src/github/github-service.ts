import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import { createNodeMiddleware } from '@octokit/webhooks';
import { createAppAuth } from '@octokit/auth-app';
import { githubConfig, validateGitHubConfig } from '../lib/config.js';
import { githubLogger, logError, createPerformanceLogger } from '../lib/logger.js';
import { GitHubIntegration, WebhookEvent } from '../types/index.js';
import crypto from 'crypto';

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: {
    sha: string;
    ref: string;
  };
  base: {
    sha: string;
    ref: string;
  };
  mergeable?: boolean;
  user: {
    login: string;
    id: number;
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    id: number;
  }>;
}

export class GitHubService {
  private app: App;
  private installationOctokit: Map<number, Octokit> = new Map();

  constructor() {
    validateGitHubConfig();
    
    this.app = new App({
      appId: githubConfig.appId!,
      privateKey: githubConfig.privateKey!,
      webhooks: {
        secret: githubConfig.webhookSecret,
      },
    });

    this.setupWebhookHandlers();
    githubLogger.info('GitHub service initialized');
  }

  /**
   * Get Octokit instance for a specific installation
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    if (this.installationOctokit.has(installationId)) {
      return this.installationOctokit.get(installationId)!;
    }

    const perf = createPerformanceLogger('github-auth');
    try {
      const octokit = await this.app.getInstallationOctokit(installationId);
      this.installationOctokit.set(installationId, octokit);
      perf.end(true, { installationId });
      return octokit;
    } catch (error) {
      perf.end(false, { installationId, error: (error as Error).message });
      logError(githubLogger, 'Failed to get installation Octokit', error as Error, { installationId });
      throw error;
    }
  }

  /**
   * Get all repositories for an installation
   */
  async getRepositories(installationId: number): Promise<GitHubRepository[]> {
    const perf = createPerformanceLogger('github-get-repositories');
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const { data } = await octokit.rest.apps.listReposAccessibleToInstallation();
      
      const repositories = data.repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        permissions: {
          admin: repo.permissions?.admin ?? false,
          push: repo.permissions?.push ?? false,
          pull: repo.permissions?.pull ?? false,
        },
      }));

      perf.end(true, { installationId, count: repositories.length });
      return repositories;
    } catch (error) {
      perf.end(false, { installationId, error: (error as Error).message });
      logError(githubLogger, 'Failed to get repositories', error as Error, { installationId });
      throw error;
    }
  }

  /**
   * Get pull requests for a repository
   */
  async getPullRequests(
    installationId: number,
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<GitHubPullRequest[]> {
    const perf = createPerformanceLogger('github-get-pull-requests');
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state,
        per_page: 100,
      });

      const pullRequests = data.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state as 'open' | 'closed',
        head: {
          sha: pr.head.sha,
          ref: pr.head.ref,
        },
        base: {
          sha: pr.base.sha,
          ref: pr.base.ref,
        },
        mergeable: pr.mergeable,
        user: {
          login: pr.user?.login || '',
          id: pr.user?.id || 0,
        },
      }));

      perf.end(true, { installationId, owner, repo, count: pullRequests.length });
      return pullRequests;
    } catch (error) {
      perf.end(false, { installationId, owner, repo, error: (error as Error).message });
      logError(githubLogger, 'Failed to get pull requests', error as Error, { installationId, owner, repo });
      throw error;
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    installationId: number,
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<GitHubPullRequest> {
    const perf = createPerformanceLogger('github-create-pull-request');
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const { data } = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        head,
        base,
        body,
      });

      const pullRequest = {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        head: {
          sha: data.head.sha,
          ref: data.head.ref,
        },
        base: {
          sha: data.base.sha,
          ref: data.base.ref,
        },
        mergeable: data.mergeable,
        user: {
          login: data.user?.login || '',
          id: data.user?.id || 0,
        },
      };

      perf.end(true, { installationId, owner, repo, prNumber: data.number });
      githubLogger.info('Pull request created', { installationId, owner, repo, prNumber: data.number });
      return pullRequest;
    } catch (error) {
      perf.end(false, { installationId, owner, repo, error: (error as Error).message });
      logError(githubLogger, 'Failed to create pull request', error as Error, { installationId, owner, repo });
      throw error;
    }
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    installationId: number,
    owner: string,
    repo: string,
    pullNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<boolean> {
    const perf = createPerformanceLogger('github-merge-pull-request');
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: mergeMethod,
      });

      perf.end(true, { installationId, owner, repo, pullNumber });
      githubLogger.info('Pull request merged', { installationId, owner, repo, pullNumber });
      return true;
    } catch (error) {
      perf.end(false, { installationId, owner, repo, pullNumber, error: (error as Error).message });
      logError(githubLogger, 'Failed to merge pull request', error as Error, { installationId, owner, repo, pullNumber });
      return false;
    }
  }

  /**
   * Get issues for a repository
   */
  async getIssues(
    installationId: number,
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<GitHubIssue[]> {
    const perf = createPerformanceLogger('github-get-issues');
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const { data } = await octokit.rest.issues.list({
        owner,
        repo,
        state,
        per_page: 100,
      });

      const issues = data
        .filter(issue => !issue.pull_request) // Filter out pull requests
        .map(issue => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body || '',
          state: issue.state as 'open' | 'closed',
          labels: issue.labels.map(label => ({
            name: typeof label === 'string' ? label : label.name || '',
            color: typeof label === 'string' ? '' : label.color || '',
          })),
          assignees: issue.assignees?.map(assignee => ({
            login: assignee.login,
            id: assignee.id,
          })) || [],
        }));

      perf.end(true, { installationId, owner, repo, count: issues.length });
      return issues;
    } catch (error) {
      perf.end(false, { installationId, owner, repo, error: (error as Error).message });
      logError(githubLogger, 'Failed to get issues', error as Error, { installationId, owner, repo });
      throw error;
    }
  }

  /**
   * Create an issue
   */
  async createIssue(
    installationId: number,
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<GitHubIssue> {
    const perf = createPerformanceLogger('github-create-issue');
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
        assignees,
      });

      const issue = {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        labels: data.labels.map(label => ({
          name: typeof label === 'string' ? label : label.name || '',
          color: typeof label === 'string' ? '' : label.color || '',
        })),
        assignees: data.assignees?.map(assignee => ({
          login: assignee.login,
          id: assignee.id,
        })) || [],
      };

      perf.end(true, { installationId, owner, repo, issueNumber: data.number });
      githubLogger.info('Issue created', { installationId, owner, repo, issueNumber: data.number });
      return issue;
    } catch (error) {
      perf.end(false, { installationId, owner, repo, error: (error as Error).message });
      logError(githubLogger, 'Failed to create issue', error as Error, { installationId, owner, repo });
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!githubConfig.webhookSecret) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', githubConfig.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(`sha256=${expectedSignature}`),
      Buffer.from(signature)
    );
  }

  /**
   * Setup webhook handlers
   */
  private setupWebhookHandlers(): void {
    // Repository events
    this.app.webhooks.on('repository', async ({ payload }) => {
      githubLogger.info('Repository event received', {
        action: payload.action,
        repository: payload.repository.full_name,
      });
    });

    // Push events
    this.app.webhooks.on('push', async ({ payload }) => {
      githubLogger.info('Push event received', {
        repository: payload.repository.full_name,
        ref: payload.ref,
        commits: payload.commits.length,
      });
    });

    // Pull request events
    this.app.webhooks.on('pull_request', async ({ payload }) => {
      githubLogger.info('Pull request event received', {
        action: payload.action,
        repository: payload.repository.full_name,
        number: payload.number,
        title: payload.pull_request.title,
      });
    });

    // Issue events
    this.app.webhooks.on('issues', async ({ payload }) => {
      githubLogger.info('Issue event received', {
        action: payload.action,
        repository: payload.repository.full_name,
        number: payload.issue.number,
        title: payload.issue.title,
      });
    });

    // Installation events
    this.app.webhooks.on('installation', async ({ payload }) => {
      githubLogger.info('Installation event received', {
        action: payload.action,
        installationId: payload.installation.id,
        account: payload.installation.account.login,
      });

      if (payload.action === 'deleted') {
        this.installationOctokit.delete(payload.installation.id);
      }
    });

    githubLogger.info('GitHub webhook handlers configured');
  }

  /**
   * Get webhook middleware for Express/Fastify
   */
  getWebhookMiddleware() {
    return createNodeMiddleware(this.app.webhooks);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; details?: string }> {
    try {
      // Simple check to verify GitHub API connectivity
      const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: githubConfig.appId!,
          privateKey: githubConfig.privateKey!,
        },
      });

      await octokit.rest.apps.getAuthenticated();
      return { status: 'ok' };
    } catch (error) {
      logError(githubLogger, 'GitHub health check failed', error as Error);
      return { 
        status: 'error', 
        details: (error as Error).message 
      };
    }
  }
}