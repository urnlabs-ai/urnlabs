import { WorkflowExecutionUpdate, SystemNotification } from '@urnlabs/api-client';
interface RealtimeState {
    isConnected: boolean;
    connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
    lastError: string | null;
    retryCount: number;
    subscriptions: Set<string>;
    workflowSubscriptions: Set<string>;
    agentSubscriptions: Set<string>;
    notifications: SystemNotification[];
    unreadNotificationCount: number;
    recentWorkflowUpdates: WorkflowExecutionUpdate[];
    agentMetrics: Record<string, any>;
    connect: () => Promise<void>;
    disconnect: () => void;
    reconnect: () => Promise<void>;
    subscribeToWorkflow: (workflowId: string) => void;
    unsubscribeFromWorkflow: (workflowId: string) => void;
    subscribeToAgent: (agentId: string) => void;
    unsubscribeFromAgent: (agentId: string) => void;
    subscribeToNotifications: () => void;
    addNotification: (notification: SystemNotification) => void;
    markNotificationAsRead: (notificationId: string) => void;
    markAllNotificationsAsRead: () => void;
    removeNotification: (notificationId: string) => void;
    clearNotifications: () => void;
    addWorkflowUpdate: (update: WorkflowExecutionUpdate) => void;
    clearWorkflowUpdates: () => void;
    updateAgentMetrics: (agentId: string, metrics: any) => void;
    clearAgentMetrics: (agentId: string) => void;
    clearError: () => void;
    resetState: () => void;
}
export declare const useRealtimeStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<RealtimeState>, "setState"> & {
    setState(nextStateOrUpdater: RealtimeState | Partial<RealtimeState> | ((state: import("immer").WritableDraft<RealtimeState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export declare const useRealtimeConnection: () => {
    isConnected: boolean;
    connectionStatus: "error" | "connecting" | "connected" | "disconnected";
    lastError: string | null;
    retryCount: number;
};
export declare const useNotifications: () => SystemNotification[];
export declare const useUnreadNotificationCount: () => number;
export declare const useWorkflowUpdates: () => WorkflowExecutionUpdate[];
export declare const useAgentMetrics: (agentId?: string) => any;
export declare const useAutoConnect: () => {
    isConnected: boolean;
    connectionStatus: "error" | "connecting" | "connected" | "disconnected";
};
export {};
//# sourceMappingURL=realtime.d.ts.map