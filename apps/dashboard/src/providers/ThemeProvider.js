import React from 'react';
const ThemeContext = React.createContext(null);
export const useTheme = () => {
    const context = React.useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
export const ThemeProvider = ({ children, defaultTheme = 'system', storageKey = 'urnlabs-ui-theme', }) => {
    const [theme, setThemeState] = React.useState(() => {
        // Try to get theme from localStorage first
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(storageKey);
            if (stored && ['light', 'dark', 'system'].includes(stored)) {
                return stored;
            }
        }
        return defaultTheme;
    });
    const [systemTheme, setSystemTheme] = React.useState('light');
    // Detect system theme preference
    React.useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => {
            setSystemTheme(e.matches ? 'dark' : 'light');
        };
        // Set initial value
        setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
        // Listen for changes
        mediaQuery.addEventListener('change', handleChange);
        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, []);
    // Calculate the actual theme to apply
    const actualTheme = React.useMemo(() => {
        if (theme === 'system') {
            return systemTheme;
        }
        return theme;
    }, [theme, systemTheme]);
    // Apply theme to document
    React.useEffect(() => {
        const root = window.document.documentElement;
        // Remove previous theme classes
        root.classList.remove('light', 'dark');
        // Add current theme class
        root.classList.add(actualTheme);
        // Update CSS custom properties for better integration
        if (actualTheme === 'dark') {
            root.style.colorScheme = 'dark';
        }
        else {
            root.style.colorScheme = 'light';
        }
        // Store preference in localStorage
        localStorage.setItem(storageKey, theme);
    }, [actualTheme, theme, storageKey]);
    // Handle theme changes
    const setTheme = React.useCallback((newTheme) => {
        setThemeState(newTheme);
    }, []);
    // Listen for storage changes (for syncing across tabs)
    React.useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === storageKey && e.newValue) {
                const newTheme = e.newValue;
                if (['light', 'dark', 'system'].includes(newTheme)) {
                    setThemeState(newTheme);
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [storageKey]);
    const contextValue = {
        theme,
        setTheme,
        actualTheme,
    };
    return (<ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>);
};
// Hook for getting theme-aware styles
export const useThemeStyles = () => {
    const { actualTheme } = useTheme();
    const getThemeClass = (lightClass, darkClass) => {
        return actualTheme === 'dark' ? darkClass : lightClass;
    };
    const getThemeValue = (lightValue, darkValue) => {
        return actualTheme === 'dark' ? darkValue : lightValue;
    };
    return {
        actualTheme,
        getThemeClass,
        getThemeValue,
        isDark: actualTheme === 'dark',
        isLight: actualTheme === 'light',
    };
};
export const ThemeAware = ({ light, dark, children, }) => {
    const { actualTheme } = useTheme();
    if (children) {
        return <>{children(actualTheme)}</>;
    }
    return <>{actualTheme === 'dark' ? dark : light}</>;
};
export const ThemeToggle = ({ className = '', size = 'md', }) => {
    const { theme, setTheme, actualTheme } = useTheme();
    const sizeClasses = {
        sm: 'h-8 w-8',
        md: 'h-9 w-9',
        lg: 'h-10 w-10',
    };
    const iconSizes = {
        sm: 'h-4 w-4',
        md: 'h-4 w-4',
        lg: 'h-5 w-5',
    };
    const cycleTheme = () => {
        const themes = ['light', 'dark', 'system'];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex]);
    };
    const getIcon = () => {
        if (theme === 'system') {
            return actualTheme === 'dark' ? '🌙' : '☀️';
        }
        return theme === 'dark' ? '🌙' : '☀️';
    };
    const getLabel = () => {
        switch (theme) {
            case 'light':
                return 'Switch to dark mode';
            case 'dark':
                return 'Switch to system mode';
            case 'system':
                return 'Switch to light mode';
            default:
                return 'Toggle theme';
        }
    };
    return (<button onClick={cycleTheme} className={`
        inline-flex items-center justify-center rounded-md border border-input
        bg-background hover:bg-accent hover:text-accent-foreground
        transition-colors focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-ring focus-visible:ring-offset-2
        disabled:pointer-events-none disabled:opacity-50
        ${sizeClasses[size]} ${className}
      `} title={getLabel()} aria-label={getLabel()}>
      <span className={iconSizes[size]} role="img" aria-hidden="true">
        {getIcon()}
      </span>
    </button>);
};
//# sourceMappingURL=ThemeProvider.js.map