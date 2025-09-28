"use client";
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cva } from "class-variance-authority";
import { cn } from "../utils/cn";
const sliderVariants = cva("relative flex touch-none select-none items-center", {
    variants: {
        orientation: {
            horizontal: "w-full",
            vertical: "h-full flex-col",
        },
        size: {
            sm: "[&_[role=slider]]:h-3 [&_[role=slider]]:w-3",
            default: "[&_[role=slider]]:h-5 [&_[role=slider]]:w-5",
            lg: "[&_[role=slider]]:h-6 [&_[role=slider]]:w-6",
        },
    },
    defaultVariants: {
        orientation: "horizontal",
        size: "default",
    },
});
const sliderTrackVariants = cva("relative grow rounded-full bg-secondary", {
    variants: {
        orientation: {
            horizontal: "h-2 w-full",
            vertical: "w-2 h-full",
        },
        size: {
            sm: "h-1",
            default: "h-2",
            lg: "h-3",
        },
    },
    defaultVariants: {
        orientation: "horizontal",
        size: "default",
    },
});
const sliderRangeVariants = cva("absolute rounded-full bg-primary", {
    variants: {
        orientation: {
            horizontal: "h-full",
            vertical: "w-full",
        },
        variant: {
            default: "bg-primary",
            success: "bg-green-600",
            warning: "bg-yellow-600",
            destructive: "bg-red-600",
        },
    },
    defaultVariants: {
        orientation: "horizontal",
        variant: "default",
    },
});
const Slider = React.forwardRef(({ className, orientation, size, variant = "default", animated = true, showTooltip = false, formatValue = (value) => value.toString(), ...props }, ref) => {
    const [values, setValues] = React.useState(props.value || props.defaultValue || [0]);
    const [isDragging, setIsDragging] = React.useState(false);
    React.useEffect(() => {
        if (props.value) {
            setValues(props.value);
        }
    }, [props.value]);
    const handleValueChange = (newValues) => {
        setValues(newValues);
        props.onValueChange?.(newValues);
    };
    return (<div className="relative">
      <SliderPrimitive.Root ref={ref} className={cn(sliderVariants({ orientation, size }), className)} orientation={orientation} onValueChange={handleValueChange} onPointerDown={() => setIsDragging(true)} onPointerUp={() => setIsDragging(false)} {...props}>
        <SliderPrimitive.Track className={sliderTrackVariants({ orientation, size })}>
          <SliderPrimitive.Range className={sliderRangeVariants({ orientation, variant })}/>
        </SliderPrimitive.Track>
        {values.map((_, index) => (<SliderPrimitive.Thumb key={index} className={cn("block rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", animated && "transition-transform hover:scale-110", isDragging && "scale-110")}>
            {showTooltip && (<div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground px-2 py-1 rounded text-xs whitespace-nowrap">
                {formatValue(values[index])}
              </div>)}
          </SliderPrimitive.Thumb>))}
      </SliderPrimitive.Root>
    </div>);
});
Slider.displayName = SliderPrimitive.Root.displayName;
const RangeSlider = React.forwardRef(({ value, onValueChange, label, showValues = true, formatValue = (val) => val.toString(), className, ...props }, ref) => {
    const [range, setRange] = React.useState(value || [0, 100]);
    React.useEffect(() => {
        if (value) {
            setRange(value);
        }
    }, [value]);
    const handleValueChange = (newValues) => {
        const newRange = [newValues[0], newValues[1]];
        setRange(newRange);
        onValueChange?.(newRange);
    };
    return (<div className={cn("space-y-2", className)}>
      {label && (<div className="flex justify-between items-center">
          <label className="text-sm font-medium">{label}</label>
          {showValues && (<span className="text-sm text-muted-foreground">
              {formatValue(range[0])} - {formatValue(range[1])}
            </span>)}
        </div>)}
      <Slider ref={ref} value={range} onValueChange={handleValueChange} {...props}/>
    </div>);
});
RangeSlider.displayName = "RangeSlider";
const StepSlider = React.forwardRef(({ steps, showSteps = true, showLabels = true, className, ...props }, ref) => {
    const stepValues = steps.map(step => step.value);
    const min = Math.min(...stepValues);
    const max = Math.max(...stepValues);
    return (<div className={cn("space-y-4", className)}>
      <Slider ref={ref} min={min} max={max} step={null} {...props}/>
      {showSteps && (<div className="relative">
          {/* Step markers */}
          <div className="flex justify-between">
            {steps.map((step, index) => (<div key={index} className="flex flex-col items-center" style={{
                    left: `${((step.value - min) / (max - min)) * 100}%`,
                }}>
                <div className="w-2 h-2 rounded-full bg-border"/>
                {showLabels && (<div className="mt-2 text-center">
                    <div className="text-xs font-medium">{step.label}</div>
                    {step.description && (<div className="text-xs text-muted-foreground">
                        {step.description}
                      </div>)}
                  </div>)}
              </div>))}
          </div>
        </div>)}
    </div>);
});
StepSlider.displayName = "StepSlider";
const VolumeSlider = React.forwardRef(({ value = 50, onValueChange, muted = false, onMutedChange, showVolumeIcon = true, className, ...props }, ref) => {
    const handleValueChange = (values) => {
        onValueChange?.(values[0]);
    };
    const getVolumeIcon = () => {
        if (muted || value === 0)
            return "🔇";
        if (value < 30)
            return "🔈";
        if (value < 70)
            return "🔉";
        return "🔊";
    };
    return (<div className={cn("flex items-center space-x-2", className)}>
      {showVolumeIcon && (<button type="button" onClick={() => onMutedChange?.(!muted)} className="text-muted-foreground hover:text-foreground transition-colors">
          {getVolumeIcon()}
        </button>)}
      <Slider ref={ref} value={[muted ? 0 : value]} onValueChange={handleValueChange} max={100} step={1} variant={muted ? "destructive" : "default"} className="flex-1" {...props}/>
      <span className="text-xs text-muted-foreground w-8 text-right">
        {muted ? 0 : value}
      </span>
    </div>);
});
VolumeSlider.displayName = "VolumeSlider";
export { Slider, RangeSlider, StepSlider, VolumeSlider, sliderVariants, sliderTrackVariants, sliderRangeVariants };
//# sourceMappingURL=slider.js.map