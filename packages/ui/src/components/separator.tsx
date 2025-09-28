"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "framer-motion"

import { cn } from "../utils/cn"

const separatorVariants = cva(
  "shrink-0 bg-border",
  {
    variants: {
      orientation: {
        horizontal: "h-[1px] w-full",
        vertical: "h-full w-[1px]",
      },
      variant: {
        default: "bg-border",
        subtle: "bg-border/50",
        bold: "bg-border",
        gradient: "bg-gradient-to-r from-transparent via-border to-transparent",
        dashed: "border-t border-dashed border-border bg-transparent",
        dotted: "border-t border-dotted border-border bg-transparent",
      },
      size: {
        sm: "",
        default: "",
        lg: "",
      },
    },
    compoundVariants: [
      {
        orientation: "horizontal",
        size: "sm",
        className: "h-px",
      },
      {
        orientation: "horizontal",
        size: "default",
        className: "h-[1px]",
      },
      {
        orientation: "horizontal",
        size: "lg",
        className: "h-0.5",
      },
      {
        orientation: "vertical",
        size: "sm",
        className: "w-px",
      },
      {
        orientation: "vertical",
        size: "default",
        className: "w-[1px]",
      },
      {
        orientation: "vertical",
        size: "lg",
        className: "w-0.5",
      },
      {
        variant: "dashed",
        orientation: "horizontal",
        className: "h-0 border-t",
      },
      {
        variant: "dotted",
        orientation: "horizontal",
        className: "h-0 border-t",
      },
      {
        variant: "dashed",
        orientation: "vertical",
        className: "w-0 border-l border-dashed",
      },
      {
        variant: "dotted",
        orientation: "vertical",
        className: "w-0 border-l border-dotted",
      },
    ],
    defaultVariants: {
      orientation: "horizontal",
      variant: "default",
      size: "default",
    },
  }
)

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> &
    VariantProps<typeof separatorVariants> & {
      animated?: boolean
    }
>(({ className, orientation, variant, size, animated = false, ...props }, ref) => {
  if (animated) {
    return (
      <SeparatorPrimitive.Root
        ref={ref}
        decorative
        orientation={orientation}
        asChild
        {...props}
      >
        <motion.div
          className={cn(separatorVariants({ orientation, variant, size }), className)}
          initial={{
            scaleX: orientation === "horizontal" ? 0 : 1,
            scaleY: orientation === "vertical" ? 0 : 1,
          }}
          animate={{
            scaleX: 1,
            scaleY: 1,
          }}
          transition={{
            duration: 0.3,
            ease: "easeOut",
          }}
        />
      </SeparatorPrimitive.Root>
    )
  }

  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative
      orientation={orientation}
      className={cn(separatorVariants({ orientation, variant, size }), className)}
      {...props}
    />
  )
})
Separator.displayName = SeparatorPrimitive.Root.displayName

// Text Separator Component
export interface TextSeparatorProps extends Omit<React.ComponentPropsWithoutRef<typeof Separator>, "children"> {
  children: React.ReactNode
  position?: "center" | "left" | "right"
  spacing?: "sm" | "default" | "lg"
}

const TextSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  TextSeparatorProps
>(({ children, position = "center", spacing = "default", className, ...props }, ref) => {
  const spacingClasses = {
    sm: "px-2",
    default: "px-3",
    lg: "px-4",
  }

  const containerClasses = {
    center: "justify-center",
    left: "justify-start",
    right: "justify-end",
  }

  return (
    <div className={cn("flex items-center", containerClasses[position], className)}>
      {position !== "left" && (
        <Separator ref={ref} className="flex-1" {...props} />
      )}
      <div className={cn(
        "bg-background text-muted-foreground text-sm whitespace-nowrap",
        spacingClasses[spacing]
      )}>
        {children}
      </div>
      {position !== "right" && (
        <Separator className="flex-1" {...props} />
      )}
    </div>
  )
})
TextSeparator.displayName = "TextSeparator"

// Icon Separator Component
export interface IconSeparatorProps extends Omit<React.ComponentPropsWithoutRef<typeof Separator>, "children"> {
  icon: React.ReactNode
  position?: "center" | "left" | "right"
  spacing?: "sm" | "default" | "lg"
}

const IconSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  IconSeparatorProps
>(({ icon, position = "center", spacing = "default", className, ...props }, ref) => {
  const spacingClasses = {
    sm: "px-2",
    default: "px-3",
    lg: "px-4",
  }

  const containerClasses = {
    center: "justify-center",
    left: "justify-start",
    right: "justify-end",
  }

  return (
    <div className={cn("flex items-center", containerClasses[position], className)}>
      {position !== "left" && (
        <Separator ref={ref} className="flex-1" {...props} />
      )}
      <div className={cn(
        "bg-background text-muted-foreground flex items-center justify-center",
        spacingClasses[spacing]
      )}>
        {icon}
      </div>
      {position !== "right" && (
        <Separator className="flex-1" {...props} />
      )}
    </div>
  )
})
IconSeparator.displayName = "IconSeparator"

// Section Separator Component
export interface SectionSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  icon?: React.ReactNode
  variant?: "default" | "subtle" | "bold"
  size?: "sm" | "default" | "lg"
  spacing?: "sm" | "default" | "lg"
}

const SectionSeparator = React.forwardRef<HTMLDivElement, SectionSeparatorProps>(
  ({ title, subtitle, icon, variant = "default", size = "default", spacing = "default", className, ...props }, ref) => {
    const spacingClasses = {
      sm: "py-4",
      default: "py-6",
      lg: "py-8",
    }

    return (
      <div
        ref={ref}
        className={cn("flex flex-col items-center text-center", spacingClasses[spacing], className)}
        {...props}
      >
        {(title || subtitle || icon) && (
          <div className="flex flex-col items-center space-y-2 mb-4">
            {icon && (
              <div className="text-muted-foreground">
                {icon}
              </div>
            )}
            {title && (
              <h3 className="text-lg font-semibold tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-muted-foreground max-w-md">
                {subtitle}
              </p>
            )}
          </div>
        )}
        <Separator variant={variant} size={size} className="w-full max-w-xs" />
      </div>
    )
  }
)
SectionSeparator.displayName = "SectionSeparator"

// Breadcrumb Separator Component
export interface BreadcrumbSeparatorProps {
  icon?: React.ReactNode
  variant?: "default" | "subtle" | "bold"
}

const BreadcrumbSeparator: React.FC<BreadcrumbSeparatorProps> = ({
  icon = "/",
  variant = "default",
}) => {
  return (
    <span
      className={cn(
        "text-muted-foreground",
        variant === "subtle" && "opacity-50",
        variant === "bold" && "font-medium"
      )}
    >
      {icon}
    </span>
  )
}
BreadcrumbSeparator.displayName = "BreadcrumbSeparator"

// Spacer Component (invisible separator for spacing)
export interface SpacerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "xs" | "sm" | "default" | "lg" | "xl" | "2xl"
  axis?: "horizontal" | "vertical" | "both"
}

const Spacer = React.forwardRef<HTMLDivElement, SpacerProps>(
  ({ size = "default", axis = "vertical", className, ...props }, ref) => {
    const sizeClasses = {
      xs: "p-1",
      sm: "p-2",
      default: "p-4",
      lg: "p-6",
      xl: "p-8",
      "2xl": "p-12",
    }

    const axisClasses = {
      horizontal: {
        xs: "px-1",
        sm: "px-2",
        default: "px-4",
        lg: "px-6",
        xl: "px-8",
        "2xl": "px-12",
      },
      vertical: {
        xs: "py-1",
        sm: "py-2",
        default: "py-4",
        lg: "py-6",
        xl: "py-8",
        "2xl": "py-12",
      },
      both: sizeClasses,
    }

    return (
      <div
        ref={ref}
        className={cn(axisClasses[axis][size], className)}
        {...props}
      />
    )
  }
)
Spacer.displayName = "Spacer"

export {
  Separator,
  TextSeparator,
  IconSeparator,
  SectionSeparator,
  BreadcrumbSeparator,
  Spacer,
  separatorVariants,
}