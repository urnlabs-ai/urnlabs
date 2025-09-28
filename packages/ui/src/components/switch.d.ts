import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { type VariantProps } from "class-variance-authority";
declare const switchVariants: (props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const switchThumbVariants: (props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Switch: React.ForwardRefExoticComponent<Omit<SwitchPrimitives.SwitchProps & React.RefAttributes<HTMLButtonElement>, "ref"> & VariantProps<(props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
} & React.RefAttributes<HTMLButtonElement>>;
export interface SwitchWithLabelProps extends React.ComponentPropsWithoutRef<typeof Switch> {
    label: string;
    description?: string;
    labelPosition?: "left" | "right";
}
declare const SwitchWithLabel: React.ForwardRefExoticComponent<SwitchWithLabelProps & React.RefAttributes<HTMLButtonElement>>;
export interface ToggleOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
}
export interface SwitchGroupProps {
    options: ToggleOption[];
    value?: string[];
    onValueChange?: (value: string[]) => void;
    size?: "sm" | "default" | "lg";
    variant?: "default" | "success" | "warning" | "destructive";
    orientation?: "vertical" | "horizontal";
    className?: string;
}
declare const SwitchGroup: React.ForwardRefExoticComponent<SwitchGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface SettingsSwitchProps extends SwitchWithLabelProps {
    badge?: string;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}
declare const SettingsSwitch: React.ForwardRefExoticComponent<SettingsSwitchProps & React.RefAttributes<HTMLButtonElement>>;
export { Switch, SwitchWithLabel, SwitchGroup, SettingsSwitch, switchVariants, switchThumbVariants };
//# sourceMappingURL=switch.d.ts.map