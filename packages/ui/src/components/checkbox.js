"use client";
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";
const checkboxVariants = cva("peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", {
    variants: {
        size: {
            sm: "h-3 w-3",
            default: "h-4 w-4",
            lg: "h-5 w-5",
        },
        variant: {
            default: "border-primary",
            success: "border-green-600 data-[state=checked]:bg-green-600",
            warning: "border-yellow-600 data-[state=checked]:bg-yellow-600",
            destructive: "border-red-600 data-[state=checked]:bg-red-600",
        },
    },
    defaultVariants: {
        size: "default",
        variant: "default",
    },
});
const Checkbox = React.forwardRef(({ className, size, variant, indeterminate = false, animated = true, ...props }, ref) => {
    const IconComponent = indeterminate ? Minus : Check;
    if (animated) {
        return (<CheckboxPrimitive.Root ref={ref} className={cn(checkboxVariants({ size, variant }), className)} {...props}>
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <IconComponent className="h-4 w-4"/>
          </motion.div>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>);
    }
    return (<CheckboxPrimitive.Root ref={ref} className={cn(checkboxVariants({ size, variant }), className)} {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <IconComponent className="h-4 w-4"/>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>);
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
const CheckboxGroup = React.forwardRef(({ options, value = [], onValueChange, orientation = "vertical", size = "default", variant = "default", className, ...props }, ref) => {
    const handleCheckedChange = (optionValue, checked) => {
        if (checked) {
            onValueChange?.([...value, optionValue]);
        }
        else {
            onValueChange?.(value.filter((v) => v !== optionValue));
        }
    };
    return (<div ref={ref} className={cn("space-y-2", orientation === "horizontal" && "flex flex-wrap gap-4 space-y-0", className)} {...props}>
        {options.map((option) => (<div key={option.id} className="flex items-start space-x-2">
            <Checkbox id={option.id} checked={value.includes(option.value)} onCheckedChange={(checked) => handleCheckedChange(option.value, checked)} disabled={option.disabled} size={size} variant={variant}/>
            <div className="grid gap-1.5 leading-none">
              <label htmlFor={option.id} className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", option.disabled && "opacity-50")}>
                {option.label}
              </label>
              {option.description && (<p className="text-xs text-muted-foreground">
                  {option.description}
                </p>)}
            </div>
          </div>))}
      </div>);
});
CheckboxGroup.displayName = "CheckboxGroup";
const CheckboxWithLabel = React.forwardRef(({ label, description, labelPosition = "right", className, ...props }, ref) => {
    return (<div className={cn("flex items-start space-x-2", className)}>
      {labelPosition === "left" && (<div className="grid gap-1.5 leading-none">
          <label htmlFor={props.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
          {description && (<p className="text-xs text-muted-foreground">{description}</p>)}
        </div>)}
      <Checkbox ref={ref} {...props}/>
      {labelPosition === "right" && (<div className="grid gap-1.5 leading-none">
          <label htmlFor={props.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
          {description && (<p className="text-xs text-muted-foreground">{description}</p>)}
        </div>)}
    </div>);
});
CheckboxWithLabel.displayName = "CheckboxWithLabel";
export { Checkbox, CheckboxGroup, CheckboxWithLabel, checkboxVariants };
//# sourceMappingURL=checkbox.js.map