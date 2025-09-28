import { User, Organization, AuthTokens, LoginCredentials, RegisterData } from '@urnlabs/api-client';
interface AuthState {
    user: User | null;
    organization: Organization | null;
    tokens: AuthTokens | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: (credentials: LoginCredentials) => Promise<{
        success: boolean;
        error?: string;
    }>;
    register: (data: RegisterData) => Promise<{
        success: boolean;
        error?: string;
    }>;
    logout: () => Promise<void>;
    refreshTokens: () => Promise<boolean>;
    updateUser: (data: Partial<User>) => Promise<{
        success: boolean;
        error?: string;
    }>;
    updateOrganization: (data: Partial<Organization>) => Promise<{
        success: boolean;
        error?: string;
    }>;
    clearError: () => void;
    initialize: () => Promise<void>;
}
export declare const useAuthStore: import("zustand").UseBoundStore<Omit<Omit<import("zustand").StoreApi<AuthState>, "persist"> & {
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<AuthState, {
            user: {
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                email: string;
                role: "user" | "admin" | "viewer";
                isActive: boolean;
                avatar?: string | undefined;
                lastLoginAt?: string | undefined;
            } | null;
            organization: {
                id: string;
                name: string;
                createdAt: string;
                updatedAt: string;
                isActive: boolean;
                settings: {
                    timezone: string;
                    dateFormat: string;
                    currency: string;
                };
                plan: "enterprise" | "starter" | "professional";
                limits: {
                    users: number;
                    workflows: number;
                    executions: number;
                };
            } | null;
            tokens: AuthTokens | null;
            isAuthenticated: boolean;
        }>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: AuthState) => void) => () => void;
        onFinishHydration: (fn: (state: AuthState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<AuthState, {
            user: {
                id: string;
                name: string;
                organizationId: string;
                createdAt: string;
                updatedAt: string;
                email: string;
                role: "user" | "admin" | "viewer";
                isActive: boolean;
                avatar?: string | undefined;
                lastLoginAt?: string | undefined;
            } | null;
            organization: {
                id: string;
                name: string;
                createdAt: string;
                updatedAt: string;
                isActive: boolean;
                settings: {
                    timezone: string;
                    dateFormat: string;
                    currency: string;
                };
                plan: "enterprise" | "starter" | "professional";
                limits: {
                    users: number;
                    workflows: number;
                    executions: number;
                };
            } | null;
            tokens: AuthTokens | null;
            isAuthenticated: boolean;
        }>>;
    };
}, "setState"> & {
    setState(nextStateOrUpdater: AuthState | Partial<AuthState> | ((state: import("immer").WritableDraft<AuthState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export declare const useUser: () => {
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    email: string;
    role: "user" | "admin" | "viewer";
    isActive: boolean;
    avatar?: string | undefined;
    lastLoginAt?: string | undefined;
} | null;
export declare const useOrganization: () => {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    settings: {
        timezone: string;
        dateFormat: string;
        currency: string;
    };
    plan: "enterprise" | "starter" | "professional";
    limits: {
        users: number;
        workflows: number;
        executions: number;
    };
} | null;
export declare const useIsAuthenticated: () => boolean;
export declare const useAuthLoading: () => boolean;
export declare const useAuthError: () => string | null;
export {};
//# sourceMappingURL=auth.d.ts.map