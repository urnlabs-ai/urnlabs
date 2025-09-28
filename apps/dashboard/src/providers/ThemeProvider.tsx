import React from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'dark'
}

const ThemeContext = React.createContext<ThemeContextType | null>(null)

export const useTheme = () => {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'system',
  storageKey = 'urnlabs-ui-theme',
}) => {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    // Try to get theme from localStorage first
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey) as Theme
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        return stored
      }
    }
    return defaultTheme
  })

  const [systemTheme, setSystemTheme] = React.useState<'light' | 'dark'>('light')

  // Detect system theme preference
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    // Set initial value
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light')

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  // Calculate the actual theme to apply
  const actualTheme = React.useMemo(() => {
    if (theme === 'system') {
      return systemTheme
    }
    return theme
  }, [theme, systemTheme])

  // Apply theme to document
  React.useEffect(() => {
    const root = window.document.documentElement

    // Remove previous theme classes
    root.classList.remove('light', 'dark')

    // Add current theme class
    root.classList.add(actualTheme)

    // Update CSS custom properties for better integration
    if (actualTheme === 'dark') {
      root.style.colorScheme = 'dark'
    } else {
      root.style.colorScheme = 'light'
    }

    // Store preference in localStorage
    localStorage.setItem(storageKey, theme)
  }, [actualTheme, theme, storageKey])

  // Handle theme changes
  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
  }, [])

  // Listen for storage changes (for syncing across tabs)
  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        const newTheme = e.newValue as Theme
        if (['light', 'dark', 'system'].includes(newTheme)) {
          setThemeState(newTheme)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [storageKey])

  const contextValue: ThemeContextType = {
    theme,
    setTheme,
    actualTheme,
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

// Hook for getting theme-aware styles
export const useThemeStyles = () => {
  const { actualTheme } = useTheme()

  const getThemeClass = (lightClass: string, darkClass: string) => {
    return actualTheme === 'dark' ? darkClass : lightClass
  }

  const getThemeValue = <T,>(lightValue: T, darkValue: T): T => {
    return actualTheme === 'dark' ? darkValue : lightValue
  }

  return {
    actualTheme,
    getThemeClass,
    getThemeValue,
    isDark: actualTheme === 'dark',
    isLight: actualTheme === 'light',
  }
}

// Component for theme-aware styling
interface ThemeAwareProps {
  light?: React.ReactNode
  dark?: React.ReactNode
  children?: (theme: 'light' | 'dark') => React.ReactNode
}

export const ThemeAware: React.FC<ThemeAwareProps> = ({
  light,
  dark,
  children,
}) => {
  const { actualTheme } = useTheme()

  if (children) {
    return <>{children(actualTheme)}</>
  }

  return <>{actualTheme === 'dark' ? dark : light}</>
}

// Theme toggle button component
interface ThemeToggleProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  size = 'md',
}) => {
  const { theme, setTheme, actualTheme } = useTheme()

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  }

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const getIcon = () => {
    if (theme === 'system') {
      return actualTheme === 'dark' ? '🌙' : '☀️'
    }
    return theme === 'dark' ? '🌙' : '☀️'
  }

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Switch to dark mode'
      case 'dark':
        return 'Switch to system mode'
      case 'system':
        return 'Switch to light mode'
      default:
        return 'Toggle theme'
    }
  }

  return (
    <button
      onClick={cycleTheme}
      className={`
        inline-flex items-center justify-center rounded-md border border-input
        bg-background hover:bg-accent hover:text-accent-foreground
        transition-colors focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-ring focus-visible:ring-offset-2
        disabled:pointer-events-none disabled:opacity-50
        ${sizeClasses[size]} ${className}
      `}
      title={getLabel()}
      aria-label={getLabel()}
    >
      <span className={iconSizes[size]} role="img" aria-hidden="true">
        {getIcon()}
      </span>
    </button>
  )
}