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

// Common state patterns and utilities
export interface BaseState {
  isLoading: boolean;
  error: string | null;
}

export interface PaginatedState {
  page: number;
  total: number;
  hasMore: boolean;
}

export interface CachedState {
  lastUpdated: Record<string, string>;
  cacheExpiry: number;
}

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
  lastUpdated: {} as Record<string, string>,
  cacheExpiry: expiryMinutes
});

// Error handling utilities
export const handleApiError = (error: any): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    return error.response?.data?.error?.message || error.response?.data?.message || 'An API error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};

// Cache utilities
export const isCacheValid = (lastUpdated: string, expiryMinutes: number): boolean => {
  if (!lastUpdated) return false;
  const cacheAge = Date.now() - new Date(lastUpdated).getTime();
  return cacheAge < expiryMinutes * 60 * 1000;
};

export const getCacheAge = (lastUpdated: string): number => {
  if (!lastUpdated) return Infinity;
  return Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000 / 60); // age in minutes
};

// State reset utilities
export const createResetAction = <T extends Record<string, any>>(initialState: T) =>
  (set: any) => set((state: T) => Object.assign(state, initialState));

// Common action patterns
export const createAsyncAction = <TParams extends any[], TResult>(
  actionName: string,
  asyncFn: (...params: TParams) => Promise<TResult>
) => {
  return async (set: any, get: any, ...params: TParams): Promise<{ success: boolean; data?: TResult; error?: string }> => {
    set((state: any) => {
      state.isLoading = true;
      state.error = null;
    });

    try {
      const result = await asyncFn(...params);
      set((state: any) => {
        state.isLoading = false;
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = handleApiError(error);
      set((state: any) => {
        state.error = errorMessage;
        state.isLoading = false;
      });
      return { success: false, error: errorMessage };
    }
  };
};

// Version info
export const VERSION = '1.0.0';