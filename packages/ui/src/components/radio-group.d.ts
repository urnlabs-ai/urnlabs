import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { type VariantProps } from "class-variance-authority";
declare const radioGroupVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const radioItemVariants: (props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const RadioGroup: React.ForwardRefExoticComponent<Omit<RadioGroupPrimitive.RadioGroupProps & React.RefAttributes<HTMLDivElement>, "ref"> & VariantProps<(props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & React.RefAttributes<HTMLDivElement>>;
declare const RadioGroupItem: React.ForwardRefExoticComponent<Omit<RadioGroupPrimitive.RadioGroupItemProps & React.RefAttributes<HTMLButtonElement>, "ref"> & VariantProps<(props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
} & React.RefAttributes<HTMLButtonElement>>;
export interface RadioOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
}
export interface EnhancedRadioGroupProps extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroup>, "children"> {
    options: RadioOption[];
    size?: "sm" | "default" | "lg";
    variant?: "default" | "success" | "warning" | "destructive";
    showDescription?: boolean;
    animated?: boolean;
}
declare const EnhancedRadioGroup: React.ForwardRefExoticComponent<EnhancedRadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface CardRadioGroupProps extends EnhancedRadioGroupProps {
    cardStyle?: boolean;
}
declare const CardRadioGroup: React.ForwardRefExoticComponent<CardRadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export { RadioGroup, RadioGroupItem, EnhancedRadioGroup, CardRadioGroup, radioGroupVariants, radioItemVariants };
//# sourceMappingURL=radio-group.d.ts.map