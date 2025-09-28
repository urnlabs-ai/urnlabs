import React from 'react';
type Theme = 'light' | 'dark' | 'system';
interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    actualTheme: 'light' | 'dark';
}
export declare const useTheme: () => ThemeContextType;
interface ThemeProviderProps {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}
export declare const ThemeProvider: React.FC<ThemeProviderProps>;
export declare const useThemeStyles: () => {
    actualTheme: "light" | "dark";
    getThemeClass: (lightClass: string, darkClass: string) => string;
    getThemeValue: <T>(lightValue: T, darkValue: T) => T;
    isDark: boolean;
    isLight: boolean;
};
interface ThemeAwareProps {
    light?: React.ReactNode;
    dark?: React.ReactNode;
    children?: (theme: 'light' | 'dark') => React.ReactNode;
}
export declare const ThemeAware: React.FC<ThemeAwareProps>;
interface ThemeToggleProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}
export declare const ThemeToggle: React.FC<ThemeToggleProps>;
export {};
//# sourceMappingURL=ThemeProvider.d.ts.map