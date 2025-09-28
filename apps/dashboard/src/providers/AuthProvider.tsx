import React from 'react'

interface User {
  id: string
  name: string
  email: string
  role: string
  avatar?: string
  permissions?: string[]
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<{ success: boolean; error?: string }>
  refreshToken: () => Promise<{ success: boolean; error?: string }>
  updateUser: (updates: Partial<User>) => void
}

const AuthContext = React.createContext<AuthContextType | null>(null)

export const useAuth = () => {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)

  // Initialize authentication state
  React.useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('authToken')
        const userData = localStorage.getItem('userData')

        if (token && userData) {
          const parsedUser = JSON.parse(userData)

          // Validate token with server (mock validation)
          const isValid = await validateToken(token)

          if (isValid) {
            setUser(parsedUser)
            setIsAuthenticated(true)
          } else {
            // Token is invalid, clear storage
            clearAuthData()
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error)
        clearAuthData()
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  // Mock token validation - replace with actual API call
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 200))

      // For demo purposes, consider token valid if it exists and isn't expired
      const tokenData = parseJWT(token)
      if (!tokenData) return false

      const currentTime = Date.now() / 1000
      return tokenData.exp > currentTime
    } catch (error) {
      console.error('Token validation failed:', error)
      return false
    }
  }

  // Helper function to parse JWT (for demo purposes)
  const parseJWT = (token: string) => {
    try {
      // For a real JWT, you'd decode the payload
      // This is just a mock implementation
      return {
        exp: Date.now() / 1000 + 3600 // Expires in 1 hour
      }
    } catch (error) {
      return null
    }
  }

  const clearAuthData = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('userData')
    localStorage.removeItem('sessionValid')
    setUser(null)
    setIsAuthenticated(false)
  }

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true)

      // Mock API call - replace with actual authentication
      const response = await mockLogin(email, password)

      if (response.success) {
        const { user, token } = response.data

        // Store auth data
        localStorage.setItem('authToken', token)
        localStorage.setItem('userData', JSON.stringify(user))
        localStorage.setItem('sessionValid', 'true')

        setUser(user)
        setIsAuthenticated(true)

        return { success: true }
      } else {
        return { success: false, error: response.error }
      }
    } catch (error) {
      console.error('Login failed:', error)
      return { success: false, error: 'Login failed. Please try again.' }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      setIsLoading(true)

      // Call logout API to invalidate token on server
      await mockLogout()

      // Clear local storage and state
      clearAuthData()

      return { success: true }
    } catch (error) {
      console.error('Logout failed:', error)
      // Even if API call fails, clear local data
      clearAuthData()
      return { success: false, error: 'Logout failed, but local session cleared.' }
    } finally {
      setIsLoading(false)
    }
  }

  const refreshToken = async () => {
    try {
      const currentToken = localStorage.getItem('authToken')
      if (!currentToken) {
        throw new Error('No token to refresh')
      }

      // Mock token refresh - replace with actual API call
      const response = await mockRefreshToken(currentToken)

      if (response.success) {
        localStorage.setItem('authToken', response.token)
        return { success: true }
      } else {
        // Refresh failed, force logout
        await logout()
        return { success: false, error: 'Session expired. Please log in again.' }
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
      await logout()
      return { success: false, error: 'Session expired. Please log in again.' }
    }
  }

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates }
      setUser(updatedUser)
      localStorage.setItem('userData', JSON.stringify(updatedUser))
    }
  }

  // Mock API functions - replace with actual API calls
  const mockLogin = async (email: string, password: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Mock validation
    if (email === 'admin@urnlabs.ai' && password === 'password') {
      return {
        success: true,
        data: {
          user: {
            id: '1',
            name: 'John Doe',
            email: email,
            role: 'Administrator',
            permissions: ['read', 'write', 'admin'],
          },
          token: 'mock-jwt-token-' + Date.now(),
        }
      }
    } else {
      return {
        success: false,
        error: 'Invalid email or password'
      }
    }
  }

  const mockLogout = async () => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))
    return { success: true }
  }

  const mockRefreshToken = async (token: string) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))

    // Mock success (in real app, validate current token)
    return {
      success: true,
      token: 'refreshed-jwt-token-' + Date.now()
    }
  }

  // Auto-refresh token before expiration
  React.useEffect(() => {
    if (!isAuthenticated) return

    const interval = setInterval(() => {
      refreshToken()
    }, 30 * 60 * 1000) // Refresh every 30 minutes

    return () => clearInterval(interval)
  }, [isAuthenticated])

  const contextValue: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshToken,
    updateUser,
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}