import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const responsiveVariants: (props?: ({
    show?: "sm" | "lg" | "xl" | "2xl" | "md" | "xs" | "xs-up" | "sm-up" | "md-up" | "lg-up" | "xl-up" | "2xl-up" | "xs-down" | "sm-down" | "md-down" | "lg-down" | "xl-down" | null | undefined;
    hide?: "sm" | "lg" | "xl" | "2xl" | "md" | "xs" | "xs-up" | "sm-up" | "md-up" | "lg-up" | "xl-up" | "2xl-up" | "xs-down" | "sm-down" | "md-down" | "lg-down" | "xl-down" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
export interface ResponsiveProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof responsiveVariants> {
    show?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "xs-up" | "sm-up" | "md-up" | "lg-up" | "xl-up" | "2xl-up" | "xs-down" | "sm-down" | "md-down" | "lg-down" | "xl-down";
    hide?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "xs-up" | "sm-up" | "md-up" | "lg-up" | "xl-up" | "2xl-up" | "xs-down" | "sm-down" | "md-down" | "lg-down" | "xl-down";
    as?: React.ElementType;
}
declare const Responsive: React.ForwardRefExoticComponent<ResponsiveProps & React.RefAttributes<HTMLDivElement>>;
declare const MobileOnly: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
} & React.RefAttributes<HTMLDivElement>>;
declare const TabletOnly: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
} & React.RefAttributes<HTMLDivElement>>;
declare const DesktopOnly: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
} & React.RefAttributes<HTMLDivElement>>;
declare const MobileUp: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
} & React.RefAttributes<HTMLDivElement>>;
declare const TabletUp: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
} & React.RefAttributes<HTMLDivElement>>;
declare const DesktopUp: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
} & React.RefAttributes<HTMLDivElement>>;
export interface ResponsiveSpacingProps extends React.HTMLAttributes<HTMLDivElement> {
    mobile?: "xs" | "sm" | "md" | "lg" | "xl";
    tablet?: "xs" | "sm" | "md" | "lg" | "xl";
    desktop?: "xs" | "sm" | "md" | "lg" | "xl";
    direction?: "horizontal" | "vertical" | "all";
}
declare const ResponsiveSpacing: React.ForwardRefExoticComponent<ResponsiveSpacingProps & React.RefAttributes<HTMLDivElement>>;
export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
    mobile?: 1 | 2 | 3 | 4;
    tablet?: 1 | 2 | 3 | 4 | 6;
    desktop?: 1 | 2 | 3 | 4 | 6 | 8 | 12;
    gap?: "xs" | "sm" | "md" | "lg" | "xl";
}
declare const ResponsiveGrid: React.ForwardRefExoticComponent<ResponsiveGridProps & React.RefAttributes<HTMLDivElement>>;
export declare const useResponsiveValue: <T>(values: {
    mobile: T;
    tablet?: T;
    desktop?: T;
}) => T;
export declare const useMediaQuery: (query: string) => boolean;
export declare const useIsMobile: () => boolean;
export declare const useIsTablet: () => boolean;
export declare const useIsDesktop: () => boolean;
export declare const useIsTabletUp: () => boolean;
export declare const useIsDesktopUp: () => boolean;
export { Responsive, MobileOnly, TabletOnly, DesktopOnly, MobileUp, TabletUp, DesktopUp, ResponsiveSpacing, ResponsiveGrid, responsiveVariants, };
//# sourceMappingURL=responsive.d.ts.map