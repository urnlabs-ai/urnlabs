"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "framer-motion"

import { cn } from "../utils/cn"

const tabsListVariants = cva(
  "inline-flex items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "bg-transparent border-b border-border p-0",
        pills: "bg-muted",
        underline: "bg-transparent p-0",
      },
      size: {
        default: "h-10",
        sm: "h-9",
        lg: "h-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        line: "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground bg-transparent",
        pills: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        underline: "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground relative",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant, size }), className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> &
    VariantProps<typeof tabsTriggerVariants> & {
      icon?: React.ReactNode
      badge?: string | number
      animated?: boolean
    }
>(({ className, variant, icon, badge, animated = false, children, ...props }, ref) => {
  const content = (
    <>
      {icon && <span className="mr-2">{icon}</span>}
      {children}
      {badge && (
        <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
          {badge}
        </span>
      )}
    </>
  )

  if (animated && variant === "underline") {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(tabsTriggerVariants({ variant }), className)}
        {...props}
      >
        {content}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          exit={{ scaleX: 0 }}
          transition={{ duration: 0.2 }}
          layoutId="activeTab"
        />
      </TabsPrimitive.Trigger>
    )
  }

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    >
      {content}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
    animated?: boolean
  }
>(({ className, animated = false, children, ...props }, ref) => {
  if (animated) {
    return (
      <TabsPrimitive.Content
        ref={ref}
        className={cn(
          "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </TabsPrimitive.Content>
    )
  }

  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Content>
  )
})
TabsContent.displayName = TabsPrimitive.Content.displayName

// Vertical Tabs Component
export interface VerticalTabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

const VerticalTabs = React.forwardRef<HTMLDivElement, VerticalTabsProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Tabs
        ref={ref}
        orientation="vertical"
        className={cn("flex gap-4", className)}
        {...props}
      >
        {children}
      </Tabs>
    )
  }
)
VerticalTabs.displayName = "VerticalTabs"

const VerticalTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex flex-col h-auto space-y-1 bg-transparent p-0",
      className
    )}
    {...props}
  />
))
VerticalTabsList.displayName = "VerticalTabsList"

const VerticalTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    icon?: React.ReactNode
  }
>(({ className, icon, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground justify-start w-full",
      className
    )}
    {...props}
  >
    {icon && <span className="mr-2">{icon}</span>}
    {children}
  </TabsPrimitive.Trigger>
))
VerticalTabsTrigger.displayName = "VerticalTabsTrigger"

// Tab Panel with lazy loading
export interface LazyTabContentProps {
  value: string
  children: React.ReactNode
  className?: string
  forceMount?: boolean
}

const LazyTabContent = React.forwardRef<HTMLDivElement, LazyTabContentProps>(
  ({ value, children, className, forceMount = false, ...props }, ref) => {
    const [hasBeenActive, setHasBeenActive] = React.useState(false)

    return (
      <TabsPrimitive.Content
        ref={ref}
        value={value}
        className={cn(
          "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
        onFocus={() => setHasBeenActive(true)}
        forceMount={forceMount}
        {...props}
      >
        {(hasBeenActive || forceMount) && children}
      </TabsPrimitive.Content>
    )
  }
)
LazyTabContent.displayName = "LazyTabContent"

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  VerticalTabs,
  VerticalTabsList,
  VerticalTabsTrigger,
  LazyTabContent,
  tabsListVariants,
  tabsTriggerVariants,
}