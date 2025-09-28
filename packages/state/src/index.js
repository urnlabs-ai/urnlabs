// Export all stores
export * from './stores/auth';
export * from './stores/workflows';
export * from './stores/agents';
export * from './stores/realtime';
export * from './stores/analytics';
// Export store utilities
export { create } from 'zustand';
export { immer } from 'zustand/middleware/immer';
export { persist } from 'zustand/middleware';
// State management best practices helpers
export const createLoadingState = () => ({
    isLoading: false,
    error: null
});
export const createPaginatedState = () => ({
    page: 1,
    total: 0,
    hasMore: true
});
export const createCachedState = (expiryMinutes = 15) => ({
    lastUpdated: {},
    cacheExpiry: expiryMinutes
});
// Error handling utilities
export const handleApiError = (error) => {
    if (error && typeof error === 'object' && 'response' in error) {
        return error.response?.data?.error?.message || error.response?.data?.message || 'An API error occurred';
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'An unknown error occurred';
};
// Cache utilities
export const isCacheValid = (lastUpdated, expiryMinutes) => {
    if (!lastUpdated)
        return false;
    const cacheAge = Date.now() - new Date(lastUpdated).getTime();
    return cacheAge < expiryMinutes * 60 * 1000;
};
export const getCacheAge = (lastUpdated) => {
    if (!lastUpdated)
        return Infinity;
    return Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000 / 60); // age in minutes
};
// State reset utilities
export const createResetAction = (initialState) => (set) => set((state) => Object.assign(state, initialState));
// Common action patterns
export const createAsyncAction = (actionName, asyncFn) => {
    return async (set, get, ...params) => {
        set((state) => {
            state.isLoading = true;
            state.error = null;
        });
        try {
            const result = await asyncFn(...params);
            set((state) => {
                state.isLoading = false;
            });
            return { success: true, data: result };
        }
        catch (error) {
            const errorMessage = handleApiError(error);
            set((state) => {
                state.error = errorMessage;
                state.isLoading = false;
            });
            return { success: false, error: errorMessage };
        }
    };
};
// Version info
export const VERSION = '1.0.0';
//# sourceMappingURL=index.js.map