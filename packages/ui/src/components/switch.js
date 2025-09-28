"use client";
import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";
const switchVariants = cva("peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", {
    variants: {
        size: {
            sm: "h-4 w-7",
            default: "h-6 w-11",
            lg: "h-7 w-12",
        },
        variant: {
            default: "data-[state=checked]:bg-primary",
            success: "data-[state=checked]:bg-green-600",
            warning: "data-[state=checked]:bg-yellow-600",
            destructive: "data-[state=checked]:bg-red-600",
        },
    },
    defaultVariants: {
        size: "default",
        variant: "default",
    },
});
const switchThumbVariants = cva("pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0", {
    variants: {
        size: {
            sm: "h-3 w-3 data-[state=checked]:translate-x-3",
            default: "h-5 w-5 data-[state=checked]:translate-x-5",
            lg: "h-5 w-5 data-[state=checked]:translate-x-5",
        },
    },
    defaultVariants: {
        size: "default",
    },
});
const Switch = React.forwardRef(({ className, size, variant, animated = true, ...props }, ref) => {
    if (animated) {
        return (<SwitchPrimitives.Root className={cn(switchVariants({ size, variant }), className)} {...props} ref={ref}>
        <SwitchPrimitives.Thumb asChild>
          <motion.span className={switchThumbVariants({ size })} layout transition={{
                type: "spring",
                stiffness: 700,
                damping: 30,
            }}/>
        </SwitchPrimitives.Thumb>
      </SwitchPrimitives.Root>);
    }
    return (<SwitchPrimitives.Root className={cn(switchVariants({ size, variant }), className)} {...props} ref={ref}>
      <SwitchPrimitives.Thumb className={switchThumbVariants({ size })}/>
    </SwitchPrimitives.Root>);
});
Switch.displayName = SwitchPrimitives.Root.displayName;
const SwitchWithLabel = React.forwardRef(({ label, description, labelPosition = "left", className, ...props }, ref) => {
    return (<div className={cn("flex items-center space-x-2", className)}>
      {labelPosition === "left" && (<div className="grid gap-1.5 leading-none">
          <label htmlFor={props.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
            {label}
          </label>
          {description && (<p className="text-xs text-muted-foreground">{description}</p>)}
        </div>)}
      <Switch ref={ref} {...props}/>
      {labelPosition === "right" && (<div className="grid gap-1.5 leading-none">
          <label htmlFor={props.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
            {label}
          </label>
          {description && (<p className="text-xs text-muted-foreground">{description}</p>)}
        </div>)}
    </div>);
});
SwitchWithLabel.displayName = "SwitchWithLabel";
const SwitchGroup = React.forwardRef(({ options, value = [], onValueChange, size = "default", variant = "default", orientation = "vertical", className, ...props }, ref) => {
    const handleSwitchChange = (optionValue, checked) => {
        if (checked) {
            onValueChange?.([...value, optionValue]);
        }
        else {
            onValueChange?.(value.filter((v) => v !== optionValue));
        }
    };
    return (<div ref={ref} className={cn("space-y-3", orientation === "horizontal" && "flex flex-wrap gap-4 space-y-0", className)} {...props}>
        {options.map((option) => (<div key={option.value} className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-2">
              {option.icon && <span>{option.icon}</span>}
              <div className="grid gap-1 leading-none">
                <label htmlFor={`switch-${option.value}`} className={cn("text-sm font-medium leading-none cursor-pointer", option.disabled && "cursor-not-allowed opacity-50")}>
                  {option.label}
                </label>
                {option.description && (<p className="text-xs text-muted-foreground">
                    {option.description}
                  </p>)}
              </div>
            </div>
            <Switch id={`switch-${option.value}`} checked={value.includes(option.value)} onCheckedChange={(checked) => handleSwitchChange(option.value, checked)} disabled={option.disabled} size={size} variant={variant}/>
          </div>))}
      </div>);
});
SwitchGroup.displayName = "SwitchGroup";
const SettingsSwitch = React.forwardRef(({ label, description, badge, badgeVariant = "secondary", className, ...props }, ref) => {
    return (<div className={cn("flex items-center justify-between space-x-2 p-4 border rounded-lg", className)}>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <label htmlFor={props.id} className="text-sm font-medium leading-none cursor-pointer">
            {label}
          </label>
          {badge && (<span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-medium", badgeVariant === "default" && "bg-primary text-primary-foreground", badgeVariant === "secondary" && "bg-secondary text-secondary-foreground", badgeVariant === "destructive" && "bg-destructive text-destructive-foreground", badgeVariant === "outline" && "border border-input bg-background")}>
              {badge}
            </span>)}
        </div>
        {description && (<p className="text-sm text-muted-foreground">{description}</p>)}
      </div>
      <Switch ref={ref} {...props}/>
    </div>);
});
SettingsSwitch.displayName = "SettingsSwitch";
export { Switch, SwitchWithLabel, SwitchGroup, SettingsSwitch, switchVariants, switchThumbVariants };
//# sourceMappingURL=switch.js.map