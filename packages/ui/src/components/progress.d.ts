import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { type VariantProps } from "class-variance-authority";
declare const progressVariants: (props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const progressIndicatorVariants: (props?: ({
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Progress: React.ForwardRefExoticComponent<Omit<ProgressPrimitive.ProgressProps & React.RefAttributes<HTMLDivElement>, "ref"> & VariantProps<(props?: ({
    size?: "default" | "sm" | "lg" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
    showLabel?: boolean;
    label?: string;
} & React.RefAttributes<HTMLDivElement>>;
export interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number;
    size?: number;
    strokeWidth?: number;
    variant?: "default" | "success" | "warning" | "destructive";
    showLabel?: boolean;
    label?: string;
    animated?: boolean;
}
declare const CircularProgress: React.ForwardRefExoticComponent<CircularProgressProps & React.RefAttributes<HTMLDivElement>>;
export interface Step {
    id: string;
    title: string;
    description?: string;
    completed?: boolean;
    current?: boolean;
    disabled?: boolean;
}
export interface MultiStepProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    steps: Step[];
    currentStep?: number;
    onStepClick?: (stepIndex: number) => void;
    variant?: "default" | "vertical";
}
declare const MultiStepProgress: React.ForwardRefExoticComponent<MultiStepProgressProps & React.RefAttributes<HTMLDivElement>>;
export { Progress, CircularProgress, MultiStepProgress, progressVariants, progressIndicatorVariants, };
//# sourceMappingURL=progress.d.ts.map