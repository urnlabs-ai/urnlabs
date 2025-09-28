import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import {
  User,
  Organization,
  AuthTokens,
  LoginCredentials,
  RegisterData,
  getApiClient
} from '@urnlabs/api-client';

interface AuthState {
  // State
  user: User | null;
  organization: Organization | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  updateUser: (data: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  updateOrganization: (data: Partial<Organization>) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      user: null,
      organization: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials: LoginCredentials) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.login(credentials);

          if (response.success && response.data) {
            set((state) => {
              state.user = response.data!.user;
              state.tokens = response.data!.tokens;
              state.isAuthenticated = true;
              state.isLoading = false;
              state.error = null;
            });

            // Fetch organization data
            try {
              const orgResponse = await apiClient.getOrganization();
              if (orgResponse.success && orgResponse.data) {
                set((state) => {
                  state.organization = orgResponse.data!;
                });
              }
            } catch (error) {
              // Non-critical error, continue
              console.warn('Failed to fetch organization:', error);
            }

            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Login failed';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      register: async (data: RegisterData) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.register(data);

          if (response.success && response.data) {
            set((state) => {
              state.user = response.data!.user;
              state.tokens = response.data!.tokens;
              state.isAuthenticated = true;
              state.isLoading = false;
              state.error = null;
            });

            // Fetch organization data
            try {
              const orgResponse = await apiClient.getOrganization();
              if (orgResponse.success && orgResponse.data) {
                set((state) => {
                  state.organization = orgResponse.data!;
                });
              }
            } catch (error) {
              // Non-critical error, continue
              console.warn('Failed to fetch organization:', error);
            }

            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Registration failed';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Registration failed';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      logout: async () => {
        try {
          const apiClient = getApiClient();
          await apiClient.logout();
        } catch (error) {
          // Logout from server failed, but we'll still clear local state
          console.warn('Server logout failed:', error);
        }

        set((state) => {
          state.user = null;
          state.organization = null;
          state.tokens = null;
          state.isAuthenticated = false;
          state.error = null;
        });
      },

      refreshTokens: async () => {
        try {
          const apiClient = getApiClient();
          const newTokens = await apiClient.refreshAuthTokens();

          if (newTokens) {
            set((state) => {
              state.tokens = newTokens;
              state.isAuthenticated = true;
            });
            return true;
          } else {
            // Refresh failed, clear auth state
            set((state) => {
              state.user = null;
              state.organization = null;
              state.tokens = null;
              state.isAuthenticated = false;
            });
            return false;
          }
        } catch (error) {
          set((state) => {
            state.user = null;
            state.organization = null;
            state.tokens = null;
            state.isAuthenticated = false;
          });
          return false;
        }
      },

      updateUser: async (data: Partial<User>) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.updateCurrentUser(data);

          if (response.success && response.data) {
            set((state) => {
              state.user = response.data!;
              state.isLoading = false;
            });
            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Update failed';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      updateOrganization: async (data: Partial<Organization>) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const apiClient = getApiClient();
          const response = await apiClient.updateOrganization(data);

          if (response.success && response.data) {
            set((state) => {
              state.organization = response.data!;
              state.isLoading = false;
            });
            return { success: true };
          } else {
            const errorMessage = response.error?.message || 'Update failed';
            set((state) => {
              state.error = errorMessage;
              state.isLoading = false;
            });
            return { success: false, error: errorMessage };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
          });
          return { success: false, error: errorMessage };
        }
      },

      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },

      initialize: async () => {
        const apiClient = getApiClient();
        const storedTokens = apiClient.getAuthTokens();

        if (storedTokens && apiClient.isAuthenticated()) {
          set((state) => {
            state.tokens = storedTokens;
            state.isAuthenticated = true;
            state.isLoading = true;
          });

          try {
            // Fetch current user
            const userResponse = await apiClient.getCurrentUser();
            if (userResponse.success && userResponse.data) {
              set((state) => {
                state.user = userResponse.data!;
              });
            }

            // Fetch organization
            const orgResponse = await apiClient.getOrganization();
            if (orgResponse.success && orgResponse.data) {
              set((state) => {
                state.organization = orgResponse.data!;
              });
            }

            set((state) => {
              state.isLoading = false;
            });
          } catch (error) {
            // If fetching user/org fails, the tokens might be invalid
            set((state) => {
              state.user = null;
              state.organization = null;
              state.tokens = null;
              state.isAuthenticated = false;
              state.isLoading = false;
            });
            apiClient.clearAuthTokens();
          }
        } else {
          set((state) => {
            state.isAuthenticated = false;
            state.isLoading = false;
          });
        }
      }
    })),
    {
      name: 'urnlabs-auth',
      partialize: (state) => ({
        user: state.user,
        organization: state.organization,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// Selectors
export const useUser = () => useAuthStore((state) => state.user);
export const useOrganization = () => useAuthStore((state) => state.organization);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);