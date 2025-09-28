import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
export const ProtectedRoute = ({ children, fallback: Fallback }) => {
    const location = useLocation();
    // Mock authentication check - replace with actual auth logic
    const isAuthenticated = React.useMemo(() => {
        // Check for auth token in localStorage, cookie, or context
        const token = localStorage.getItem('authToken');
        const sessionValid = localStorage.getItem('sessionValid');
        return token && sessionValid === 'true';
    }, []);
    // Loading state while checking authentication
    const [isLoading, setIsLoading] = React.useState(true);
    React.useEffect(() => {
        // Simulate auth check delay
        const checkAuth = async () => {
            try {
                // Here you would validate the token with your backend
                // For now, we'll just simulate a delay
                await new Promise(resolve => setTimeout(resolve, 100));
                setIsLoading(false);
            }
            catch (error) {
                console.error('Auth check failed:', error);
                setIsLoading(false);
            }
        };
        checkAuth();
    }, []);
    if (isLoading) {
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>);
    }
    if (!isAuthenticated) {
        // If there's a custom fallback component, render it
        if (Fallback) {
            return <Fallback />;
        }
        // Otherwise redirect to login with return path
        return (<Navigate to="/login" state={{ from: location.pathname }} replace/>);
    }
    return <>{children}</>;
};
// Hook for using auth state throughout the app
export const useAuth = () => {
    const [user, setUser] = React.useState(null);
    const [isAuthenticated, setIsAuthenticated] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    React.useEffect(() => {
        const initAuth = async () => {
            try {
                const token = localStorage.getItem('authToken');
                const userData = localStorage.getItem('userData');
                if (token && userData) {
                    setUser(JSON.parse(userData));
                    setIsAuthenticated(true);
                }
            }
            catch (error) {
                console.error('Auth initialization failed:', error);
                // Clear invalid data
                localStorage.removeItem('authToken');
                localStorage.removeItem('userData');
                localStorage.removeItem('sessionValid');
            }
            finally {
                setIsLoading(false);
            }
        };
        initAuth();
    }, []);
    const login = async (email, password) => {
        try {
            // Mock login - replace with actual API call
            const mockUser = {
                id: '1',
                name: 'John Doe',
                email: email,
                role: 'Administrator',
                avatar: undefined,
            };
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Mock successful authentication
            const token = 'mock-jwt-token-' + Date.now();
            localStorage.setItem('authToken', token);
            localStorage.setItem('userData', JSON.stringify(mockUser));
            localStorage.setItem('sessionValid', 'true');
            setUser(mockUser);
            setIsAuthenticated(true);
            return { success: true, user: mockUser };
        }
        catch (error) {
            console.error('Login failed:', error);
            return { success: false, error: 'Invalid credentials' };
        }
    };
    const logout = async () => {
        try {
            // Clear local storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            localStorage.removeItem('sessionValid');
            // Reset state
            setUser(null);
            setIsAuthenticated(false);
            // Optionally call logout API
            // await api.logout()
            return { success: true };
        }
        catch (error) {
            console.error('Logout failed:', error);
            return { success: false, error: 'Logout failed' };
        }
    };
    const refreshToken = async () => {
        try {
            // Implement token refresh logic
            const token = localStorage.getItem('authToken');
            if (!token)
                throw new Error('No token found');
            // Mock refresh - replace with actual API call
            const newToken = 'refreshed-jwt-token-' + Date.now();
            localStorage.setItem('authToken', newToken);
            return { success: true, token: newToken };
        }
        catch (error) {
            console.error('Token refresh failed:', error);
            // Force logout on refresh failure
            logout();
            return { success: false, error: 'Token refresh failed' };
        }
    };
    return {
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshToken,
    };
};
//# sourceMappingURL=ProtectedRoute.js.map