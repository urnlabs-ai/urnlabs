/**
 * Theme utilities for managing dark/light mode and theme switching
 */
export function getSystemTheme() {
    if (typeof window === 'undefined')
        return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(theme) {
    const root = document.documentElement;
    const systemTheme = getSystemTheme();
    // Remove existing theme classes
    root.classList.remove('light', 'dark');
    // Apply new theme
    if (theme === 'system') {
        root.classList.add(systemTheme);
    }
    else {
        root.classList.add(theme);
    }
}
export function getStoredTheme() {
    if (typeof window === 'undefined')
        return 'system';
    return localStorage.getItem('theme') || 'system';
}
export function setStoredTheme(theme) {
    if (typeof window === 'undefined')
        return;
    localStorage.setItem('theme', theme);
}
/**
 * React hook for theme management
 */
import { useState, useEffect } from 'react';
export function useTheme() {
    const [theme, setTheme] = useState('system');
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setTheme(getStoredTheme());
        setMounted(true);
    }, []);
    useEffect(() => {
        if (mounted) {
            applyTheme(theme);
            setStoredTheme(theme);
        }
    }, [theme, mounted]);
    // Listen for system theme changes
    useEffect(() => {
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme]);
    const toggleTheme = () => {
        setTheme(prev => {
            switch (prev) {
                case 'light': return 'dark';
                case 'dark': return 'system';
                case 'system': return 'light';
                default: return 'light';
            }
        });
    };
    return {
        theme,
        setTheme,
        toggleTheme,
        mounted,
        isDark: theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark'),
        isLight: theme === 'light' || (theme === 'system' && getSystemTheme() === 'light'),
    };
}
//# sourceMappingURL=theme.js.map