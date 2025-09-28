"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDown, ChevronRight, Plus, Minus } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "../utils/cn"
import { Button } from "./button"

const collapsibleVariants = cva(
  "w-full",
  {
    variants: {
      variant: {
        default: "",
        bordered: "border border-border rounded-lg overflow-hidden",
        card: "border border-border rounded-lg shadow-sm bg-card",
        ghost: "",
      },
      size: {
        sm: "[&_[data-collapsible-content]]:px-3 [&_[data-collapsible-content]]:py-2",
        default: "[&_[data-collapsible-content]]:px-4 [&_[data-collapsible-content]]:py-3",
        lg: "[&_[data-collapsible-content]]:px-6 [&_[data-collapsible-content]]:py-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & {
    icon?: "chevron-down" | "chevron-right" | "plus" | "none"
    iconPosition?: "left" | "right"
    asChild?: boolean
  }
>(({ className, children, icon = "chevron-down", iconPosition = "right", asChild = false, ...props }, ref) => {
  const getIcon = (isOpen: boolean) => {
    switch (icon) {
      case "chevron-down":
        return (
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        )
      case "chevron-right":
        return (
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
        )
      case "plus":
        return isOpen ? (
          <Minus className="h-4 w-4 transition-transform duration-200" />
        ) : (
          <Plus className="h-4 w-4 transition-transform duration-200" />
        )
      case "none":
        return null
      default:
        return (
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        )
    }
  }

  if (asChild) {
    return (
      <CollapsiblePrimitive.Trigger ref={ref} asChild {...props}>
        {children}
      </CollapsiblePrimitive.Trigger>
    )
  }

  return (
    <CollapsiblePrimitive.Trigger
      ref={ref}
      className={cn(
        "flex w-full items-center justify-between py-2 text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        iconPosition === "left" && "flex-row-reverse",
        className
      )}
      {...props}
    >
      {children}
      {React.createElement(() => {
        const [isOpen, setIsOpen] = React.useState(false)

        React.useEffect(() => {
          const element = ref as React.MutableRefObject<HTMLElement>
          if (element.current) {
            const observer = new MutationObserver(() => {
              setIsOpen(element.current.getAttribute('data-state') === 'open')
            })
            observer.observe(element.current, { attributes: true })
            return () => observer.disconnect()
          }
        }, [])

        return getIcon(isOpen)
      })}
    </CollapsiblePrimitive.Trigger>
  )
})
CollapsibleTrigger.displayName = CollapsiblePrimitive.Trigger.displayName

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content> & {
    animated?: boolean
  }
>(({ className, children, animated = true, ...props }, ref) => {
  if (animated) {
    return (
      <CollapsiblePrimitive.Content
        ref={ref}
        className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
        {...props}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={className}
          data-collapsible-content
        >
          {children}
        </motion.div>
      </CollapsiblePrimitive.Content>
    )
  }

  return (
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cn("overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down", className)}
      {...props}
    >
      <div data-collapsible-content>
        {children}
      </div>
    </CollapsiblePrimitive.Content>
  )
})
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName

// Enhanced Collapsible Component
export interface EnhancedCollapsibleProps
  extends React.ComponentPropsWithoutRef<typeof Collapsible> {
  trigger: React.ReactNode
  children: React.ReactNode
  icon?: "chevron-down" | "chevron-right" | "plus" | "none"
  iconPosition?: "left" | "right"
  variant?: "default" | "bordered" | "card" | "ghost"
  size?: "sm" | "default" | "lg"
  animated?: boolean
  disabled?: boolean
  className?: string
}

const EnhancedCollapsible = React.forwardRef<
  React.ElementRef<typeof Collapsible>,
  EnhancedCollapsibleProps
>(({
  trigger,
  children,
  icon = "chevron-down",
  iconPosition = "right",
  variant = "default",
  size = "default",
  animated = true,
  disabled = false,
  className,
  ...props
}, ref) => {
  return (
    <Collapsible
      ref={ref}
      disabled={disabled}
      className={cn(collapsibleVariants({ variant, size }), className)}
      {...props}
    >
      <CollapsibleTrigger
        icon={icon}
        iconPosition={iconPosition}
        disabled={disabled}
        className={cn(
          "px-4 py-3",
          variant === "bordered" && "border-b border-border last:border-b-0",
          variant === "card" && "px-6 py-4",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {trigger}
      </CollapsibleTrigger>
      <CollapsibleContent animated={animated}>
        <div className="px-4 py-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})
EnhancedCollapsible.displayName = "EnhancedCollapsible"

// Collapsible List Component
export interface CollapsibleListItem {
  id: string
  trigger: React.ReactNode
  content: React.ReactNode
  disabled?: boolean
  defaultOpen?: boolean
}

export interface CollapsibleListProps {
  items: CollapsibleListItem[]
  type?: "single" | "multiple"
  icon?: "chevron-down" | "chevron-right" | "plus" | "none"
  iconPosition?: "left" | "right"
  variant?: "default" | "bordered" | "card" | "ghost"
  size?: "sm" | "default" | "lg"
  animated?: boolean
  className?: string
}

const CollapsibleList = React.forwardRef<HTMLDivElement, CollapsibleListProps>(
  ({
    items,
    type = "multiple",
    icon = "chevron-down",
    iconPosition = "right",
    variant = "default",
    size = "default",
    animated = true,
    className,
  }, ref) => {
    const [openItems, setOpenItems] = React.useState<string[]>(
      items.filter(item => item.defaultOpen).map(item => item.id)
    )

    const handleOpenChange = (itemId: string, isOpen: boolean) => {
      if (type === "single") {
        setOpenItems(isOpen ? [itemId] : [])
      } else {
        setOpenItems(prev =>
          isOpen
            ? [...prev, itemId]
            : prev.filter(id => id !== itemId)
        )
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          collapsibleVariants({ variant, size }),
          variant === "bordered" && "divide-y divide-border",
          className
        )}
      >
        {items.map((item) => (
          <EnhancedCollapsible
            key={item.id}
            trigger={item.trigger}
            icon={icon}
            iconPosition={iconPosition}
            variant="ghost"
            size={size}
            animated={animated}
            disabled={item.disabled}
            open={openItems.includes(item.id)}
            onOpenChange={(isOpen) => handleOpenChange(item.id, isOpen)}
          >
            {item.content}
          </EnhancedCollapsible>
        ))}
      </div>
    )
  }
)
CollapsibleList.displayName = "CollapsibleList"

// Sidebar Collapsible Component
export interface SidebarCollapsibleProps extends EnhancedCollapsibleProps {
  badge?: string | number
  badgeVariant?: "default" | "secondary" | "destructive" | "outline"
}

const SidebarCollapsible = React.forwardRef<
  React.ElementRef<typeof Collapsible>,
  SidebarCollapsibleProps
>(({
  trigger,
  badge,
  badgeVariant = "secondary",
  children,
  className,
  ...props
}, ref) => {
  return (
    <EnhancedCollapsible
      ref={ref}
      trigger={
        <div className="flex items-center justify-between w-full">
          <span>{trigger}</span>
          {badge && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                badgeVariant === "default" && "bg-primary text-primary-foreground",
                badgeVariant === "secondary" && "bg-secondary text-secondary-foreground",
                badgeVariant === "destructive" && "bg-destructive text-destructive-foreground",
                badgeVariant === "outline" && "border border-input bg-background"
              )}
            >
              {badge}
            </span>
          )}
        </div>
      }
      variant="ghost"
      icon="chevron-right"
      className={cn("w-full", className)}
      {...props}
    >
      {children}
    </EnhancedCollapsible>
  )
})
SidebarCollapsible.displayName = "SidebarCollapsible"

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  EnhancedCollapsible,
  CollapsibleList,
  SidebarCollapsible,
  collapsibleVariants,
}