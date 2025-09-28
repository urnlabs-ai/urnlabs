export * from './stores/auth';
export * from './stores/workflows';
export * from './stores/agents';
export * from './stores/realtime';
export * from './stores/analytics';
export { create } from 'zustand';
export { immer } from 'zustand/middleware/immer';
export { persist } from 'zustand/middleware';
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
export declare const createLoadingState: () => {
    isLoading: boolean;
    error: null;
};
export declare const createPaginatedState: () => {
    page: number;
    total: number;
    hasMore: boolean;
};
export declare const createCachedState: (expiryMinutes?: number) => {
    lastUpdated: Record<string, string>;
    cacheExpiry: number;
};
export declare const handleApiError: (error: any) => string;
export declare const isCacheValid: (lastUpdated: string, expiryMinutes: number) => boolean;
export declare const getCacheAge: (lastUpdated: string) => number;
export declare const createResetAction: <T extends Record<string, any>>(initialState: T) => (set: any) => any;
export declare const createAsyncAction: <TParams extends any[], TResult>(actionName: string, asyncFn: (...params: TParams) => Promise<TResult>) => (set: any, get: any, ...params: TParams) => Promise<{
    success: boolean;
    data?: TResult;
    error?: string;
}>;
export declare const VERSION = "1.0.0";
//# sourceMappingURL=index.d.ts.map