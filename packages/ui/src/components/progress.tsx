"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "framer-motion"

import { cn } from "../utils/cn"

const progressVariants = cva(
  "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
  {
    variants: {
      size: {
        sm: "h-2",
        default: "h-4",
        lg: "h-6",
      },
      variant: {
        default: "bg-secondary",
        success: "bg-green-100 dark:bg-green-950",
        warning: "bg-yellow-100 dark:bg-yellow-950",
        destructive: "bg-red-100 dark:bg-red-950",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)

const progressIndicatorVariants = cva(
  "h-full w-full flex-1 transition-all",
  {
    variants: {
      variant: {
        default: "bg-primary",
        success: "bg-green-600 dark:bg-green-400",
        warning: "bg-yellow-600 dark:bg-yellow-400",
        destructive: "bg-red-600 dark:bg-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> &
    VariantProps<typeof progressVariants> & {
      animated?: boolean
      showLabel?: boolean
      label?: string
    }
>(({ className, value, size, variant, animated = false, showLabel = false, label, ...props }, ref) => {
  const percentage = Math.min(Math.max(value || 0, 0), 100)

  if (animated) {
    return (
      <div className="space-y-2">
        {(showLabel || label) && (
          <div className="flex justify-between text-sm">
            <span>{label || "Progress"}</span>
            <span>{percentage}%</span>
          </div>
        )}
        <ProgressPrimitive.Root
          ref={ref}
          className={cn(progressVariants({ size, variant }), className)}
          {...props}
        >
          <ProgressPrimitive.Indicator
            asChild
            className={progressIndicatorVariants({ variant })}
            style={{ transform: `translateX(-${100 - percentage}%)` }}
          >
            <motion.div
              initial={{ transform: "translateX(-100%)" }}
              animate={{ transform: `translateX(-${100 - percentage}%)` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </ProgressPrimitive.Indicator>
        </ProgressPrimitive.Root>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {(showLabel || label) && (
        <div className="flex justify-between text-sm">
          <span>{label || "Progress"}</span>
          <span>{percentage}%</span>
        </div>
      )}
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(progressVariants({ size, variant }), className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={progressIndicatorVariants({ variant })}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

// Circular Progress Component
export interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  size?: number
  strokeWidth?: number
  variant?: "default" | "success" | "warning" | "destructive"
  showLabel?: boolean
  label?: string
  animated?: boolean
}

const CircularProgress = React.forwardRef<HTMLDivElement, CircularProgressProps>(
  ({
    className,
    value = 0,
    size = 120,
    strokeWidth = 8,
    variant = "default",
    showLabel = false,
    label,
    animated = false,
    ...props
  }, ref) => {
    const percentage = Math.min(Math.max(value, 0), 100)
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const strokeDasharray = circumference
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    const getStrokeColor = () => {
      switch (variant) {
        case "success":
          return "stroke-green-600 dark:stroke-green-400"
        case "warning":
          return "stroke-yellow-600 dark:stroke-yellow-400"
        case "destructive":
          return "stroke-red-600 dark:stroke-red-400"
        default:
          return "stroke-primary"
      }
    }

    return (
      <div
        ref={ref}
        className={cn("inline-flex flex-col items-center gap-2", className)}
        {...props}
      >
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            className="transform -rotate-90"
            viewBox={`0 0 ${size} ${size}`}
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              className="text-muted stroke-current opacity-20"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={animated ? strokeDasharray : strokeDashoffset}
              className={cn("transition-all duration-1000 ease-out", getStrokeColor())}
              strokeLinecap="round"
              style={animated ? {
                animation: `draw-circle 1s ease-out forwards`,
                strokeDashoffset: strokeDashoffset,
              } : {}}
            />
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-semibold">{Math.round(percentage)}%</span>
          </div>
        </div>
        {(showLabel || label) && (
          <span className="text-sm text-muted-foreground">{label || "Progress"}</span>
        )}
        <style jsx>{`
          @keyframes draw-circle {
            to {
              stroke-dashoffset: ${strokeDashoffset};
            }
          }
        `}</style>
      </div>
    )
  }
)
CircularProgress.displayName = "CircularProgress"

// Multi-step Progress Component
export interface Step {
  id: string
  title: string
  description?: string
  completed?: boolean
  current?: boolean
  disabled?: boolean
}

export interface MultiStepProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: Step[]
  currentStep?: number
  onStepClick?: (stepIndex: number) => void
  variant?: "default" | "vertical"
}

const MultiStepProgress = React.forwardRef<HTMLDivElement, MultiStepProgressProps>(
  ({ className, steps, currentStep = 0, onStepClick, variant = "default", ...props }, ref) => {
    if (variant === "vertical") {
      return (
        <div ref={ref} className={cn("space-y-4", className)} {...props}>
          {steps.map((step, index) => {
            const isCompleted = step.completed || index < currentStep
            const isCurrent = step.current || index === currentStep
            const isClickable = onStepClick && !step.disabled

            return (
              <div key={step.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => isClickable && onStepClick(index)}
                    disabled={!isClickable}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isCurrent
                        ? "border-2 border-primary bg-background text-primary"
                        : "border-2 border-muted bg-background text-muted-foreground",
                      isClickable && "hover:bg-primary/10",
                      step.disabled && "opacity-50"
                    )}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </button>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "mt-2 h-8 w-0.5",
                        isCompleted ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
                <div className="flex-1 pb-8">
                  <h3
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-primary" : "text-foreground"
                    )}
                  >
                    {step.title}
                  </h3>
                  {step.description && (
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div ref={ref} className={cn("space-y-4", className)} {...props}>
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = step.completed || index < currentStep
            const isCurrent = step.current || index === currentStep
            const isClickable = onStepClick && !step.disabled

            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => isClickable && onStepClick(index)}
                    disabled={!isClickable}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isCurrent
                        ? "border-2 border-primary bg-background text-primary"
                        : "border-2 border-muted bg-background text-muted-foreground",
                      isClickable && "hover:bg-primary/10",
                      step.disabled && "opacity-50"
                    )}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </button>
                  <div className="text-center">
                    <div
                      className={cn(
                        "text-xs font-medium",
                        isCurrent ? "text-primary" : "text-foreground"
                      )}
                    >
                      {step.title}
                    </div>
                    {step.description && (
                      <div className="text-xs text-muted-foreground">
                        {step.description}
                      </div>
                    )}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-4",
                      isCompleted ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    )
  }
)
MultiStepProgress.displayName = "MultiStepProgress"

export {
  Progress,
  CircularProgress,
  MultiStepProgress,
  progressVariants,
  progressIndicatorVariants,
}