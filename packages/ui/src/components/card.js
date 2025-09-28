"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cva } from "class-variance-authority";
import { cn } from "../utils/cn";
import { cardHover, transitions } from "../utils/animations";
const cardVariants = cva("rounded-xl border bg-card text-card-foreground shadow", {
    variants: {
        variant: {
            default: "border-border",
            outline: "border-2 border-border",
            ghost: "border-transparent",
            elevated: "shadow-lg border-border/50",
        },
        hover: {
            none: "",
            lift: "transition-all duration-200 hover:shadow-md hover:-translate-y-1",
            glow: "transition-all duration-200 hover:shadow-lg hover:shadow-primary/25",
            scale: "transition-transform duration-200 hover:scale-[1.02]",
        },
    },
    defaultVariants: {
        variant: "default",
        hover: "none",
    },
});
const Card = React.forwardRef(({ className, variant, hover, animated = false, asChild = false, ...props }, ref) => {
    const Component = animated ? motion.div : "div";
    const motionProps = animated
        ? {
            variants: hover === "lift" ? cardHover : undefined,
            initial: "rest",
            whileHover: "hover",
            transition: transitions.fast,
        }
        : {};
    return (<Component ref={ref} className={cn(cardVariants({ variant, hover, className }))} {...motionProps} {...props}/>);
});
Card.displayName = "Card";
const CardHeader = React.forwardRef(({ className, ...props }, ref) => (<div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}/>));
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef(({ className, ...props }, ref) => (<h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props}/>));
CardTitle.displayName = "CardTitle";
const CardDescription = React.forwardRef(({ className, ...props }, ref) => (<p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props}/>));
CardDescription.displayName = "CardDescription";
const CardContent = React.forwardRef(({ className, ...props }, ref) => (<div ref={ref} className={cn("p-6 pt-0", className)} {...props}/>));
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef(({ className, ...props }, ref) => (<div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props}/>));
CardFooter.displayName = "CardFooter";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
//# sourceMappingURL=card.js.map