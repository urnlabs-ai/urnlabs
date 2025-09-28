import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import {
  AnalyticsData,
  AnalyticsParams,
  getApiClient
} from '@urnlabs/api-client';

interface AnalyticsState {
  // State
  systemAnalytics: AnalyticsData | null;
  workflowAnalytics: Record<string, AnalyticsData>;
  agentAnalytics: Record<string, AnalyticsData>;
  isLoading: boolean;
  error: string | null;

  // Cache management
  lastUpdated: Record<string, string>;
  cacheExpiry: number; // minutes

  // Actions
  fetchSystemAnalytics: (params: AnalyticsParams, forceRefresh?: boolean) => Promise<void>;
  fetchWorkflowAnalytics: (workflowId: string, params: AnalyticsParams, forceRefresh?: boolean) => Promise<void>;
  fetchAgentAnalytics: (agentId: string, params: AnalyticsParams, forceRefresh?: boolean) => Promise<void>;

  // Utility actions
  clearCache: (type?: 'system' | 'workflow' | 'agent', id?: string) => void;
  clearError: () => void;
  resetState: () => void;
}

const initialState = {
  systemAnalytics: null,
  workflowAnalytics: {},
  agentAnalytics: {},
  isLoading: false,
  error: null,
  lastUpdated: {},
  cacheExpiry: 15 // 15 minutes
};

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      fetchSystemAnalytics: async (params: AnalyticsParams, forceRefresh = false) => {
        const state = get();
        const cacheKey = 'system';
        const lastUpdate = state.lastUpdated[cacheKey];

        // Check cache validity
        if (!forceRefresh && lastUpdate && state.systemAnalytics) {
          const cacheAge = Date.now() - new Date(lastUpdate).getTime();
          if (cacheAge < state.cacheExpiry * 60 * 1000) {
            return; // Use cached data
          }
        }

        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.getAnalytics(params);

          if (response.success && response.data) {
            set((state) => {
              state.systemAnalytics = response.data;
              state.lastUpdated[cacheKey] = new Date().toISOString();
              state.isLoading = false;
            });
          } else {
            set((state) => {
              state.error = response.error?.message || 'Failed to fetch system analytics';
              state.isLoading = false;
            });
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Failed to fetch system analytics';
            state.isLoading = false;
          });
        }
      },

      fetchWorkflowAnalytics: async (workflowId: string, params: AnalyticsParams, forceRefresh = false) => {
        const state = get();
        const cacheKey = `workflow-${workflowId}`;
        const lastUpdate = state.lastUpdated[cacheKey];

        // Check cache validity
        if (!forceRefresh && lastUpdate && state.workflowAnalytics[workflowId]) {
          const cacheAge = Date.now() - new Date(lastUpdate).getTime();
          if (cacheAge < state.cacheExpiry * 60 * 1000) {
            return; // Use cached data
          }
        }

        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.getWorkflowAnalytics(workflowId, params);

          if (response.success && response.data) {
            set((state) => {
              state.workflowAnalytics[workflowId] = response.data;
              state.lastUpdated[cacheKey] = new Date().toISOString();
              state.isLoading = false;
            });
          } else {
            set((state) => {
              state.error = response.error?.message || 'Failed to fetch workflow analytics';
              state.isLoading = false;
            });
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Failed to fetch workflow analytics';
            state.isLoading = false;
          });
        }
      },

      fetchAgentAnalytics: async (agentId: string, params: AnalyticsParams, forceRefresh = false) => {
        const state = get();
        const cacheKey = `agent-${agentId}`;
        const lastUpdate = state.lastUpdated[cacheKey];

        // Check cache validity
        if (!forceRefresh && lastUpdate && state.agentAnalytics[agentId]) {
          const cacheAge = Date.now() - new Date(lastUpdate).getTime();
          if (cacheAge < state.cacheExpiry * 60 * 1000) {
            return; // Use cached data
          }
        }

        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.getAgentAnalytics(agentId, params);

          if (response.success && response.data) {
            set((state) => {
              state.agentAnalytics[agentId] = response.data;
              state.lastUpdated[cacheKey] = new Date().toISOString();
              state.isLoading = false;
            });
          } else {
            set((state) => {
              state.error = response.error?.message || 'Failed to fetch agent analytics';
              state.isLoading = false;
            });
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Failed to fetch agent analytics';
            state.isLoading = false;
          });
        }
      },

      clearCache: (type?: 'system' | 'workflow' | 'agent', id?: string) => {
        set((state) => {
          if (type === 'system') {
            state.systemAnalytics = null;
            delete state.lastUpdated['system'];
          } else if (type === 'workflow' && id) {
            delete state.workflowAnalytics[id];
            delete state.lastUpdated[`workflow-${id}`];
          } else if (type === 'agent' && id) {
            delete state.agentAnalytics[id];
            delete state.lastUpdated[`agent-${id}`];
          } else {
            // Clear all cache
            state.systemAnalytics = null;
            state.workflowAnalytics = {};
            state.agentAnalytics = {};
            state.lastUpdated = {};
          }
        });
      },

      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },

      resetState: () => {
        set((state) => {
          Object.assign(state, initialState);
        });
      }
    })),
    {
      name: 'urnlabs-analytics',
      partialize: (state) => ({
        systemAnalytics: state.systemAnalytics,
        workflowAnalytics: state.workflowAnalytics,
        agentAnalytics: state.agentAnalytics,
        lastUpdated: state.lastUpdated,
        cacheExpiry: state.cacheExpiry
      })
    }
  )
);

