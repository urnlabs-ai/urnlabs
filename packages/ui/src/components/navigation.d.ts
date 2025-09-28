import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const navigationVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    variant?: "default" | "pills" | "tabs" | "breadcrumb" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
export interface NavigationItem {
    label: string;
    href?: string;
    icon?: React.ReactNode;
    badge?: string | number;
    active?: boolean;
    disabled?: boolean;
    external?: boolean;
    children?: NavigationItem[];
    onClick?: () => void;
}
export interface NavigationProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof navigationVariants> {
    items: NavigationItem[];
    onItemClick?: (item: NavigationItem) => void;
}
declare const Navigation: React.ForwardRefExoticComponent<NavigationProps & React.RefAttributes<HTMLElement>>;
export interface BreadcrumbNavigationProps {
    items: NavigationItem[];
    separator?: React.ReactNode;
    className?: string;
}
declare const BreadcrumbNavigation: React.ForwardRefExoticComponent<BreadcrumbNavigationProps & React.RefAttributes<HTMLElement>>;
export interface TabNavigationProps extends NavigationProps {
    value?: string;
    onValueChange?: (value: string) => void;
}
declare const TabNavigation: React.ForwardRefExoticComponent<TabNavigationProps & React.RefAttributes<HTMLElement>>;
export interface SidebarNavigationProps extends NavigationProps {
    collapsible?: boolean;
    defaultExpanded?: string[];
}
declare const SidebarNavigation: React.ForwardRefExoticComponent<SidebarNavigationProps & React.RefAttributes<HTMLElement>>;
declare const TopNavigation: React.ForwardRefExoticComponent<NavigationProps & React.RefAttributes<HTMLElement>>;
declare const PillNavigation: React.ForwardRefExoticComponent<NavigationProps & React.RefAttributes<HTMLElement>>;
export { Navigation, BreadcrumbNavigation, TabNavigation, SidebarNavigation, TopNavigation, PillNavigation, navigationVariants, };
//# sourceMappingURL=navigation.d.ts.map