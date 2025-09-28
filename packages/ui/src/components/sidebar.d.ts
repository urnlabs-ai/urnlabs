import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const sidebarVariants: (props?: ({
    variant?: "default" | "ghost" | "floating" | null | undefined;
    size?: "default" | "sm" | "lg" | "xl" | null | undefined;
    collapsed?: boolean | null | undefined;
    position?: "left" | "right" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const useSidebar: () => {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    variant: "default" | "ghost" | "floating";
    mobile: boolean;
    setMobile: (mobile: boolean) => void;
};
export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof sidebarVariants> {
    defaultCollapsed?: boolean;
    collapsible?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
}
declare const Sidebar: React.ForwardRefExoticComponent<SidebarProps & React.RefAttributes<HTMLDivElement>>;
declare const SidebarHeader: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    sticky?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
declare const SidebarContent: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const SidebarFooter: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    sticky?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
declare const SidebarNav: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const SidebarNavItem: React.ForwardRefExoticComponent<React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    active?: boolean;
    icon?: React.ReactNode;
    badge?: string | number;
    disabled?: boolean;
} & React.RefAttributes<HTMLAnchorElement>>;
declare const SidebarNavGroup: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    title?: string;
} & React.RefAttributes<HTMLDivElement>>;
declare const SidebarToggle: React.ForwardRefExoticComponent<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "ghost" | "outline";
    size?: "sm" | "default" | "lg";
} & React.RefAttributes<HTMLButtonElement>>;
export { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarNav, SidebarNavItem, SidebarNavGroup, SidebarToggle, useSidebar, sidebarVariants, };
//# sourceMappingURL=sidebar.d.ts.map