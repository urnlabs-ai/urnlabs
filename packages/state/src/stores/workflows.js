import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { getApiClient } from '@urnlabs/api-client';
const initialState = {
    workflows: [],
    currentWorkflow: null,
    executions: [],
    currentExecution: null,
    isLoading: false,
    error: null,
    total: 0,
    page: 1,
    hasMore: true
};
export const useWorkflowStore = create()(persist(immer((set, get) => ({
    ...initialState,
    fetchWorkflows: async (params) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.getWorkflows(params);
            if (response.success && response.data) {
                set((state) => {
                    state.workflows = response.data.items;
                    state.total = response.data.total;
                    state.page = response.data.page;
                    state.hasMore = response.data.hasMore;
                    state.isLoading = false;
                });
            }
            else {
                set((state) => {
                    state.error = response.error?.message || 'Failed to fetch workflows';
                    state.isLoading = false;
                });
            }
        }
        catch (error) {
            set((state) => {
                state.error = error instanceof Error ? error.message : 'Failed to fetch workflows';
                state.isLoading = false;
            });
        }
    },
    fetchWorkflow: async (id) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.getWorkflow(id);
            if (response.success && response.data) {
                set((state) => {
                    state.currentWorkflow = response.data;
                    state.isLoading = false;
                });
            }
            else {
                set((state) => {
                    state.error = response.error?.message || 'Failed to fetch workflow';
                    state.isLoading = false;
                });
            }
        }
        catch (error) {
            set((state) => {
                state.error = error instanceof Error ? error.message : 'Failed to fetch workflow';
                state.isLoading = false;
            });
        }
    },
    createWorkflow: async (data) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.createWorkflow(data);
            if (response.success && response.data) {
                set((state) => {
                    state.workflows.unshift(response.data);
                    state.currentWorkflow = response.data;
                    state.isLoading = false;
                });
                return { success: true };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to create workflow';
                set((state) => {
                    state.error = errorMessage;
                    state.isLoading = false;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create workflow';
            set((state) => {
                state.error = errorMessage;
                state.isLoading = false;
            });
            return { success: false, error: errorMessage };
        }
    },
    updateWorkflow: async (id, data) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.updateWorkflow(id, data);
            if (response.success && response.data) {
                set((state) => {
                    const index = state.workflows.findIndex(w => w.id === id);
                    if (index !== -1) {
                        state.workflows[index] = response.data;
                    }
                    if (state.currentWorkflow?.id === id) {
                        state.currentWorkflow = response.data;
                    }
                    state.isLoading = false;
                });
                return { success: true };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to update workflow';
                set((state) => {
                    state.error = errorMessage;
                    state.isLoading = false;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update workflow';
            set((state) => {
                state.error = errorMessage;
                state.isLoading = false;
            });
            return { success: false, error: errorMessage };
        }
    },
    deleteWorkflow: async (id) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.deleteWorkflow(id);
            if (response.success) {
                set((state) => {
                    state.workflows = state.workflows.filter(w => w.id !== id);
                    if (state.currentWorkflow?.id === id) {
                        state.currentWorkflow = null;
                    }
                    state.isLoading = false;
                });
                return { success: true };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to delete workflow';
                set((state) => {
                    state.error = errorMessage;
                    state.isLoading = false;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to delete workflow';
            set((state) => {
                state.error = errorMessage;
                state.isLoading = false;
            });
            return { success: false, error: errorMessage };
        }
    },
    duplicateWorkflow: async (id, name) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.duplicateWorkflow(id, name);
            if (response.success && response.data) {
                set((state) => {
                    state.workflows.unshift(response.data);
                    state.currentWorkflow = response.data;
                    state.isLoading = false;
                });
                return { success: true };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to duplicate workflow';
                set((state) => {
                    state.error = errorMessage;
                    state.isLoading = false;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to duplicate workflow';
            set((state) => {
                state.error = errorMessage;
                state.isLoading = false;
            });
            return { success: false, error: errorMessage };
        }
    },
    executeWorkflow: async (id, input) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.executeWorkflow(id, input);
            if (response.success && response.data) {
                set((state) => {
                    state.isLoading = false;
                });
                return { success: true, executionId: response.data.executionId };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to execute workflow';
                set((state) => {
                    state.error = errorMessage;
                    state.isLoading = false;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to execute workflow';
            set((state) => {
                state.error = errorMessage;
                state.isLoading = false;
            });
            return { success: false, error: errorMessage };
        }
    },
    fetchExecutions: async (params) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.getExecutions(params);
            if (response.success && response.data) {
                set((state) => {
                    state.executions = response.data.items;
                    state.isLoading = false;
                });
            }
            else {
                set((state) => {
                    state.error = response.error?.message || 'Failed to fetch executions';
                    state.isLoading = false;
                });
            }
        }
        catch (error) {
            set((state) => {
                state.error = error instanceof Error ? error.message : 'Failed to fetch executions';
                state.isLoading = false;
            });
        }
    },
    fetchExecution: async (id) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.getExecution(id);
            if (response.success && response.data) {
                set((state) => {
                    state.currentExecution = response.data;
                    state.isLoading = false;
                });
            }
            else {
                set((state) => {
                    state.error = response.error?.message || 'Failed to fetch execution';
                    state.isLoading = false;
                });
            }
        }
        catch (error) {
            set((state) => {
                state.error = error instanceof Error ? error.message : 'Failed to fetch execution';
                state.isLoading = false;
            });
        }
    },
    cancelExecution: async (id) => {
        try {
            const apiClient = getApiClient();
            const response = await apiClient.cancelExecution(id);
            if (response.success) {
                // Refresh the execution to get updated status
                await get().fetchExecution(id);
                return { success: true };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to cancel execution';
                set((state) => {
                    state.error = errorMessage;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to cancel execution';
            set((state) => {
                state.error = errorMessage;
            });
            return { success: false, error: errorMessage };
        }
    },
    retryExecution: async (id) => {
        try {
            const apiClient = getApiClient();
            const response = await apiClient.retryExecution(id);
            if (response.success && response.data) {
                return { success: true, executionId: response.data.executionId };
            }
            else {
                const errorMessage = response.error?.message || 'Failed to retry execution';
                set((state) => {
                    state.error = errorMessage;
                });
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to retry execution';
            set((state) => {
                state.error = errorMessage;
            });
            return { success: false, error: errorMessage };
        }
    },
    setCurrentWorkflow: (workflow) => {
        set((state) => {
            state.currentWorkflow = workflow;
        });
    },
    setCurrentExecution: (execution) => {
        set((state) => {
            state.currentExecution = execution;
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
})), {
    name: 'urnlabs-workflows',
    partialize: (state) => ({
        workflows: state.workflows,
        currentWorkflow: state.currentWorkflow,
        page: state.page,
        total: state.total
    })
}));
// Selectors
export const useWorkflows = () => useWorkflowStore((state) => state.workflows);
export const useCurrentWorkflow = () => useWorkflowStore((state) => state.currentWorkflow);
export const useExecutions = () => useWorkflowStore((state) => state.executions);
export const useCurrentExecution = () => useWorkflowStore((state) => state.currentExecution);
export const useWorkflowLoading = () => useWorkflowStore((state) => state.isLoading);
export const useWorkflowError = () => useWorkflowStore((state) => state.error);
//# sourceMappingURL=workflows.js.map