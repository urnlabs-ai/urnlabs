import React from 'react';
interface ProtectedRouteProps {
    children: React.ReactNode;
    fallback?: React.ComponentType;
}
export declare const ProtectedRoute: React.FC<ProtectedRouteProps>;
export declare const useAuth: () => {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        avatar?: string;
    } | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{
        success: boolean;
        user: {
            id: string;
            name: string;
            email: string;
            role: string;
            avatar: undefined;
        };
        error?: never;
    } | {
        success: boolean;
        error: string;
        user?: never;
    }>;
    logout: () => Promise<{
        success: boolean;
        error?: never;
    } | {
        success: boolean;
        error: string;
    }>;
    refreshToken: () => Promise<{
        success: boolean;
        token: string;
        error?: never;
    } | {
        success: boolean;
        error: string;
        token?: never;
    }>;
};
export {};
//# sourceMappingURL=ProtectedRoute.d.ts.map