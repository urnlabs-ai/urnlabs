import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { type VariantProps } from "class-variance-authority";
declare const checkboxVariants: (props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Checkbox: React.ForwardRefExoticComponent<Omit<CheckboxPrimitive.CheckboxProps & React.RefAttributes<HTMLButtonElement>, "ref"> & VariantProps<(props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    indeterminate?: boolean;
    animated?: boolean;
} & React.RefAttributes<HTMLButtonElement>>;
export interface CheckboxGroupProps {
    options: Array<{
        id: string;
        label: string;
        value: string;
        description?: string;
        disabled?: boolean;
    }>;
    value?: string[];
    onValueChange?: (value: string[]) => void;
    orientation?: "horizontal" | "vertical";
    size?: "sm" | "default" | "lg";
    variant?: "default" | "success" | "warning" | "destructive";
    className?: string;
}
declare const CheckboxGroup: React.ForwardRefExoticComponent<CheckboxGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface CheckboxWithLabelProps extends React.ComponentPropsWithoutRef<typeof Checkbox> {
    label: string;
    description?: string;
    labelPosition?: "right" | "left";
}
declare const CheckboxWithLabel: React.ForwardRefExoticComponent<CheckboxWithLabelProps & React.RefAttributes<HTMLButtonElement>>;
export { Checkbox, CheckboxGroup, CheckboxWithLabel, checkboxVariants };
//# sourceMappingURL=checkbox.d.ts.map