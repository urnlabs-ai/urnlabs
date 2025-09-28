import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const headerVariants: (props?: ({
    variant?: "default" | "solid" | "transparent" | "glass" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Header: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & VariantProps<(props?: ({
    variant?: "default" | "solid" | "transparent" | "glass" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & React.RefAttributes<HTMLDivElement>>;
declare const HeaderLeft: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const HeaderCenter: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
declare const HeaderRight: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
export interface HeaderLogoProps extends React.HTMLAttributes<HTMLDivElement> {
    src?: string;
    alt?: string;
    href?: string;
    collapsed?: boolean;
}
declare const HeaderLogo: React.ForwardRefExoticComponent<HeaderLogoProps & React.RefAttributes<HTMLDivElement>>;
export interface HeaderSearchProps {
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    className?: string;
    shortcuts?: boolean;
}
declare const HeaderSearch: React.ForwardRefExoticComponent<HeaderSearchProps & React.RefAttributes<HTMLInputElement>>;
export interface HeaderNotificationsProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    count?: number;
    showBadge?: boolean;
    maxCount?: number;
}
declare const HeaderNotifications: React.ForwardRefExoticComponent<HeaderNotificationsProps & React.RefAttributes<HTMLButtonElement>>;
export interface HeaderUserMenuProps {
    user?: {
        name: string;
        email: string;
        avatar?: string;
        initials?: string;
    };
    menuItems?: Array<{
        label: string;
        icon?: React.ReactNode;
        href?: string;
        onClick?: () => void;
        separator?: boolean;
    }>;
    onSignOut?: () => void;
    className?: string;
}
declare const HeaderUserMenu: React.ForwardRefExoticComponent<HeaderUserMenuProps & React.RefAttributes<HTMLButtonElement>>;
export interface BreadcrumbItem {
    label: string;
    href?: string;
    active?: boolean;
}
export interface HeaderBreadcrumbsProps {
    items: BreadcrumbItem[];
    separator?: React.ReactNode;
    className?: string;
}
declare const HeaderBreadcrumbs: React.ForwardRefExoticComponent<HeaderBreadcrumbsProps & React.RefAttributes<HTMLDivElement>>;
export { Header, HeaderLeft, HeaderCenter, HeaderRight, HeaderLogo, HeaderSearch, HeaderNotifications, HeaderUserMenu, HeaderBreadcrumbs, headerVariants, };
//# sourceMappingURL=header.d.ts.map