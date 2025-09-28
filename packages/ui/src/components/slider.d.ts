import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { type VariantProps } from "class-variance-authority";
declare const sliderVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const sliderTrackVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const sliderRangeVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    variant?: "default" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Slider: React.ForwardRefExoticComponent<Omit<SliderPrimitive.SliderProps & React.RefAttributes<HTMLSpanElement>, "ref"> & VariantProps<(props?: ({
    orientation?: "horizontal" | "vertical" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    variant?: "default" | "success" | "warning" | "destructive";
    animated?: boolean;
    showTooltip?: boolean;
    formatValue?: (value: number) => string;
} & React.RefAttributes<HTMLSpanElement>>;
export interface RangeSliderProps extends Omit<React.ComponentPropsWithoutRef<typeof Slider>, "value" | "onValueChange"> {
    value?: [number, number];
    onValueChange?: (value: [number, number]) => void;
    label?: string;
    showValues?: boolean;
    formatValue?: (value: number) => string;
}
declare const RangeSlider: React.ForwardRefExoticComponent<RangeSliderProps & React.RefAttributes<HTMLSpanElement>>;
export interface StepSliderProps extends React.ComponentPropsWithoutRef<typeof Slider> {
    steps: Array<{
        value: number;
        label: string;
        description?: string;
    }>;
    showSteps?: boolean;
    showLabels?: boolean;
}
declare const StepSlider: React.ForwardRefExoticComponent<StepSliderProps & React.RefAttributes<HTMLSpanElement>>;
export interface VolumeSliderProps extends Omit<React.ComponentPropsWithoutRef<typeof Slider>, "value" | "onValueChange"> {
    value?: number;
    onValueChange?: (value: number) => void;
    muted?: boolean;
    onMutedChange?: (muted: boolean) => void;
    showVolumeIcon?: boolean;
}
declare const VolumeSlider: React.ForwardRefExoticComponent<VolumeSliderProps & React.RefAttributes<HTMLSpanElement>>;
export { Slider, RangeSlider, StepSlider, VolumeSlider, sliderVariants, sliderTrackVariants, sliderRangeVariants };
//# sourceMappingURL=slider.d.ts.map