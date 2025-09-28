import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const layoutVariants: (props?: ({
    variant?: "default" | "centered" | "fullscreen" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
export interface LayoutProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof layoutVariants> {
    sidebar?: React.ReactNode;
    header?: React.ReactNode;
    footer?: React.ReactNode;
    sidebarCollapsed?: boolean;
    onSidebarCollapsedChange?: (collapsed: boolean) => void;
}
declare const Layout: React.ForwardRefExoticComponent<LayoutProps & React.RefAttributes<HTMLDivElement>>;
export interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    sidebar?: React.ReactNode;
    header?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
    actions?: React.ReactNode;
    loading?: boolean;
}
declare const DashboardLayout: React.ForwardRefExoticComponent<DashboardLayoutProps & React.RefAttributes<HTMLDivElement>>;
export interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    description?: string;
    actions?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
    sidebar?: React.ReactNode;
    maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
    spacing?: "none" | "sm" | "default" | "lg";
}
declare const PageLayout: React.ForwardRefExoticComponent<PageLayoutProps & React.RefAttributes<HTMLDivElement>>;
export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
    padding?: "none" | "sm" | "default" | "lg";
    center?: boolean;
}
declare const Container: React.ForwardRefExoticComponent<ContainerProps & React.RefAttributes<HTMLDivElement>>;
export interface GridLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
    gap?: "none" | "sm" | "default" | "lg";
    responsive?: boolean;
}
declare const GridLayout: React.ForwardRefExoticComponent<GridLayoutProps & React.RefAttributes<HTMLDivElement>>;
export interface StackLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    direction?: "row" | "column";
    spacing?: "none" | "xs" | "sm" | "default" | "lg" | "xl";
    align?: "start" | "center" | "end" | "stretch";
    justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
    wrap?: boolean;
}
declare const StackLayout: React.ForwardRefExoticComponent<StackLayoutProps & React.RefAttributes<HTMLDivElement>>;
export { Layout, DashboardLayout, PageLayout, Container, GridLayout, StackLayout, layoutVariants, };
//# sourceMappingURL=layout.d.ts.map