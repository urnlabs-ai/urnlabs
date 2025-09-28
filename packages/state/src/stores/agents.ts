import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import {
  Agent,
  AnalyticsData,
  AnalyticsParams,
  ListParams,
  getApiClient
} from '@urnlabs/api-client';

interface AgentState {
  // State
  agents: Agent[];
  currentAgent: Agent | null;
  agentAnalytics: Record<string, AnalyticsData>;
  isLoading: boolean;
  error: string | null;

  // Pagination
  total: number;
  page: number;
  hasMore: boolean;

  // Actions
  fetchAgents: (params?: ListParams) => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  createAgent: (data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'metrics'>) => Promise<{ success: boolean; error?: string }>;
  updateAgent: (id: string, data: Partial<Agent>) => Promise<{ success: boolean; error?: string }>;
  deleteAgent: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Analytics actions
  fetchAgentAnalytics: (agentId: string, params: AnalyticsParams) => Promise<void>;

  // Utility actions
  setCurrentAgent: (agent: Agent | null) => void;
  clearError: () => void;
  resetState: () => void;
}

const initialState = {
  agents: [],
  currentAgent: null,
  agentAnalytics: {},
  isLoading: false,
  error: null,
  total: 0,
  page: 1,
  hasMore: true
};

export const useAgentStore = create<AgentState>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      fetchAgents: async (params?: ListParams) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.getAgents(params);

          if (response.success && response.data) {
            set((state) => {
              state.agents = response.data.items;
              state.total = response.data.total;
              state.page = response.data.page;
              state.hasMore = response.data.hasMore;
              state.isLoading = false;
            });
          } else {
            set((state) => {
              state.error = response.error?.message || 'Failed to fetch agents';
              state.isLoading = false;
            });
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Failed to fetch agents';
            state.isLoading = false;
          });
        }
      },

      fetchAgent: async (id: string) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.getAgent(id);

          if (response.success && response.data) {
            set((state) => {
              state.currentAgent = response.data;

              // Update the agent in the list if it exists
              const index = state.agents.findIndex(agent => agent.id === id);
              if (index !== -1) {
                state.agents[index] = response.data;
              }

              state.isLoading = false;
            });
          } else {
            set((state) => {
              state.error = response.error?.message || 'Failed to fetch agent';
              state.isLoading = false;
            });
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Failed to fetch agent';
            state.isLoading = false;
          });
        }
      },

      createAgent: async (data) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.createAgent(data);

          if (response.success && response.data) {
            set((state) => {
              state.agents.unshift(response.data);
              state.currentAgent = response.data;
              state.total += 1;
              state.isLoading = false;
            });
            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Failed to create agent';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create agent';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      updateAgent: async (id: string, data: Partial<Agent>) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.updateAgent(id, data);

          if (response.success && response.data) {
            set((state) => {
              const index = state.agents.findIndex(agent => agent.id === id);
              if (index !== -1) {
                state.agents[index] = response.data;
              }
              if (state.currentAgent?.id === id) {
                state.currentAgent = response.data;
              }
              state.isLoading = false;
            });
            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Failed to update agent';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update agent';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      deleteAgent: async (id: string) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.deleteAgent(id);

          if (response.success) {
            set((state) => {
              state.agents = state.agents.filter(agent => agent.id !== id);
              if (state.currentAgent?.id === id) {
                state.currentAgent = null;
              }
              state.total = Math.max(0, state.total - 1);

              // Clean up analytics data for this agent
              delete state.agentAnalytics[id];

              state.isLoading = false;
            });
            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Failed to delete agent';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete agent';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      fetchAgentAnalytics: async (agentId: string, params: AnalyticsParams) => {
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

      setCurrentAgent: (agent: Agent | null) => {
        set((state) => {
          state.currentAgent = agent;
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
      name: 'urnlabs-agents',
      partialize: (state) => ({
        agents: state.agents,
        currentAgent: state.currentAgent,
        page: state.page,
        total: state.total
      })
    }
  )
);

// Selectors
export const useAgents = () => useAgentStore((state) => state.agents);
export const useCurrentAgent = () => useAgentStore((state) => state.currentAgent);
export const useAgentAnalytics = (agentId: string) => useAgentStore((state) => state.agentAnalytics[agentId]);
export const useAgentLoading = () => useAgentStore((state) => state.isLoading);
export const useAgentError = () => useAgentStore((state) => state.error);

// Helper hooks for specific agent states
export const useAgentsByStatus = (status: Agent['status']) =>
  useAgentStore((state) => state.agents.filter(agent => agent.status === status));

export const useAgentsByType = (type: Agent['type']) =>
  useAgentStore((state) => state.agents.filter(agent => agent.type === type));

export const useActiveAgents = () =>
  useAgentStore((state) => state.agents.filter(agent => agent.status === 'active'));

export const useAgentMetrics = () =>
  useAgentStore((state) => {
    const agents = state.agents;
    const totalAgents = agents.length;
    const activeAgents = agents.filter(agent => agent.status === 'active').length;
    const inactiveAgents = agents.filter(agent => agent.status === 'inactive').length;
    const errorAgents = agents.filter(agent => agent.status === 'error').length;

    return {
      total: totalAgents,
      active: activeAgents,
      inactive: inactiveAgents,
      error: errorAgents,
      successRate: totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0
    };
  });