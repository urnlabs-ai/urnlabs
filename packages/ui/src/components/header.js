"use client";
import * as React from "react";
import { cva } from "class-variance-authority";
import { Search, Bell, User, Settings, LogOut, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";
import { Button } from "./button";
import { Input } from "./input";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import { Separator } from "./separator";
const headerVariants = cva("sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", {
    variants: {
        variant: {
            default: "bg-background/95",
            transparent: "bg-transparent border-b-0",
            solid: "bg-background",
            glass: "bg-background/80 backdrop-blur-md",
        },
        size: {
            sm: "h-12",
            default: "h-16",
            lg: "h-20",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
const Header = React.forwardRef(({ className, variant, size, children, ...props }, ref) => {
    return (<header ref={ref} className={cn(headerVariants({ variant, size }), className)} {...props}>
      <div className="flex h-full items-center px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </header>);
});
Header.displayName = "Header";
const HeaderLeft = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<div ref={ref} className={cn("flex items-center gap-2 sm:gap-4", className)} {...props}>
      {children}
    </div>);
});
HeaderLeft.displayName = "HeaderLeft";
const HeaderCenter = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<div ref={ref} className={cn("flex flex-1 items-center justify-center px-2 sm:px-4", className)} {...props}>
      {children}
    </div>);
});
HeaderCenter.displayName = "HeaderCenter";
const HeaderRight = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<div ref={ref} className={cn("flex items-center gap-1 sm:gap-2", className)} {...props}>
      {children}
    </div>);
});
HeaderRight.displayName = "HeaderRight";
const HeaderLogo = React.forwardRef(({ className, src, alt = "Logo", href, collapsed, children, ...props }, ref) => {
    const content = src ? (<img src={src} alt={alt} className="h-8 w-auto"/>) : (children);
    const logoContent = (<div ref={ref} className={cn("flex items-center gap-2", className)} {...props}>
        {content}
        {!collapsed && children && src && (<motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-lg font-semibold">
            {children}
          </motion.div>)}
      </div>);
    if (href) {
        return (<a href={href} className="focus:outline-none focus:ring-2 focus:ring-ring rounded-md">
          {logoContent}
        </a>);
    }
    return logoContent;
});
HeaderLogo.displayName = "HeaderLogo";
const HeaderSearch = React.forwardRef(({ placeholder = "Search...", value, onChange, onSubmit, className, shortcuts = true, ...props }, ref) => {
    const [searchValue, setSearchValue] = React.useState(value || "");
    React.useEffect(() => {
        if (value !== undefined) {
            setSearchValue(value);
        }
    }, [value]);
    const handleChange = (e) => {
        const newValue = e.target.value;
        setSearchValue(newValue);
        onChange?.(newValue);
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit?.(searchValue);
    };
    React.useEffect(() => {
        if (shortcuts) {
            const handleKeyDown = (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                    e.preventDefault();
                    ref && typeof ref !== "function" && ref.current?.focus();
                }
            };
            document.addEventListener("keydown", handleKeyDown);
            return () => document.removeEventListener("keydown", handleKeyDown);
        }
    }, [shortcuts, ref]);
    return (<form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <Input ref={ref} type="search" placeholder={placeholder} value={searchValue} onChange={handleChange} className={cn("pl-9 pr-4 w-full sm:w-64 md:w-80 lg:w-96", shortcuts && "pr-16", className)} {...props}/>
        {shortcuts && (<div className="absolute right-3 top-1/2 -translate-y-1/2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>)}
      </form>);
});
HeaderSearch.displayName = "HeaderSearch";
const HeaderNotifications = React.forwardRef(({ className, count = 0, showBadge = true, maxCount = 99, ...props }, ref) => {
    const displayCount = count > maxCount ? `${maxCount}+` : count.toString();
    return (<Button ref={ref} variant="ghost" size="icon" className={cn("relative", className)} {...props}>
        <Bell className="h-5 w-5"/>
        {showBadge && count > 0 && (<Badge variant="destructive" className="absolute -right-1 -top-1 h-5 min-w-[20px] rounded-full px-1 text-xs">
            {displayCount}
          </Badge>)}
        <span className="sr-only">Notifications ({count})</span>
      </Button>);
});
HeaderNotifications.displayName = "HeaderNotifications";
const HeaderUserMenu = React.forwardRef(({ user, menuItems = [], onSignOut, className, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const defaultMenuItems = [
        { label: "Profile", icon: <User className="h-4 w-4"/> },
        { label: "Settings", icon: <Settings className="h-4 w-4"/> },
        { separator: true },
        { label: "Sign Out", icon: <LogOut className="h-4 w-4"/>, onClick: onSignOut },
    ];
    const items = menuItems.length > 0 ? menuItems : defaultMenuItems;
    return (<div className="relative">
        <Button ref={ref} variant="ghost" className={cn("flex items-center gap-2 px-2", className)} onClick={() => setIsOpen(!isOpen)} {...props}>
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatar} alt={user?.name}/>
            <AvatarFallback>
              {user?.initials || user?.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium truncate max-w-24 lg:max-w-none">{user?.name || "User"}</div>
            <div className="text-xs text-muted-foreground truncate max-w-24 lg:max-w-none">{user?.email}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block"/>
        </Button>

        {/* Dropdown Menu (you'd typically use a proper dropdown component here) */}
        {isOpen && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border bg-popover p-1 shadow-lg">
            {items.map((item, index) => {
                if (item.separator) {
                    return <Separator key={index} className="my-1"/>;
                }
                return (<button key={index} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent focus:bg-accent" onClick={() => {
                        item.onClick?.();
                        setIsOpen(false);
                    }}>
                  {item.icon}
                  {item.label}
                </button>);
            })}
          </motion.div>)}
      </div>);
});
HeaderUserMenu.displayName = "HeaderUserMenu";
const HeaderBreadcrumbs = React.forwardRef(({ items, separator = "/", className, ...props }, ref) => {
    // Show only last 2 items on mobile, all on larger screens
    const displayItems = React.useMemo(() => {
        if (items.length <= 2)
            return items;
        // On mobile, show first and last item with ellipsis
        const mobileItems = [
            items[0],
            { label: "...", active: false },
            items[items.length - 1]
        ];
        return { mobile: mobileItems, desktop: items };
    }, [items]);
    return (<nav ref={ref} aria-label="Breadcrumb" className={cn("flex items-center space-x-1 text-sm overflow-hidden", className)} {...props}>
        {/* Mobile breadcrumbs */}
        <div className="flex items-center space-x-1 sm:hidden">
          {(typeof displayItems === 'object' && 'mobile' in displayItems ? displayItems.mobile : displayItems).map((item, index) => (<React.Fragment key={index}>
              {index > 0 && (<span className="text-muted-foreground">{separator}</span>)}
              {item.href && !item.active ? (<a href={item.href} className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-20">
                  {item.label}
                </a>) : (<span className={cn("truncate max-w-20", item.active ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {item.label}
                </span>)}
            </React.Fragment>))}
        </div>

        {/* Desktop breadcrumbs */}
        <div className="hidden sm:flex items-center space-x-1">
          {(typeof displayItems === 'object' && 'desktop' in displayItems ? displayItems.desktop : displayItems).map((item, index) => (<React.Fragment key={index}>
              {index > 0 && (<span className="text-muted-foreground">{separator}</span>)}
              {item.href && !item.active ? (<a href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                  {item.label}
                </a>) : (<span className={cn(item.active ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {item.label}
                </span>)}
            </React.Fragment>))}
        </div>
      </nav>);
});
HeaderBreadcrumbs.displayName = "HeaderBreadcrumbs";
export { Header, HeaderLeft, HeaderCenter, HeaderRight, HeaderLogo, HeaderSearch, HeaderNotifications, HeaderUserMenu, HeaderBreadcrumbs, headerVariants, };
//# sourceMappingURL=header.js.map