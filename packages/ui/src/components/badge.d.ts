import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const badgeVariants: (props?: ({
    variant?: "default" | "info" | "warning" | "success" | "outline" | "destructive" | "secondary" | "muted" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
    dismissible?: boolean;
    onDismiss?: () => void;
    icon?: React.ReactNode;
}
declare function Badge({ className, variant, size, dismissible, onDismiss, icon, children, ...props }: BadgeProps): React.JSX.Element;
export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
    status: "online" | "offline" | "away" | "busy" | "idle";
}
declare function StatusBadge({ status, className, ...props }: StatusBadgeProps): React.JSX.Element;
export interface CountBadgeProps extends Omit<BadgeProps, "children"> {
    count: number;
    max?: number;
    showZero?: boolean;
}
declare function CountBadge({ count, max, showZero, className, ...props }: CountBadgeProps): React.JSX.Element | null;
export { Badge, StatusBadge, CountBadge, badgeVariants };
//# sourceMappingURL=badge.d.ts.map