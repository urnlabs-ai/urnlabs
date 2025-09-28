import React from 'react';
interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    permissions?: string[];
}
interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    logout: () => Promise<{
        success: boolean;
        error?: string;
    }>;
    refreshToken: () => Promise<{
        success: boolean;
        error?: string;
    }>;
    updateUser: (updates: Partial<User>) => void;
}
export declare const useAuth: () => AuthContextType;
interface AuthProviderProps {
    children: React.ReactNode;
}
export declare const AuthProvider: React.FC<AuthProviderProps>;
export {};
//# sourceMappingURL=AuthProvider.d.ts.map