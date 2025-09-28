"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../utils/cn"

// Responsive Show/Hide Components
const responsiveVariants = cva("", {
  variants: {
    show: {
      xs: "block xs:hidden",
      sm: "hidden sm:block md:hidden",
      md: "hidden md:block lg:hidden",
      lg: "hidden lg:block xl:hidden",
      xl: "hidden xl:block 2xl:hidden",
      "2xl": "hidden 2xl:block",
      "xs-up": "block",
      "sm-up": "hidden sm:block",
      "md-up": "hidden md:block",
      "lg-up": "hidden lg:block",
      "xl-up": "hidden xl:block",
      "2xl-up": "hidden 2xl:block",
      "xs-down": "block xs:hidden",
      "sm-down": "block sm:hidden",
      "md-down": "block md:hidden",
      "lg-down": "block lg:hidden",
      "xl-down": "block xl:hidden",
    },
    hide: {
      xs: "hidden xs:block",
      sm: "block sm:hidden md:block",
      md: "block md:hidden lg:block",
      lg: "block lg:hidden xl:block",
      xl: "block xl:hidden 2xl:block",
      "2xl": "block 2xl:hidden",
      "xs-up": "hidden",
      "sm-up": "block sm:hidden",
      "md-up": "block md:hidden",
      "lg-up": "block lg:hidden",
      "xl-up": "block xl:hidden",
      "2xl-up": "block 2xl:hidden",
      "xs-down": "hidden xs:block",
      "sm-down": "hidden sm:block",
      "md-down": "hidden md:block",
      "lg-down": "hidden lg:block",
      "xl-down": "hidden xl:block",
    },
  },
})

export interface ResponsiveProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof responsiveVariants> {
  show?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "xs-up" | "sm-up" | "md-up" | "lg-up" | "xl-up" | "2xl-up" | "xs-down" | "sm-down" | "md-down" | "lg-down" | "xl-down"
  hide?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "xs-up" | "sm-up" | "md-up" | "lg-up" | "xl-up" | "2xl-up" | "xs-down" | "sm-down" | "md-down" | "lg-down" | "xl-down"
  as?: React.ElementType
}

const Responsive = React.forwardRef<HTMLDivElement, ResponsiveProps>(
  ({ className, show, hide, as: Component = "div", children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn(
          responsiveVariants({ show, hide }),
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
Responsive.displayName = "Responsive"

// Mobile-First Components
const MobileOnly = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }
>(({ className, as: Component = "div", children, ...props }, ref) => {
  return (
    <Component
      ref={ref}
      className={cn("block sm:hidden", className)}
      {...props}
    >
      {children}
    </Component>
  )
})
MobileOnly.displayName = "MobileOnly"

const TabletOnly = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }
>(({ className, as: Component = "div", children, ...props }, ref) => {
  return (
    <Component
      ref={ref}
      className={cn("hidden sm:block lg:hidden", className)}
      {...props}
    >
      {children}
    </Component>
  )
})
TabletOnly.displayName = "TabletOnly"

const DesktopOnly = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }
>(({ className, as: Component = "div", children, ...props }, ref) => {
  return (
    <Component
      ref={ref}
      className={cn("hidden lg:block", className)}
      {...props}
    >
      {children}
    </Component>
  )
})
DesktopOnly.displayName = "DesktopOnly"

const MobileUp = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }
>(({ className, as: Component = "div", children, ...props }, ref) => {
  return (
    <Component
      ref={ref}
      className={cn("block", className)}
      {...props}
    >
      {children}
    </Component>
  )
})
MobileUp.displayName = "MobileUp"

const TabletUp = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }
>(({ className, as: Component = "div", children, ...props }, ref) => {
  return (
    <Component
      ref={ref}
      className={cn("hidden sm:block", className)}
      {...props}
    >
      {children}
    </Component>
  )
})
TabletUp.displayName = "TabletUp"

