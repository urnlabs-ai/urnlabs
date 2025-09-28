import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const spinnerVariants: (props?: ({
    size?: "default" | "sm" | "lg" | "xl" | null | undefined;
    color?: "default" | "secondary" | "muted" | "primary" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
export interface SpinnerProps extends React.SVGAttributes<SVGElement>, VariantProps<typeof spinnerVariants> {
}
declare const Spinner: React.ForwardRefExoticComponent<SpinnerProps & React.RefAttributes<SVGSVGElement>>;
export interface LoadingButtonProps extends React.HTMLAttributes<HTMLDivElement> {
    loading?: boolean;
    children: React.ReactNode;
    spinnerSize?: VariantProps<typeof spinnerVariants>["size"];
}
declare const LoadingButton: React.ForwardRefExoticComponent<LoadingButtonProps & React.RefAttributes<HTMLDivElement>>;
export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
    loading?: boolean;
    children: React.ReactNode;
    overlay?: boolean;
    spinnerSize?: VariantProps<typeof spinnerVariants>["size"];
}
declare const LoadingOverlay: React.ForwardRefExoticComponent<LoadingOverlayProps & React.RefAttributes<HTMLDivElement>>;
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "text" | "circular" | "rectangular";
    animation?: "pulse" | "wave" | "none";
}
declare const Skeleton: React.ForwardRefExoticComponent<SkeletonProps & React.RefAttributes<HTMLDivElement>>;
export interface LoadingCardProps extends React.HTMLAttributes<HTMLDivElement> {
    lines?: number;
    showAvatar?: boolean;
}
declare const LoadingCard: React.ForwardRefExoticComponent<LoadingCardProps & React.RefAttributes<HTMLDivElement>>;
export interface DotsLoadingProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "default" | "lg";
    color?: string;
}
declare const DotsLoading: React.ForwardRefExoticComponent<DotsLoadingProps & React.RefAttributes<HTMLDivElement>>;
export { Spinner, LoadingButton, LoadingOverlay, Skeleton, LoadingCard, DotsLoading, spinnerVariants, };
//# sourceMappingURL=loading.d.ts.map