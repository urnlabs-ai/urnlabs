import ky from 'ky';
export class ApiClient {
    client;
    config;
    authTokens = null;
    constructor(config) {
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
                            }
                            catch (error) {
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
    async login(credentials) {
        const response = await this.client.post('auth/login', {
            json: credentials
        }).json();
        if (response.success && response.data?.tokens) {
            this.setAuthTokens(response.data.tokens);
        }
        return response;
    }
    async register(data) {
        const response = await this.client.post('auth/register', {
            json: data
        }).json();
        if (response.success && response.data?.tokens) {
            this.setAuthTokens(response.data.tokens);
        }
        return response;
    }
    async logout() {
        try {
            const response = await this.client.post('auth/logout').json();
            return response;
        }
        finally {
            this.clearAuthTokens();
        }
    }
    async refreshAuthTokens() {
        if (!this.authTokens?.refreshToken) {
            return null;
        }
        try {
            const response = await this.client.post('auth/refresh', {
                json: { refreshToken: this.authTokens.refreshToken }
            }).json();
            if (response.success && response.data?.tokens) {
                this.setAuthTokens(response.data.tokens);
                return response.data.tokens;
            }
        }
        catch (error) {
            this.clearAuthTokens();
        }
        return null;
    }
    // User methods
    async getCurrentUser() {
        return this.client.get('users/me').json();
    }
    async updateCurrentUser(data) {
        return this.client.patch('users/me', { json: data }).json();
    }
    async getUsers(params) {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            });
        }
        return this.client.get('users', { searchParams }).json();
    }
    // Organization methods
    async getOrganization() {
        return this.client.get('organization').json();
    }
    async updateOrganization(data) {
        return this.client.patch('organization', { json: data }).json();
    }
    // Workflow methods
    async getWorkflows(params) {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            });
        }
        return this.client.get('workflows', { searchParams }).json();
    }
    async getWorkflow(id) {
        return this.client.get(`workflows/${id}`).json();
    }
    async createWorkflow(data) {
        return this.client.post('workflows', { json: data }).json();
    }
    async updateWorkflow(id, data) {
        return this.client.patch(`workflows/${id}`, { json: data }).json();
    }
    async deleteWorkflow(id) {
        return this.client.delete(`workflows/${id}`).json();
    }
    async executeWorkflow(id, input) {
        return this.client.post(`workflows/${id}/execute`, { json: { input } }).json();
    }
    async duplicateWorkflow(id, name) {
        return this.client.post(`workflows/${id}/duplicate`, { json: { name } }).json();
    }
    // Agent methods
    async getAgents(params) {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            });
        }
        return this.client.get('agents', { searchParams }).json();
    }
    async getAgent(id) {
        return this.client.get(`agents/${id}`).json();
    }
    async createAgent(data) {
        return this.client.post('agents', { json: data }).json();
    }
    async updateAgent(id, data) {
        return this.client.patch(`agents/${id}`, { json: data }).json();
    }
    async deleteAgent(id) {
        return this.client.delete(`agents/${id}`).json();
    }
    // Execution methods
    async getExecutions(params) {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            });
        }
        return this.client.get('executions', { searchParams }).json();
    }
    async getExecution(id) {
        return this.client.get(`executions/${id}`).json();
    }
    async cancelExecution(id) {
        return this.client.post(`executions/${id}/cancel`).json();
    }
    async retryExecution(id) {
        return this.client.post(`executions/${id}/retry`).json();
    }
    // Analytics methods
    async getAnalytics(params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(v => searchParams.append(key, String(v)));
                }
                else {
                    searchParams.append(key, String(value));
                }
            }
        });
        return this.client.get('analytics', { searchParams }).json();
    }
    async getWorkflowAnalytics(workflowId, params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(v => searchParams.append(key, String(v)));
                }
                else {
                    searchParams.append(key, String(value));
                }
            }
        });
        return this.client.get(`workflows/${workflowId}/analytics`, { searchParams }).json();
    }
    async getAgentAnalytics(agentId, params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(v => searchParams.append(key, String(v)));
                }
                else {
                    searchParams.append(key, String(value));
                }
            }
        });
        return this.client.get(`agents/${agentId}/analytics`, { searchParams }).json();
    }
    // Notification methods
    async getNotifications(params) {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            });
        }
        return this.client.get('notifications', { searchParams }).json();
    }
    async markNotificationAsRead(id) {
        return this.client.patch(`notifications/${id}`, { json: { read: true } }).json();
    }
    async markAllNotificationsAsRead() {
        return this.client.post('notifications/mark-all-read').json();
    }
    // Token management
    setAuthTokens(tokens) {
        this.authTokens = tokens;
        // Store in localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('urnlabs_auth_tokens', JSON.stringify(tokens));
        }
    }
    getAuthTokens() {
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
                }
                catch (error) {
                    localStorage.removeItem('urnlabs_auth_tokens');
                }
            }
        }
        return null;
    }
    clearAuthTokens() {
        this.authTokens = null;
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem('urnlabs_auth_tokens');
        }
    }
    isAuthenticated() {
        const tokens = this.getAuthTokens();
        if (!tokens)
            return false;
        // Check if token is expired
        const expiresAt = new Date(tokens.expiresAt);
        return expiresAt > new Date();
    }
    // WebSocket connection helper
    createWebSocketUrl(path) {
        const wsUrl = this.config.baseUrl.replace(/^https?/, 'wss');
        const tokens = this.getAuthTokens();
        const params = new URLSearchParams();
        if (tokens?.accessToken) {
            params.append('token', tokens.accessToken);
        }
        return `${wsUrl}${path}?${params.toString()}`;
    }
}
//# sourceMappingURL=client.js.map