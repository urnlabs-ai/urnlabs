import { User, Organization, Workflow, Agent, Execution, AnalyticsData, ApiResponse, PaginatedResponse, ListParams, AnalyticsParams, AuthTokens, LoginCredentials, RegisterData, SystemNotification } from './types';
export interface ApiClientConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
    debug?: boolean;
}
export declare class ApiClient {
    private client;
    private config;
    private authTokens;
    constructor(config: ApiClientConfig);
    login(credentials: LoginCredentials): Promise<ApiResponse<{
        user: User;
        tokens: AuthTokens;
    }>>;
    register(data: RegisterData): Promise<ApiResponse<{
        user: User;
        tokens: AuthTokens;
    }>>;
    logout(): Promise<ApiResponse>;
    refreshAuthTokens(): Promise<AuthTokens | null>;
    getCurrentUser(): Promise<ApiResponse<User>>;
    updateCurrentUser(data: Partial<User>): Promise<ApiResponse<User>>;
    getUsers(params?: ListParams): Promise<PaginatedResponse<User>>;
    getOrganization(): Promise<ApiResponse<Organization>>;
    updateOrganization(data: Partial<Organization>): Promise<ApiResponse<Organization>>;
    getWorkflows(params?: ListParams): Promise<PaginatedResponse<Workflow>>;
    getWorkflow(id: string): Promise<ApiResponse<Workflow>>;
    createWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<ApiResponse<Workflow>>;
    updateWorkflow(id: string, data: Partial<Workflow>): Promise<ApiResponse<Workflow>>;
    deleteWorkflow(id: string): Promise<ApiResponse>;
    executeWorkflow(id: string, input?: Record<string, any>): Promise<ApiResponse<{
        executionId: string;
    }>>;
    duplicateWorkflow(id: string, name?: string): Promise<ApiResponse<Workflow>>;
    getAgents(params?: ListParams): Promise<PaginatedResponse<Agent>>;
    getAgent(id: string): Promise<ApiResponse<Agent>>;
    createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'metrics'>): Promise<ApiResponse<Agent>>;
    updateAgent(id: string, data: Partial<Agent>): Promise<ApiResponse<Agent>>;
    deleteAgent(id: string): Promise<ApiResponse>;
    getExecutions(params?: ListParams & {
        workflowId?: string;
    }): Promise<PaginatedResponse<Execution>>;
    getExecution(id: string): Promise<ApiResponse<Execution>>;
    cancelExecution(id: string): Promise<ApiResponse>;
    retryExecution(id: string): Promise<ApiResponse<{
        executionId: string;
    }>>;
    getAnalytics(params: AnalyticsParams): Promise<ApiResponse<AnalyticsData>>;
    getWorkflowAnalytics(workflowId: string, params: AnalyticsParams): Promise<ApiResponse<AnalyticsData>>;
    getAgentAnalytics(agentId: string, params: AnalyticsParams): Promise<ApiResponse<AnalyticsData>>;
    getNotifications(params?: ListParams): Promise<PaginatedResponse<SystemNotification>>;
    markNotificationAsRead(id: string): Promise<ApiResponse>;
    markAllNotificationsAsRead(): Promise<ApiResponse>;
    setAuthTokens(tokens: AuthTokens): void;
    getAuthTokens(): AuthTokens | null;
    clearAuthTokens(): void;
    isAuthenticated(): boolean;
    createWebSocketUrl(path: string): string;
}
//# sourceMappingURL=client.d.ts.map