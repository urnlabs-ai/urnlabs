import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { type VariantProps } from "class-variance-authority";
declare const separatorVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    variant?: "default" | "bold" | "dashed" | "dotted" | "gradient" | "subtle" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Separator: React.ForwardRefExoticComponent<Omit<SeparatorPrimitive.SeparatorProps & React.RefAttributes<HTMLDivElement>, "ref"> & VariantProps<(props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    variant?: "default" | "bold" | "dashed" | "dotted" | "gradient" | "subtle" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
export interface TextSeparatorProps extends Omit<React.ComponentPropsWithoutRef<typeof Separator>, "children"> {
    children: React.ReactNode;
    position?: "center" | "left" | "right";
    spacing?: "sm" | "default" | "lg";
}
declare const TextSeparator: React.ForwardRefExoticComponent<TextSeparatorProps & React.RefAttributes<HTMLDivElement>>;
export interface IconSeparatorProps extends Omit<React.ComponentPropsWithoutRef<typeof Separator>, "children"> {
    icon: React.ReactNode;
    position?: "center" | "left" | "right";
    spacing?: "sm" | "default" | "lg";
}
declare const IconSeparator: React.ForwardRefExoticComponent<IconSeparatorProps & React.RefAttributes<HTMLDivElement>>;
export interface SectionSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    subtitle?: string;
    icon?: React.ReactNode;
    variant?: "default" | "subtle" | "bold";
    size?: "sm" | "default" | "lg";
    spacing?: "sm" | "default" | "lg";
}
declare const SectionSeparator: React.ForwardRefExoticComponent<SectionSeparatorProps & React.RefAttributes<HTMLDivElement>>;
export interface BreadcrumbSeparatorProps {
    icon?: React.ReactNode;
    variant?: "default" | "subtle" | "bold";
}
declare const BreadcrumbSeparator: React.FC<BreadcrumbSeparatorProps>;
export interface SpacerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "xs" | "sm" | "default" | "lg" | "xl" | "2xl";
    axis?: "horizontal" | "vertical" | "both";
}
declare const Spacer: React.ForwardRefExoticComponent<SpacerProps & React.RefAttributes<HTMLDivElement>>;
export { Separator, TextSeparator, IconSeparator, SectionSeparator, BreadcrumbSeparator, Spacer, separatorVariants, };
//# sourceMappingURL=separator.d.ts.map