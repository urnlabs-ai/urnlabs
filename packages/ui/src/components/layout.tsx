"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "../utils/cn"
import { Sidebar } from "./sidebar"
import { Header } from "./header"

const layoutVariants = cva(
  "min-h-screen bg-background",
  {
    variants: {
      variant: {
        default: "flex",
        centered: "flex flex-col items-center",
        fullscreen: "h-screen overflow-hidden",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Main Layout Component
export interface LayoutProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof layoutVariants> {
  sidebar?: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  sidebarCollapsed?: boolean
  onSidebarCollapsedChange?: (collapsed: boolean) => void
}

const Layout = React.forwardRef<HTMLDivElement, LayoutProps>(
  ({
    className,
    variant,
    sidebar,
    header,
    footer,
    children,
    sidebarCollapsed,
    onSidebarCollapsedChange,
    ...props
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(layoutVariants({ variant }), className)}
        {...props}
      >
        {sidebar}
        <div className="flex flex-1 flex-col overflow-hidden">
          {header}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
          {footer}
        </div>
      </div>
    )
  }
)
Layout.displayName = "Layout"

// Dashboard Layout Component
export interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar?: React.ReactNode
  header?: React.ReactNode
  breadcrumbs?: React.ReactNode
  actions?: React.ReactNode
  loading?: boolean
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(
  ({ className, sidebar, header, breadcrumbs, actions, loading, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("min-h-screen bg-background", className)} {...props}>
        <Layout sidebar={sidebar} header={header}>
          <div className="flex flex-1 flex-col">
            {(breadcrumbs || actions) && (
              <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center space-x-2 sm:space-x-4 overflow-hidden">
                    {breadcrumbs}
                  </div>
                  {actions && (
                    <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                      {actions}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex-1 space-y-4 p-4 sm:p-6 lg:space-y-6 lg:p-8">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-32 items-center justify-center"
                  >
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    {children}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Layout>
      </div>
    )
  }
)
DashboardLayout.displayName = "DashboardLayout"

// Page Layout Component
export interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  actions?: React.ReactNode
  breadcrumbs?: React.ReactNode
  sidebar?: React.ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full"
  spacing?: "none" | "sm" | "default" | "lg"
}

const PageLayout = React.forwardRef<HTMLDivElement, PageLayoutProps>(
  ({
    className,
    title,
    description,
    actions,
    breadcrumbs,
    sidebar,
    maxWidth = "full",
    spacing = "default",
    children,
    ...props
  }, ref) => {
    const maxWidthClasses = {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
      full: "max-w-none",
    }

    const spacingClasses = {
      none: "",
      sm: "space-y-3 sm:space-y-4",
      default: "space-y-4 sm:space-y-6",
      lg: "space-y-6 sm:space-y-8",
    }

    return (
      <div
        ref={ref}
        className={cn("flex flex-1 flex-col", className)}
        {...props}
      >
        <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", maxWidthClasses[maxWidth])}>
          {breadcrumbs && (
            <div className="mb-4 sm:mb-6">
              {breadcrumbs}
            </div>
          )}

          {(title || description || actions) && (
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0 flex-1">
                  {title && (
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight truncate">
                      {title}
                    </h1>
                  )}
                  {description && (
                    <p className="text-sm sm:text-base text-muted-foreground">
                      {description}
                    </p>
                  )}
                </div>
                {actions && (
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={cn("flex flex-col lg:flex-row gap-4 lg:gap-6", sidebar && "")}>
            {sidebar && (
              <aside className="w-full lg:w-64 lg:shrink-0 order-2 lg:order-1">
                {sidebar}
              </aside>
            )}
            <div className={cn("flex-1 order-1 lg:order-2", spacingClasses[spacing])}>
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }
)
PageLayout.displayName = "PageLayout"

// Container Component
export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full"
  padding?: "none" | "sm" | "default" | "lg"
  center?: boolean
}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = "xl", padding = "default", center = true, children, ...props }, ref) => {
    const sizeClasses = {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
      full: "max-w-none",
    }

    const paddingClasses = {
      none: "",
      sm: "px-4",
      default: "px-4 md:px-6",
      lg: "px-4 md:px-8",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "w-full",
          sizeClasses[size],
          paddingClasses[padding],
          center && "mx-auto",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Container.displayName = "Container"

// Grid Layout Component
export interface GridLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12
  gap?: "none" | "sm" | "default" | "lg"
  responsive?: boolean
}

const GridLayout = React.forwardRef<HTMLDivElement, GridLayoutProps>(
  ({ className, cols = 1, gap = "default", responsive = true, children, ...props }, ref) => {
    const colsClasses = {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
      12: "grid-cols-12",
    }

    const gapClasses = {
      none: "gap-0",
      sm: "gap-2 sm:gap-3",
      default: "gap-3 sm:gap-4 lg:gap-6",
      lg: "gap-4 sm:gap-6 lg:gap-8",
    }

    const responsiveClasses = responsive ? {
      1: "grid-cols-1",
      2: "grid-cols-1 sm:grid-cols-2",
      3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
      6: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
      12: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12",
    } : colsClasses

    return (
      <div
        ref={ref}
        className={cn(
          "grid w-full",
          responsive ? responsiveClasses[cols] : colsClasses[cols],
          gapClasses[gap],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
GridLayout.displayName = "GridLayout"

// Stack Layout Component
export interface StackLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column"
  spacing?: "none" | "xs" | "sm" | "default" | "lg" | "xl"
  align?: "start" | "center" | "end" | "stretch"
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly"
  wrap?: boolean
}

const StackLayout = React.forwardRef<HTMLDivElement, StackLayoutProps>(
  ({
    className,
    direction = "column",
    spacing = "default",
    align = "stretch",
    justify = "start",
    wrap = false,
    children,
    ...props
  }, ref) => {
    const directionClasses = {
      row: "flex-row",
      column: "flex-col",
    }

    const spacingClasses = {
      none: "",
      xs: direction === "row" ? "space-x-1" : "space-y-1",
      sm: direction === "row" ? "space-x-2" : "space-y-2",
      default: direction === "row" ? "space-x-4" : "space-y-4",
      lg: direction === "row" ? "space-x-6" : "space-y-6",
      xl: direction === "row" ? "space-x-8" : "space-y-8",
    }

    const alignClasses = {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    }

    const justifyClasses = {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex",
          directionClasses[direction],
          spacingClasses[spacing],
          alignClasses[align],
          justifyClasses[justify],
          wrap && "flex-wrap",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
StackLayout.displayName = "StackLayout"

export {
  Layout,
  DashboardLayout,
  PageLayout,
  Container,
  GridLayout,
  StackLayout,
  layoutVariants,
}