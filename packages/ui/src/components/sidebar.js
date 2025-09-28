"use client";
import * as React from "react";
import { cva } from "class-variance-authority";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../utils/cn";
import { Button } from "./button";
const sidebarVariants = cva("flex flex-col border-r border-border bg-background transition-all duration-300 ease-in-out", {
    variants: {
        variant: {
            default: "bg-background",
            ghost: "bg-transparent border-r-0",
            floating: "bg-card shadow-md rounded-lg m-2 border",
        },
        size: {
            sm: "w-56",
            default: "w-64",
            lg: "w-72",
            xl: "w-80",
        },
        collapsed: {
            true: "w-16",
            false: "",
        },
        position: {
            left: "left-0",
            right: "right-0",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
        collapsed: false,
        position: "left",
    },
});
const SidebarContext = React.createContext(null);
const useSidebar = () => {
    const context = React.useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
};
const Sidebar = React.forwardRef(({ className, variant, size, position, defaultCollapsed = false, collapsible = true, onCollapsedChange, children, ...props }, ref) => {
    const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
    const [mobile, setMobile] = React.useState(false);
    React.useEffect(() => {
        const checkMobile = () => setMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);
    const handleCollapsedChange = (newCollapsed) => {
        setCollapsed(newCollapsed);
        onCollapsedChange?.(newCollapsed);
    };
    const contextValue = {
        collapsed: mobile ? false : collapsed,
        setCollapsed: handleCollapsedChange,
        variant: variant || "default",
        mobile,
        setMobile,
    };
    if (mobile) {
        return (<SidebarContext.Provider value={contextValue}>
          <AnimatePresence>
            {!collapsed && (<>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => handleCollapsedChange(true)}/>
                <motion.div ref={ref} initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className={cn("fixed inset-y-0 z-50 md:hidden", sidebarVariants({ variant, size: "default", position }), className)} {...props}>
                  {children}
                </motion.div>
              </>)}
          </AnimatePresence>
        </SidebarContext.Provider>);
    }
    return (<SidebarContext.Provider value={contextValue}>
        <motion.div ref={ref} layout className={cn(sidebarVariants({ variant, size, collapsed, position }), className)} {...props}>
          {children}
        </motion.div>
      </SidebarContext.Provider>);
});
Sidebar.displayName = "Sidebar";
const SidebarHeader = React.forwardRef(({ className, sticky = true, children, ...props }, ref) => {
    const { collapsed } = useSidebar();
    return (<div ref={ref} className={cn("flex h-16 items-center border-b border-border px-4", sticky && "sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", className)} {...props}>
      <AnimatePresence mode="wait">
        {collapsed ? (<motion.div key="collapsed" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex w-full justify-center">
            {React.isValidElement(children) && React.cloneElement(children, {
                className: "h-8 w-8"
            })}
          </motion.div>) : (<motion.div key="expanded" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex w-full items-center">
            {children}
          </motion.div>)}
      </AnimatePresence>
    </div>);
});
SidebarHeader.displayName = "SidebarHeader";
const SidebarContent = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<div ref={ref} className={cn("flex-1 overflow-auto", className)} {...props}>
      <ScrollArea className="h-full px-3 py-2">
        {children}
      </ScrollArea>
    </div>);
});
SidebarContent.displayName = "SidebarContent";
const SidebarFooter = React.forwardRef(({ className, sticky = true, children, ...props }, ref) => {
    return (<div ref={ref} className={cn("border-t border-border p-4", sticky && "sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", className)} {...props}>
      {children}
    </div>);
});
SidebarFooter.displayName = "SidebarFooter";
const SidebarNav = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<nav ref={ref} className={cn("space-y-1", className)} {...props}>
      {children}
    </nav>);
});
SidebarNav.displayName = "SidebarNav";
const SidebarNavItem = React.forwardRef(({ className, active, icon, badge, disabled, children, ...props }, ref) => {
    const { collapsed } = useSidebar();
    return (<a ref={ref} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", "hover:bg-accent hover:text-accent-foreground", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent text-accent-foreground", disabled && "pointer-events-none opacity-50", className)} {...props}>
      {icon && (<span className="flex-shrink-0">
          {icon}
        </span>)}
      <AnimatePresence mode="wait">
        {!collapsed && (<motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-1 items-center justify-between">
            <span className="truncate">{children}</span>
            {badge && (<span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {badge}
              </span>)}
          </motion.div>)}
      </AnimatePresence>
    </a>);
});
SidebarNavItem.displayName = "SidebarNavItem";
const SidebarNavGroup = React.forwardRef(({ className, title, children, ...props }, ref) => {
    const { collapsed } = useSidebar();
    return (<div ref={ref} className={cn("space-y-2", className)} {...props}>
      {title && !collapsed && (<motion.h4 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </motion.h4>)}
      <div className="space-y-1">
        {children}
      </div>
    </div>);
});
SidebarNavGroup.displayName = "SidebarNavGroup";
const SidebarToggle = React.forwardRef(({ className, variant = "ghost", size = "default", ...props }, ref) => {
    const { collapsed, setCollapsed, mobile } = useSidebar();
    if (mobile) {
        return (<Button ref={ref} variant={variant} size={size} className={cn("md:hidden", className)} onClick={() => setCollapsed(!collapsed)} {...props}>
        {collapsed ? <Menu className="h-4 w-4"/> : <X className="h-4 w-4"/>}
      </Button>);
    }
    return (<Button ref={ref} variant={variant} size={size} className={cn("hidden md:flex", className)} onClick={() => setCollapsed(!collapsed)} {...props}>
      {collapsed ? (<ChevronRight className="h-4 w-4"/>) : (<ChevronLeft className="h-4 w-4"/>)}
    </Button>);
});
SidebarToggle.displayName = "SidebarToggle";
// Scroll Area Component (simplified version)
const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<div ref={ref} className={cn("overflow-auto scrollbar-thin", className)} {...props}>
      {children}
    </div>);
});
ScrollArea.displayName = "ScrollArea";
export { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarNav, SidebarNavItem, SidebarNavGroup, SidebarToggle, useSidebar, sidebarVariants, };
//# sourceMappingURL=sidebar.js.map