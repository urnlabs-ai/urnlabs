"use client";
import * as React from "react";
import { cva } from "class-variance-authority";
import { ChevronRight, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../utils/cn";
import { Badge } from "./badge";
const navigationVariants = cva("flex items-center", {
    variants: {
        orientation: {
            horizontal: "flex-row space-x-1",
            vertical: "flex-col space-y-1",
        },
        variant: {
            default: "",
            pills: "space-x-2",
            tabs: "border-b border-border",
            breadcrumb: "space-x-1",
        },
    },
    defaultVariants: {
        orientation: "horizontal",
        variant: "default",
    },
});
const Navigation = React.forwardRef(({ className, orientation, variant, items, onItemClick, ...props }, ref) => {
    return (<nav ref={ref} className={cn(navigationVariants({ orientation, variant }), className)} {...props}>
        {items.map((item, index) => (<NavigationItemComponent key={index} item={item} variant={variant} orientation={orientation} onItemClick={onItemClick}/>))}
      </nav>);
});
Navigation.displayName = "Navigation";
const NavigationItemComponent = ({ item, variant, orientation, onItemClick, depth = 0, }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const hasChildren = item.children && item.children.length > 0;
    const handleClick = () => {
        if (hasChildren) {
            setIsOpen(!isOpen);
        }
        else {
            onItemClick?.(item);
            item.onClick?.();
        }
    };
    const getItemClasses = () => {
        const baseClasses = [
            "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ];
        if (item.disabled) {
            baseClasses.push("pointer-events-none opacity-50");
        }
        if (item.active) {
            baseClasses.push("bg-accent text-accent-foreground");
        }
        switch (variant) {
            case "pills":
                if (item.active) {
                    baseClasses.push("bg-primary text-primary-foreground hover:bg-primary/90");
                }
                break;
            case "tabs":
                baseClasses.push("border-b-2 border-transparent rounded-none");
                if (item.active) {
                    baseClasses.push("border-primary bg-transparent text-primary");
                }
                break;
            case "breadcrumb":
                baseClasses.push("hover:underline p-0 h-auto font-normal");
                break;
        }
        return cn(baseClasses);
    };
    const content = (<>
      {item.icon && (<span className="flex-shrink-0">
          {item.icon}
        </span>)}
      <span className={cn("truncate", variant === "breadcrumb" && "text-muted-foreground hover:text-foreground")}>
        {item.label}
      </span>
      {item.badge && (<Badge variant="secondary" size="sm">
          {item.badge}
        </Badge>)}
      {item.external && (<ExternalLink className="h-3 w-3 opacity-50"/>)}
      {hasChildren && variant !== "breadcrumb" && (<motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight className="h-4 w-4"/>
        </motion.div>)}
    </>);
    const element = item.href ? (<a href={item.href} className={getItemClasses()} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={handleClick}>
      {content}
    </a>) : (<button type="button" className={getItemClasses()} onClick={handleClick} disabled={item.disabled}>
      {content}
    </button>);
    if (variant === "breadcrumb") {
        return (<>
        {element}
        {hasChildren && item.children && (<>
            <ChevronRight className="h-4 w-4 text-muted-foreground"/>
            {/* For breadcrumbs, we'd typically show the next level directly */}
          </>)}
      </>);
    }
    return (<div className={cn(orientation === "vertical" ? "w-full" : "")}>
      {element}
      {hasChildren && (<AnimatePresence>
          {isOpen && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className={cn("pl-6 pt-1 space-y-1", orientation === "horizontal" && "absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-lg")}>
                {item.children?.map((child, index) => (<NavigationItemComponent key={index} item={child} variant={variant} orientation={orientation} onItemClick={onItemClick} depth={depth + 1}/>))}
              </div>
            </motion.div>)}
        </AnimatePresence>)}
    </div>);
};
const BreadcrumbNavigation = React.forwardRef(({ items, separator = <ChevronRight className="h-4 w-4"/>, className, ...props }, ref) => {
    return (<nav ref={ref} aria-label="Breadcrumb" className={cn("flex items-center space-x-1 text-sm", className)} {...props}>
        {items.map((item, index) => (<React.Fragment key={index}>
            {index > 0 && (<span className="text-muted-foreground">{separator}</span>)}
            <NavigationItemComponent item={item} variant="breadcrumb" orientation="horizontal"/>
          </React.Fragment>))}
      </nav>);
});
BreadcrumbNavigation.displayName = "BreadcrumbNavigation";
const TabNavigation = React.forwardRef(({ items, value, onValueChange, className, ...props }, ref) => {
    const enhancedItems = items.map(item => ({
        ...item,
        active: value ? item.href === value : item.active,
    }));
    const handleItemClick = (item) => {
        if (item.href) {
            onValueChange?.(item.href);
        }
    };
    return (<Navigation ref={ref} items={enhancedItems} variant="tabs" orientation="horizontal" onItemClick={handleItemClick} className={className} {...props}/>);
});
TabNavigation.displayName = "TabNavigation";
const SidebarNavigation = React.forwardRef(({ items, collapsible = true, defaultExpanded = [], className, ...props }, ref) => {
    return (<Navigation ref={ref} items={items} variant="default" orientation="vertical" className={cn("w-full space-y-1", className)} {...props}/>);
});
SidebarNavigation.displayName = "SidebarNavigation";
// Top Navigation (Horizontal with dropdowns)
const TopNavigation = React.forwardRef(({ items, className, ...props }, ref) => {
    return (<Navigation ref={ref} items={items} variant="default" orientation="horizontal" className={cn("space-x-1", className)} {...props}/>);
});
TopNavigation.displayName = "TopNavigation";
// Pill Navigation
const PillNavigation = React.forwardRef(({ items, className, ...props }, ref) => {
    return (<Navigation ref={ref} items={items} variant="pills" orientation="horizontal" className={cn("space-x-2", className)} {...props}/>);
});
PillNavigation.displayName = "PillNavigation";
export { Navigation, BreadcrumbNavigation, TabNavigation, SidebarNavigation, TopNavigation, PillNavigation, navigationVariants, };
//# sourceMappingURL=navigation.js.map