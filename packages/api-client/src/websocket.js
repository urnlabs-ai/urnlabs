export class WebSocketClient {
    config;
    socket = null;
    eventHandlers = new Map();
    reconnectAttempts = 0;
    heartbeatTimer = null;
    reconnectTimer = null;
    isConnecting = false;
    isClosing = false;
    constructor(config) {
        this.config = {
            reconnectAttempts: 5,
            reconnectInterval: 5000,
            heartbeatInterval: 30000,
            debug: false,
            ...config
        };
    }
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }
            if (this.isConnecting) {
                reject(new Error('Already connecting'));
                return;
            }
            this.isConnecting = true;
            this.isClosing = false;
            try {
                this.socket = new WebSocket(this.config.url);
                this.socket.onopen = () => {
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    if (this.config.debug) {
                        console.log('[WebSocket] Connected');
                    }
                    resolve();
                };
                this.socket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    }
                    catch (error) {
                        console.error('[WebSocket] Failed to parse message:', error);
                    }
                };
                this.socket.onclose = (event) => {
                    this.isConnecting = false;
                    this.stopHeartbeat();
                    if (this.config.debug) {
                        console.log('[WebSocket] Disconnected', event.code, event.reason);
                    }
                    if (!this.isClosing && this.shouldReconnect()) {
                        this.scheduleReconnect();
                    }
                };
                this.socket.onerror = (error) => {
                    this.isConnecting = false;
                    if (this.config.debug) {
                        console.error('[WebSocket] Error:', error);
                    }
                    reject(error);
                };
            }
            catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }
    disconnect() {
        this.isClosing = true;
        this.stopHeartbeat();
        this.clearReconnectTimer();
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        if (this.config.debug) {
            console.log('[WebSocket] Disconnected by client');
        }
    }
    send(message) {
        if (this.socket?.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not connected');
        }
        const fullMessage = {
            ...message,
            id: this.generateId(),
            timestamp: new Date().toISOString()
        };
        this.socket.send(JSON.stringify(fullMessage));
        if (this.config.debug) {
            console.log('[WebSocket] Sent:', fullMessage);
        }
    }
    // Event handling
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        this.eventHandlers.get(eventType).add(handler);
    }
    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.eventHandlers.delete(eventType);
            }
        }
    }
    // Specific event subscriptions
    onWorkflowExecution(handler) {
        const wrappedHandler = (message) => {
            if (message.type === 'workflow_execution_update') {
                handler(message.payload);
            }
        };
        this.on('workflow_execution_update', wrappedHandler);
        return () => this.off('workflow_execution_update', wrappedHandler);
    }
    onSystemNotification(handler) {
        const wrappedHandler = (message) => {
            if (message.type === 'system_notification') {
                handler(message.payload);
            }
        };
        this.on('system_notification', wrappedHandler);
        return () => this.off('system_notification', wrappedHandler);
    }
    onAgentMetrics(handler) {
        const wrappedHandler = (message) => {
            if (message.type === 'agent_metrics_update') {
                handler(message.payload);
            }
        };
        this.on('agent_metrics_update', wrappedHandler);
        return () => this.off('agent_metrics_update', wrappedHandler);
    }
    // Connection state
    isConnected() {
        return this.socket?.readyState === WebSocket.OPEN;
    }
    getReadyState() {
        return this.socket?.readyState ?? null;
    }
    // Subscription management
    subscribeToWorkflow(workflowId) {
        this.send({
            type: 'subscribe',
            payload: {
                channel: 'workflow_executions',
                workflowId
            }
        });
    }
    unsubscribeFromWorkflow(workflowId) {
        this.send({
            type: 'unsubscribe',
            payload: {
                channel: 'workflow_executions',
                workflowId
            }
        });
    }
    subscribeToAgent(agentId) {
        this.send({
            type: 'subscribe',
            payload: {
                channel: 'agent_metrics',
                agentId
            }
        });
    }
    unsubscribeFromAgent(agentId) {
        this.send({
            type: 'unsubscribe',
            payload: {
                channel: 'agent_metrics',
                agentId
            }
        });
    }
    subscribeToNotifications() {
        this.send({
            type: 'subscribe',
            payload: {
                channel: 'system_notifications'
            }
        });
    }
    // Private methods
    handleMessage(message) {
        if (this.config.debug) {
            console.log('[WebSocket] Received:', message);
        }
        // Handle heartbeat responses
        if (message.type === 'pong') {
            return;
        }
        // Emit to specific event handlers
        const handlers = this.eventHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                }
                catch (error) {
                    console.error('[WebSocket] Error in event handler:', error);
                }
            });
        }
        // Emit to general handlers
        const generalHandlers = this.eventHandlers.get('*');
        if (generalHandlers) {
            generalHandlers.forEach(handler => {
                try {
                    handler(message);
                }
                catch (error) {
                    console.error('[WebSocket] Error in general event handler:', error);
                }
            });
        }
    }
    startHeartbeat() {
        this.stopHeartbeat();
        if (this.config.heartbeatInterval && this.config.heartbeatInterval > 0) {
            this.heartbeatTimer = setInterval(() => {
                if (this.socket?.readyState === WebSocket.OPEN) {
                    this.send({
                        type: 'ping',
                        payload: {}
                    });
                }
            }, this.config.heartbeatInterval);
        }
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    shouldReconnect() {
        return this.reconnectAttempts < (this.config.reconnectAttempts || 0);
    }
    scheduleReconnect() {
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            if (this.config.debug) {
                console.log(`[WebSocket] Reconnecting... Attempt ${this.reconnectAttempts}`);
            }
            this.connect().catch(error => {
                console.error('[WebSocket] Reconnection failed:', error);
            });
        }, this.config.reconnectInterval);
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    generateId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
}
//# sourceMappingURL=websocket.js.map