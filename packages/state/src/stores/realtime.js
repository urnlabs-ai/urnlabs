import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useEffect } from 'react';
import { getWebSocketClient } from '@urnlabs/api-client';
const initialState = {
    isConnected: false,
    connectionStatus: 'disconnected',
    lastError: null,
    retryCount: 0,
    subscriptions: new Set(),
    workflowSubscriptions: new Set(),
    agentSubscriptions: new Set(),
    notifications: [],
    unreadNotificationCount: 0,
    recentWorkflowUpdates: [],
    agentMetrics: {}
};
export const useRealtimeStore = create()(immer((set, get) => ({
    ...initialState,
    connect: async () => {
        const state = get();
        if (state.isConnected || state.connectionStatus === 'connecting') {
            return;
        }
        set((state) => {
            state.connectionStatus = 'connecting';
            state.lastError = null;
        });
        try {
            const wsClient = getWebSocketClient();
            // Set up event handlers
            wsClient.on('*', (message) => {
                const state = get();
                if (!state.isConnected) {
                    set((state) => {
                        state.isConnected = true;
                        state.connectionStatus = 'connected';
                        state.retryCount = 0;
                    });
                }
            });
            // Handle workflow execution updates
            const unsubscribeWorkflow = wsClient.onWorkflowExecution((update) => {
                get().addWorkflowUpdate(update);
            });
            // Handle system notifications
            const unsubscribeNotifications = wsClient.onSystemNotification((notification) => {
                get().addNotification(notification);
            });
            // Handle agent metrics
            const unsubscribeAgentMetrics = wsClient.onAgentMetrics((metrics) => {
                if (metrics.agentId) {
                    get().updateAgentMetrics(metrics.agentId, metrics);
                }
            });
            await wsClient.connect();
            set((state) => {
                state.isConnected = true;
                state.connectionStatus = 'connected';
                state.retryCount = 0;
            });
            // Re-establish subscriptions
            state.workflowSubscriptions.forEach(workflowId => {
                wsClient.subscribeToWorkflow(workflowId);
            });
            state.agentSubscriptions.forEach(agentId => {
                wsClient.subscribeToAgent(agentId);
            });
            if (state.subscriptions.has('notifications')) {
                wsClient.subscribeToNotifications();
            }
        }
        catch (error) {
            set((state) => {
                state.isConnected = false;
                state.connectionStatus = 'error';
                state.lastError = error instanceof Error ? error.message : 'Connection failed';
                state.retryCount += 1;
            });
            throw error;
        }
    },
    disconnect: () => {
        try {
            const wsClient = getWebSocketClient();
            wsClient.disconnect();
        }
        catch (error) {
            console.warn('Error disconnecting WebSocket:', error);
        }
        set((state) => {
            state.isConnected = false;
            state.connectionStatus = 'disconnected';
            state.lastError = null;
        });
    },
    reconnect: async () => {
        get().disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        await get().connect();
    },
    subscribeToWorkflow: (workflowId) => {
        set((state) => {
            state.workflowSubscriptions.add(workflowId);
        });
        if (get().isConnected) {
            try {
                const wsClient = getWebSocketClient();
                wsClient.subscribeToWorkflow(workflowId);
            }
            catch (error) {
                console.error('Failed to subscribe to workflow:', error);
            }
        }
    },
    unsubscribeFromWorkflow: (workflowId) => {
        set((state) => {
            state.workflowSubscriptions.delete(workflowId);
        });
        if (get().isConnected) {
            try {
                const wsClient = getWebSocketClient();
                wsClient.unsubscribeFromWorkflow(workflowId);
            }
            catch (error) {
                console.error('Failed to unsubscribe from workflow:', error);
            }
        }
    },
    subscribeToAgent: (agentId) => {
        set((state) => {
            state.agentSubscriptions.add(agentId);
        });
        if (get().isConnected) {
            try {
                const wsClient = getWebSocketClient();
                wsClient.subscribeToAgent(agentId);
            }
            catch (error) {
                console.error('Failed to subscribe to agent:', error);
            }
        }
    },
    unsubscribeFromAgent: (agentId) => {
        set((state) => {
            state.agentSubscriptions.delete(agentId);
            delete state.agentMetrics[agentId];
        });
        if (get().isConnected) {
            try {
                const wsClient = getWebSocketClient();
                wsClient.unsubscribeFromAgent(agentId);
            }
            catch (error) {
                console.error('Failed to unsubscribe from agent:', error);
            }
        }
    },
    subscribeToNotifications: () => {
        set((state) => {
            state.subscriptions.add('notifications');
        });
        if (get().isConnected) {
            try {
                const wsClient = getWebSocketClient();
                wsClient.subscribeToNotifications();
            }
            catch (error) {
                console.error('Failed to subscribe to notifications:', error);
            }
        }
    },
    addNotification: (notification) => {
        set((state) => {
            // Avoid duplicates
            const exists = state.notifications.some(n => n.id === notification.id);
            if (!exists) {
                state.notifications.unshift(notification);
                if (!notification.read) {
                    state.unreadNotificationCount += 1;
                }
            }
            // Keep only the last 100 notifications
            if (state.notifications.length > 100) {
                state.notifications = state.notifications.slice(0, 100);
            }
        });
    },
    markNotificationAsRead: (notificationId) => {
        set((state) => {
            const notification = state.notifications.find(n => n.id === notificationId);
            if (notification && !notification.read) {
                notification.read = true;
                state.unreadNotificationCount = Math.max(0, state.unreadNotificationCount - 1);
            }
        });
    },
    markAllNotificationsAsRead: () => {
        set((state) => {
            state.notifications.forEach(notification => {
                notification.read = true;
            });
            state.unreadNotificationCount = 0;
        });
    },
    removeNotification: (notificationId) => {
        set((state) => {
            const index = state.notifications.findIndex(n => n.id === notificationId);
            if (index !== -1) {
                const notification = state.notifications[index];
                if (!notification.read) {
                    state.unreadNotificationCount = Math.max(0, state.unreadNotificationCount - 1);
                }
                state.notifications.splice(index, 1);
            }
        });
    },
    clearNotifications: () => {
        set((state) => {
            state.notifications = [];
            state.unreadNotificationCount = 0;
        });
    },
    addWorkflowUpdate: (update) => {
        set((state) => {
            // Avoid duplicates
            const exists = state.recentWorkflowUpdates.some(u => u.executionId === update.executionId && u.timestamp === update.timestamp);
            if (!exists) {
                state.recentWorkflowUpdates.unshift(update);
            }
            // Keep only the last 50 updates
            if (state.recentWorkflowUpdates.length > 50) {
                state.recentWorkflowUpdates = state.recentWorkflowUpdates.slice(0, 50);
            }
        });
    },
    clearWorkflowUpdates: () => {
        set((state) => {
            state.recentWorkflowUpdates = [];
        });
    },
    updateAgentMetrics: (agentId, metrics) => {
        set((state) => {
            state.agentMetrics[agentId] = {
                ...state.agentMetrics[agentId],
                ...metrics,
                lastUpdated: new Date().toISOString()
            };
        });
    },
    clearAgentMetrics: (agentId) => {
        set((state) => {
            delete state.agentMetrics[agentId];
        });
    },
    clearError: () => {
        set((state) => {
            state.lastError = null;
        });
    },
    resetState: () => {
        get().disconnect();
        set((state) => {
            Object.assign(state, initialState);
        });
    }
})));
// Selectors
export const useRealtimeConnection = () => useRealtimeStore((state) => ({
    isConnected: state.isConnected,
    connectionStatus: state.connectionStatus,
    lastError: state.lastError,
    retryCount: state.retryCount
}));
export const useNotifications = () => useRealtimeStore((state) => state.notifications);
export const useUnreadNotificationCount = () => useRealtimeStore((state) => state.unreadNotificationCount);
export const useWorkflowUpdates = () => useRealtimeStore((state) => state.recentWorkflowUpdates);
export const useAgentMetrics = (agentId) => useRealtimeStore((state) => agentId ? state.agentMetrics[agentId] : state.agentMetrics);
// Auto-connect hook
export const useAutoConnect = () => {
    const { connect, isConnected, connectionStatus } = useRealtimeStore((state) => ({
        connect: state.connect,
        isConnected: state.isConnected,
        connectionStatus: state.connectionStatus
    }));
    // Auto-connect when needed
    useEffect(() => {
        if (!isConnected && connectionStatus === 'disconnected') {
            connect().catch(console.error);
        }
    }, [connect, isConnected, connectionStatus]);
    return { isConnected, connectionStatus };
};
//# sourceMappingURL=realtime.js.map