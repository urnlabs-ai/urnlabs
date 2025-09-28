"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../utils/cn";
const spinnerVariants = cva("animate-spin", {
    variants: {
        size: {
            sm: "h-4 w-4",
            default: "h-6 w-6",
            lg: "h-8 w-8",
            xl: "h-12 w-12",
        },
        color: {
            default: "text-foreground",
            muted: "text-muted-foreground",
            primary: "text-primary",
            secondary: "text-secondary-foreground",
        },
    },
    defaultVariants: {
        size: "default",
        color: "default",
    },
});
const Spinner = React.forwardRef(({ className, size, color, ...props }, ref) => {
    return (<Loader2 ref={ref} className={cn(spinnerVariants({ size, color }), className)} {...props}/>);
});
Spinner.displayName = "Spinner";
const LoadingButton = React.forwardRef(({ className, loading = false, children, spinnerSize = "sm", ...props }, ref) => {
    return (<div ref={ref} className={cn("flex items-center gap-2", className)} {...props}>
        {loading && <Spinner size={spinnerSize}/>}
        {children}
      </div>);
});
LoadingButton.displayName = "LoadingButton";
const LoadingOverlay = React.forwardRef(({ className, loading = false, children, overlay = true, spinnerSize = "lg", ...props }, ref) => {
    return (<div ref={ref} className={cn("relative", className)} {...props}>
        {children}
        {loading && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn("absolute inset-0 flex items-center justify-center", overlay && "bg-background/80 backdrop-blur-sm")}>
            <Spinner size={spinnerSize}/>
          </motion.div>)}
      </div>);
});
LoadingOverlay.displayName = "LoadingOverlay";
const Skeleton = React.forwardRef(({ className, variant = "rectangular", animation = "pulse", ...props }, ref) => {
    const baseClasses = "bg-muted";
    const variantClasses = {
        text: "h-4 w-full rounded",
        circular: "rounded-full",
        rectangular: "rounded",
    };
    const animationClasses = {
        pulse: "animate-pulse",
        wave: "animate-pulse", // Could be enhanced with a wave animation
        none: "",
    };
    return (<div ref={ref} className={cn(baseClasses, variantClasses[variant], animationClasses[animation], className)} {...props}/>);
});
Skeleton.displayName = "Skeleton";
const LoadingCard = React.forwardRef(({ className, lines = 3, showAvatar = false, ...props }, ref) => {
    return (<div ref={ref} className={cn("space-y-3 p-4", className)} {...props}>
        {showAvatar && (<div className="flex items-center space-x-4">
            <Skeleton variant="circular" className="h-10 w-10"/>
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/4"/>
              <Skeleton className="h-3 w-1/2"/>
            </div>
          </div>)}
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, i) => (<Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}/>))}
        </div>
      </div>);
});
LoadingCard.displayName = "LoadingCard";
const DotsLoading = React.forwardRef(({ className, size = "default", color = "currentColor", ...props }, ref) => {
    const dotSizes = {
        sm: "h-1 w-1",
        default: "h-2 w-2",
        lg: "h-3 w-3",
    };
    return (<div ref={ref} className={cn("flex items-center space-x-1", className)} {...props}>
        {[0, 1, 2].map((i) => (<motion.div key={i} className={cn("rounded-full", dotSizes[size])} style={{ backgroundColor: color }} animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.5, 1],
            }} transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
            }}/>))}
      </div>);
});
DotsLoading.displayName = "DotsLoading";
export { Spinner, LoadingButton, LoadingOverlay, Skeleton, LoadingCard, DotsLoading, spinnerVariants, };
//# sourceMappingURL=loading.js.map