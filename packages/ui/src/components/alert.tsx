"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "../utils/cn"
import { fadeIn } from "../utils/animations"

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
        success:
          "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100 [&>svg]:text-green-600 dark:[&>svg]:text-green-400",
        warning:
          "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400",
        info:
          "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400",
      },
      size: {
        default: "p-4",
        sm: "p-3 text-sm",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & {
      animated?: boolean
      dismissible?: boolean
      onDismiss?: () => void
    }
>(({ className, variant, size, animated = false, dismissible = false, onDismiss, children, ...props }, ref) => {
  const [isVisible, setIsVisible] = React.useState(true)

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss?.()
  }

  const content = (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant, size }), className)}
      {...props}
    >
      {children}
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </button>
      )}
    </div>
  )

  if (animated) {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  return isVisible ? content : null
})
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

// Enhanced Alert with Icon
export interface AlertWithIconProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode
  title?: string
  description?: string
  animated?: boolean
  dismissible?: boolean
  onDismiss?: () => void
  showDefaultIcon?: boolean
}

const AlertWithIcon = React.forwardRef<HTMLDivElement, AlertWithIconProps>(
  ({
    className,
    variant,
    size,
    icon,
    title,
    description,
    animated = false,
    dismissible = false,
    onDismiss,
    showDefaultIcon = true,
    children,
    ...props
  }, ref) => {
    const getDefaultIcon = () => {
      if (!showDefaultIcon) return null

      switch (variant) {
        case "success":
          return <CheckCircle className="h-4 w-4" />
        case "destructive":
          return <AlertCircle className="h-4 w-4" />
        case "warning":
          return <AlertTriangle className="h-4 w-4" />
        case "info":
          return <Info className="h-4 w-4" />
        default:
          return <Info className="h-4 w-4" />
      }
    }

    const displayIcon = icon !== undefined ? icon : getDefaultIcon()

    return (
      <Alert
        ref={ref}
        variant={variant}
        size={size}
        className={className}
        animated={animated}
        dismissible={dismissible}
        onDismiss={onDismiss}
        {...props}
      >
        {displayIcon}
        <div>
          {title && <AlertTitle>{title}</AlertTitle>}
          {description && <AlertDescription>{description}</AlertDescription>}
          {children}
        </div>
      </Alert>
    )
  }
)
AlertWithIcon.displayName = "AlertWithIcon"

// Alert variants for common use cases
const SuccessAlert = React.forwardRef<HTMLDivElement, Omit<AlertWithIconProps, "variant">>(
  (props, ref) => <AlertWithIcon ref={ref} variant="success" {...props} />
)
SuccessAlert.displayName = "SuccessAlert"

const ErrorAlert = React.forwardRef<HTMLDivElement, Omit<AlertWithIconProps, "variant">>(
  (props, ref) => <AlertWithIcon ref={ref} variant="destructive" {...props} />
)
ErrorAlert.displayName = "ErrorAlert"

const WarningAlert = React.forwardRef<HTMLDivElement, Omit<AlertWithIconProps, "variant">>(
  (props, ref) => <AlertWithIcon ref={ref} variant="warning" {...props} />
)
WarningAlert.displayName = "WarningAlert"

const InfoAlert = React.forwardRef<HTMLDivElement, Omit<AlertWithIconProps, "variant">>(
  (props, ref) => <AlertWithIcon ref={ref} variant="info" {...props} />
)
InfoAlert.displayName = "InfoAlert"

// Alert Hook for managing alert state
export interface UseAlertOptions {
  duration?: number
  onDismiss?: () => void
}

export function useAlert(options: UseAlertOptions = {}) {
  const [isVisible, setIsVisible] = React.useState(false)

  const showAlert = React.useCallback(() => {
    setIsVisible(true)

    if (options.duration && options.duration > 0) {
      setTimeout(() => {
        setIsVisible(false)
        options.onDismiss?.()
      }, options.duration)
    }
  }, [options])

  const hideAlert = React.useCallback(() => {
    setIsVisible(false)
    options.onDismiss?.()
  }, [options])

  return {
    isVisible,
    showAlert,
    hideAlert,
  }
}

export {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertWithIcon,
  SuccessAlert,
  ErrorAlert,
  WarningAlert,
  InfoAlert,
  alertVariants,
}