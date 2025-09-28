"use client";
import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";
const radioGroupVariants = cva("grid gap-2", {
    variants: {
        orientation: {
            vertical: "grid-cols-1",
            horizontal: "grid-flow-col auto-cols-max gap-4",
        },
    },
    defaultVariants: {
        orientation: "vertical",
    },
});
const radioItemVariants = cva("aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", {
    variants: {
        size: {
            sm: "h-3 w-3",
            default: "h-4 w-4",
            lg: "h-5 w-5",
        },
        variant: {
            default: "border-primary text-primary",
            success: "border-green-600 text-green-600",
            warning: "border-yellow-600 text-yellow-600",
            destructive: "border-red-600 text-red-600",
        },
    },
    defaultVariants: {
        size: "default",
        variant: "default",
    },
});
const RadioGroup = React.forwardRef(({ className, orientation, ...props }, ref) => {
    return (<RadioGroupPrimitive.Root className={cn(radioGroupVariants({ orientation }), className)} {...props} ref={ref}/>);
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;
const RadioGroupItem = React.forwardRef(({ className, size, variant, animated = true, ...props }, ref) => {
    if (animated) {
        return (<RadioGroupPrimitive.Item ref={ref} className={cn(radioItemVariants({ size, variant }), className)} {...props}>
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.2 }}>
            <Circle className="h-2.5 w-2.5 fill-current text-current"/>
          </motion.div>
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>);
    }
    return (<RadioGroupPrimitive.Item ref={ref} className={cn(radioItemVariants({ size, variant }), className)} {...props}>
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current"/>
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>);
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;
const EnhancedRadioGroup = React.forwardRef(({ options, size = "default", variant = "default", showDescription = true, animated = true, className, ...props }, ref) => {
    return (<RadioGroup ref={ref} className={className} {...props}>
      {options.map((option) => (<div key={option.value} className="flex items-start space-x-2">
          <RadioGroupItem value={option.value} id={option.value} disabled={option.disabled} size={size} variant={variant} animated={animated} className="mt-1"/>
          <div className="grid gap-1.5 leading-none">
            <label htmlFor={option.value} className={cn("flex items-center gap-2 text-sm font-medium leading-none cursor-pointer", option.disabled && "cursor-not-allowed opacity-50")}>
              {option.icon && <span>{option.icon}</span>}
              {option.label}
            </label>
            {showDescription && option.description && (<p className="text-xs text-muted-foreground">
                {option.description}
              </p>)}
          </div>
        </div>))}
    </RadioGroup>);
});
EnhancedRadioGroup.displayName = "EnhancedRadioGroup";
const CardRadioGroup = React.forwardRef(({ options, cardStyle = true, className, ...props }, ref) => {
    if (!cardStyle) {
        return <EnhancedRadioGroup ref={ref} options={options} className={className} {...props}/>;
    }
    return (<RadioGroup ref={ref} className={cn("grid gap-3", className)} {...props}>
      {options.map((option) => (<div key={option.value} className="relative">
          <RadioGroupItem value={option.value} id={option.value} disabled={option.disabled} className="peer sr-only"/>
          <label htmlFor={option.value} className={cn("flex cursor-pointer select-none items-start space-x-3 rounded-lg border-2 border-muted p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary", option.disabled && "cursor-not-allowed opacity-50")}>
            <div className="flex items-center gap-3">
              {option.icon && <span>{option.icon}</span>}
              <div className="grid gap-1">
                <div className="font-medium">{option.label}</div>
                {option.description && (<div className="text-sm text-muted-foreground">
                    {option.description}
                  </div>)}
              </div>
            </div>
          </label>
        </div>))}
    </RadioGroup>);
});
CardRadioGroup.displayName = "CardRadioGroup";
export { RadioGroup, RadioGroupItem, EnhancedRadioGroup, CardRadioGroup, radioGroupVariants, radioItemVariants };
//# sourceMappingURL=radio-group.js.map