const DesktopUp = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }
>(({ className, as: Component = "div", children, ...props }, ref) => {
  return (
    <Component
      ref={ref}
      className={cn("hidden lg:block", className)}
      {...props}
    >
      {children}
    </Component>
  )
})
DesktopUp.displayName = "DesktopUp"

// Responsive Spacing Component
export interface ResponsiveSpacingProps extends React.HTMLAttributes<HTMLDivElement> {
  mobile?: "xs" | "sm" | "md" | "lg" | "xl"
  tablet?: "xs" | "sm" | "md" | "lg" | "xl"
  desktop?: "xs" | "sm" | "md" | "lg" | "xl"
  direction?: "horizontal" | "vertical" | "all"
}

const ResponsiveSpacing = React.forwardRef<HTMLDivElement, ResponsiveSpacingProps>(
  ({ className, mobile = "md", tablet = "lg", desktop = "xl", direction = "all", children, ...props }, ref) => {
    const spacingClasses = {
      xs: "2",
      sm: "4",
      md: "6",
      lg: "8",
      xl: "12",
    }

    const getSpacingClass = (size: string, breakpoint: string) => {
      const value = spacingClasses[size as keyof typeof spacingClasses]
      const prefix = breakpoint === "mobile" ? "" : `${breakpoint === "tablet" ? "sm" : "lg"}:`

      switch (direction) {
        case "horizontal":
          return `${prefix}px-${value}`
        case "vertical":
          return `${prefix}py-${value}`
        default:
          return `${prefix}p-${value}`
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          getSpacingClass(mobile, "mobile"),
          getSpacingClass(tablet, "tablet"),
          getSpacingClass(desktop, "desktop"),
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ResponsiveSpacing.displayName = "ResponsiveSpacing"

// Responsive Grid Component
export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  mobile?: 1 | 2 | 3 | 4
  tablet?: 1 | 2 | 3 | 4 | 6
  desktop?: 1 | 2 | 3 | 4 | 6 | 8 | 12
  gap?: "xs" | "sm" | "md" | "lg" | "xl"
}

const ResponsiveGrid = React.forwardRef<HTMLDivElement, ResponsiveGridProps>(
  ({ className, mobile = 1, tablet = 2, desktop = 3, gap = "md", children, ...props }, ref) => {
    const gapClasses = {
      xs: "gap-1",
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
      xl: "gap-8",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "grid",
          `grid-cols-${mobile}`,
          `sm:grid-cols-${tablet}`,
          `lg:grid-cols-${desktop}`,
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
ResponsiveGrid.displayName = "ResponsiveGrid"

// Hook for responsive values
export const useResponsiveValue = <T,>(values: {
  mobile: T
  tablet?: T
  desktop?: T
}): T => {
  const [value, setValue] = React.useState<T>(values.mobile)

  React.useEffect(() => {
    const updateValue = () => {
      if (window.innerWidth >= 1024 && values.desktop !== undefined) {
        setValue(values.desktop)
      } else if (window.innerWidth >= 640 && values.tablet !== undefined) {
        setValue(values.tablet)
      } else {
        setValue(values.mobile)
      }
    }

    updateValue()
    window.addEventListener("resize", updateValue)
    return () => window.removeEventListener("resize", updateValue)
  }, [values])

  return value
}

// Hook for media queries
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)

    const listener = () => setMatches(media.matches)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [query])

  return matches
}

// Common breakpoint hooks
export const useIsMobile = () => useMediaQuery("(max-width: 639px)")
export const useIsTablet = () => useMediaQuery("(min-width: 640px) and (max-width: 1023px)")
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)")
export const useIsTabletUp = () => useMediaQuery("(min-width: 640px)")
export const useIsDesktopUp = () => useMediaQuery("(min-width: 1024px)")

export {
  Responsive,
  MobileOnly,
  TabletOnly,
  DesktopOnly,
  MobileUp,
  TabletUp,
  DesktopUp,
  ResponsiveSpacing,
  ResponsiveGrid,
  responsiveVariants,
}