// Selectors
export const useSystemAnalytics = () => useAnalyticsStore((state) => state.systemAnalytics);
export const useWorkflowAnalytics = (workflowId: string) =>
  useAnalyticsStore((state) => state.workflowAnalytics[workflowId]);
export const useAgentAnalytics = (agentId: string) =>
  useAnalyticsStore((state) => state.agentAnalytics[agentId]);
export const useAnalyticsLoading = () => useAnalyticsStore((state) => state.isLoading);
export const useAnalyticsError = () => useAnalyticsStore((state) => state.error);

// Helper hooks for common analytics use cases
export const useSystemMetrics = () => {
  const analytics = useSystemAnalytics();
  if (!analytics) return null;

  return {
    totalExecutions: analytics.metrics.totalExecutions || 0,
    successfulExecutions: analytics.metrics.successfulExecutions || 0,
    failedExecutions: analytics.metrics.failedExecutions || 0,
    averageExecutionTime: analytics.metrics.averageExecutionTime || 0,
    successRate: analytics.metrics.successRate || 0,
    totalWorkflows: analytics.metrics.totalWorkflows || 0,
    activeAgents: analytics.metrics.activeAgents || 0
  };
};

export const useTrendData = (type: 'system' | 'workflow' | 'agent', id?: string) => {
  const systemAnalytics = useSystemAnalytics();
  const workflowAnalytics = id ? useWorkflowAnalytics(id) : null;
  const agentAnalytics = id ? useAgentAnalytics(id) : null;

  let analytics: AnalyticsData | null = null;
  if (type === 'system') analytics = systemAnalytics;
  else if (type === 'workflow') analytics = workflowAnalytics;
  else if (type === 'agent') analytics = agentAnalytics;

  if (!analytics?.trends) return null;

  return {
    executionTrends: analytics.trends.executionTrends || [],
    performanceTrends: analytics.trends.performanceTrends || [],
    errorTrends: analytics.trends.errorTrends || []
  };
};

export const useTopPerformers = () => {
  const analytics = useSystemAnalytics();
  if (!analytics?.insights) return null;

  return {
    topWorkflows: analytics.insights.topWorkflows || [],
    topAgents: analytics.insights.topAgents || [],
    mostUsedNodes: analytics.insights.mostUsedNodes || []
  };
};

// Cache management hooks
export const useCacheStatus = (type: 'system' | 'workflow' | 'agent', id?: string) => {
  return useAnalyticsStore((state) => {
    let cacheKey: string;
    if (type === 'system') cacheKey = 'system';
    else if (type === 'workflow' && id) cacheKey = `workflow-${id}`;
    else if (type === 'agent' && id) cacheKey = `agent-${id}`;
    else return null;

    const lastUpdate = state.lastUpdated[cacheKey];
    if (!lastUpdate) return { isStale: true, lastUpdated: null };

    const cacheAge = Date.now() - new Date(lastUpdate).getTime();
    const isStale = cacheAge >= state.cacheExpiry * 60 * 1000;

    return {
      isStale,
      lastUpdated: lastUpdate,
      cacheAge: Math.floor(cacheAge / 1000 / 60) // age in minutes
    };
  });
};