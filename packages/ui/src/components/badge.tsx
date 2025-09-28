"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "../utils/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        warning:
          "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
        info:
          "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
        muted:
          "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dismissible?: boolean
  onDismiss?: () => void
  icon?: React.ReactNode
}

function Badge({
  className,
  variant,
  size,
  dismissible = false,
  onDismiss,
  icon,
  children,
  ...props
}: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon && <span className="mr-1">{icon}</span>}
      {children}
      {dismissible && (
        <button
          type="button"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Dismiss</span>
        </button>
      )}
    </div>
  )
}

// Status Badge Component
export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: "online" | "offline" | "away" | "busy" | "idle"
}

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const statusConfig = {
    online: { variant: "success" as const, label: "Online" },
    offline: { variant: "muted" as const, label: "Offline" },
    away: { variant: "warning" as const, label: "Away" },
    busy: { variant: "destructive" as const, label: "Busy" },
    idle: { variant: "secondary" as const, label: "Idle" },
  }

  const config = statusConfig[status]

  return (
    <Badge
      variant={config.variant}
      className={cn("gap-1", className)}
      {...props}
    >
      <div className="h-2 w-2 rounded-full bg-current" />
      {config.label}
    </Badge>
  )
}

// Count Badge Component
export interface CountBadgeProps extends Omit<BadgeProps, "children"> {
  count: number
  max?: number
  showZero?: boolean
}

function CountBadge({
  count,
  max = 99,
  showZero = false,
  className,
  ...props
}: CountBadgeProps) {
  if (count === 0 && !showZero) {
    return null
  }

  const displayCount = count > max ? `${max}+` : count.toString()

  return (
    <Badge className={cn("h-5 min-w-[20px] px-1", className)} {...props}>
      {displayCount}
    </Badge>
  )
}

export { Badge, StatusBadge, CountBadge, badgeVariants }