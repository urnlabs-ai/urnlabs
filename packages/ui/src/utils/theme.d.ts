/**
 * Theme utilities for managing dark/light mode and theme switching
 */
export type Theme = 'light' | 'dark' | 'system';
export declare function getSystemTheme(): 'light' | 'dark';
export declare function applyTheme(theme: Theme): void;
export declare function getStoredTheme(): Theme;
export declare function setStoredTheme(theme: Theme): void;
export declare function useTheme(): {
    theme: Theme;
    setTheme: import("react").Dispatch<import("react").SetStateAction<Theme>>;
    toggleTheme: () => void;
    mounted: boolean;
    isDark: boolean;
    isLight: boolean;
};
//# sourceMappingURL=theme.d.ts.map