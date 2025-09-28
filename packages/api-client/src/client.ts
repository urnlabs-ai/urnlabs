import ky, { KyInstance, Options } from 'ky';
import {
  User,
  Organization,
  Workflow,
  Agent,
  Execution,
  AnalyticsData,
  ApiResponse,
  PaginatedResponse,
  ListParams,
  AnalyticsParams,
  AuthTokens,
  LoginCredentials,
  RegisterData,
  SystemNotification
} from './types';

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
}

export class ApiClient {
  private client: KyInstance;
  private config: ApiClientConfig;
  private authTokens: AuthTokens | null = null;

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      debug: false,
      ...config
    };

    this.client = ky.create({
      prefixUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      retry: this.config.retries,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey })
      },
      hooks: {
        beforeRequest: [
          (request) => {
            if (this.authTokens?.accessToken) {
              request.headers.set('Authorization', `Bearer ${this.authTokens.accessToken}`);
            }
            if (this.config.debug) {
              console.log(`[API] ${request.method} ${request.url}`);
            }
          }
        ],
        afterResponse: [
          async (request, options, response) => {
            if (this.config.debug) {
              console.log(`[API] ${request.method} ${request.url} -> ${response.status}`);
            }

            // Handle token refresh
            if (response.status === 401 && this.authTokens?.refreshToken) {
              try {
                const newTokens = await this.refreshAuthTokens();
                if (newTokens) {
                  request.headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
                  return ky(request);
                }
              } catch (error) {
                this.clearAuthTokens();
                throw error;
              }
            }
          }
        ],
        beforeError: [
          (error) => {
            if (this.config.debug) {
              console.error('[API Error]', error);
            }
            return error;
          }
        ]
      }
    });
  }

  // Authentication methods
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    const response = await this.client.post('auth/login', {
      json: credentials
    }).json<ApiResponse<{ user: User; tokens: AuthTokens }>>();

    if (response.success && response.data?.tokens) {
      this.setAuthTokens(response.data.tokens);
    }

    return response;
  }

  async register(data: RegisterData): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    const response = await this.client.post('auth/register', {
      json: data
    }).json<ApiResponse<{ user: User; tokens: AuthTokens }>>();

    if (response.success && response.data?.tokens) {
      this.setAuthTokens(response.data.tokens);
    }

    return response;
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await this.client.post('auth/logout').json<ApiResponse>();
      return response;
    } finally {
      this.clearAuthTokens();
    }
  }

  async refreshAuthTokens(): Promise<AuthTokens | null> {
    if (!this.authTokens?.refreshToken) {
      return null;
    }

    try {
      const response = await this.client.post('auth/refresh', {
        json: { refreshToken: this.authTokens.refreshToken }
      }).json<ApiResponse<{ tokens: AuthTokens }>>();

      if (response.success && response.data?.tokens) {
        this.setAuthTokens(response.data.tokens);
        return response.data.tokens;
      }
    } catch (error) {
      this.clearAuthTokens();
    }

    return null;
  }

  // User methods
  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.client.get('users/me').json<ApiResponse<User>>();
  }

  async updateCurrentUser(data: Partial<User>): Promise<ApiResponse<User>> {
    return this.client.patch('users/me', { json: data }).json<ApiResponse<User>>();
  }

  async getUsers(params?: ListParams): Promise<PaginatedResponse<User>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    return this.client.get('users', { searchParams }).json<PaginatedResponse<User>>();
  }

  // Organization methods
  async getOrganization(): Promise<ApiResponse<Organization>> {
    return this.client.get('organization').json<ApiResponse<Organization>>();
  }

  async updateOrganization(data: Partial<Organization>): Promise<ApiResponse<Organization>> {
    return this.client.patch('organization', { json: data }).json<ApiResponse<Organization>>();
  }

  // Workflow methods
  async getWorkflows(params?: ListParams): Promise<PaginatedResponse<Workflow>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    return this.client.get('workflows', { searchParams }).json<PaginatedResponse<Workflow>>();
  }

  async getWorkflow(id: string): Promise<ApiResponse<Workflow>> {
    return this.client.get(`workflows/${id}`).json<ApiResponse<Workflow>>();
  }

  async createWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<ApiResponse<Workflow>> {
    return this.client.post('workflows', { json: data }).json<ApiResponse<Workflow>>();
  }

  async updateWorkflow(id: string, data: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    return this.client.patch(`workflows/${id}`, { json: data }).json<ApiResponse<Workflow>>();
  }

  async deleteWorkflow(id: string): Promise<ApiResponse> {
    return this.client.delete(`workflows/${id}`).json<ApiResponse>();
  }

  async executeWorkflow(id: string, input?: Record<string, any>): Promise<ApiResponse<{ executionId: string }>> {
    return this.client.post(`workflows/${id}/execute`, { json: { input } }).json<ApiResponse<{ executionId: string }>>();
  }

  async duplicateWorkflow(id: string, name?: string): Promise<ApiResponse<Workflow>> {
    return this.client.post(`workflows/${id}/duplicate`, { json: { name } }).json<ApiResponse<Workflow>>();
  }

  // Agent methods
  async getAgents(params?: ListParams): Promise<PaginatedResponse<Agent>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    return this.client.get('agents', { searchParams }).json<PaginatedResponse<Agent>>();
  }

  async getAgent(id: string): Promise<ApiResponse<Agent>> {
    return this.client.get(`agents/${id}`).json<ApiResponse<Agent>>();
  }

  async createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'metrics'>): Promise<ApiResponse<Agent>> {
    return this.client.post('agents', { json: data }).json<ApiResponse<Agent>>();
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<ApiResponse<Agent>> {
    return this.client.patch(`agents/${id}`, { json: data }).json<ApiResponse<Agent>>();
  }

  async deleteAgent(id: string): Promise<ApiResponse> {
    return this.client.delete(`agents/${id}`).json<ApiResponse>();
  }

  // Execution methods
  async getExecutions(params?: ListParams & { workflowId?: string }): Promise<PaginatedResponse<Execution>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    return this.client.get('executions', { searchParams }).json<PaginatedResponse<Execution>>();
  }

  async getExecution(id: string): Promise<ApiResponse<Execution>> {
    return this.client.get(`executions/${id}`).json<ApiResponse<Execution>>();
  }

  async cancelExecution(id: string): Promise<ApiResponse> {
    return this.client.post(`executions/${id}/cancel`).json<ApiResponse>();
  }

  async retryExecution(id: string): Promise<ApiResponse<{ executionId: string }>> {
    return this.client.post(`executions/${id}/retry`).json<ApiResponse<{ executionId: string }>>();
  }

  // Analytics methods
  async getAnalytics(params: AnalyticsParams): Promise<ApiResponse<AnalyticsData>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    return this.client.get('analytics', { searchParams }).json<ApiResponse<AnalyticsData>>();
  }

  async getWorkflowAnalytics(workflowId: string, params: AnalyticsParams): Promise<ApiResponse<AnalyticsData>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    return this.client.get(`workflows/${workflowId}/analytics`, { searchParams }).json<ApiResponse<AnalyticsData>>();
  }

  async getAgentAnalytics(agentId: string, params: AnalyticsParams): Promise<ApiResponse<AnalyticsData>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    return this.client.get(`agents/${agentId}/analytics`, { searchParams }).json<ApiResponse<AnalyticsData>>();
  }

  // Notification methods
  async getNotifications(params?: ListParams): Promise<PaginatedResponse<SystemNotification>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }

    return this.client.get('notifications', { searchParams }).json<PaginatedResponse<SystemNotification>>();
  }

  async markNotificationAsRead(id: string): Promise<ApiResponse> {
    return this.client.patch(`notifications/${id}`, { json: { read: true } }).json<ApiResponse>();
  }

  async markAllNotificationsAsRead(): Promise<ApiResponse> {
    return this.client.post('notifications/mark-all-read').json<ApiResponse>();
  }

  // Token management
  setAuthTokens(tokens: AuthTokens): void {
    this.authTokens = tokens;

    // Store in localStorage if available
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('urnlabs_auth_tokens', JSON.stringify(tokens));
    }
  }

  getAuthTokens(): AuthTokens | null {
    if (this.authTokens) {
      return this.authTokens;
    }

    // Try to get from localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem('urnlabs_auth_tokens');
      if (stored) {
        try {
          this.authTokens = JSON.parse(stored);
          return this.authTokens;
        } catch (error) {
          localStorage.removeItem('urnlabs_auth_tokens');
        }
      }
    }

    return null;
  }

  clearAuthTokens(): void {
    this.authTokens = null;

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('urnlabs_auth_tokens');
    }
  }

  isAuthenticated(): boolean {
    const tokens = this.getAuthTokens();
    if (!tokens) return false;

    // Check if token is expired
    const expiresAt = new Date(tokens.expiresAt);
    return expiresAt > new Date();
  }

  // WebSocket connection helper
  createWebSocketUrl(path: string): string {
    const wsUrl = this.config.baseUrl.replace(/^https?/, 'wss');
    const tokens = this.getAuthTokens();
    const params = new URLSearchParams();

    if (tokens?.accessToken) {
      params.append('token', tokens.accessToken);
    }

    return `${wsUrl}${path}?${params.toString()}`;
  }
}