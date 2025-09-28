"use client";
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva } from "class-variance-authority";
import { cn } from "../utils/cn";
const avatarVariants = cva("relative flex shrink-0 overflow-hidden rounded-full", {
    variants: {
        size: {
            sm: "h-8 w-8",
            default: "h-10 w-10",
            lg: "h-12 w-12",
            xl: "h-16 w-16",
            "2xl": "h-20 w-20",
        },
    },
    defaultVariants: {
        size: "default",
    },
});
const Avatar = React.forwardRef(({ className, size, ...props }, ref) => (<AvatarPrimitive.Root ref={ref} className={cn(avatarVariants({ size }), className)} {...props}/>));
Avatar.displayName = AvatarPrimitive.Root.displayName;
const AvatarImage = React.forwardRef(({ className, ...props }, ref) => (<AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full", className)} {...props}/>));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;
const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (<AvatarPrimitive.Fallback ref={ref} className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground", className)} {...props}/>));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;
const AvatarGroup = React.forwardRef(({ className, max = 3, size = "default", spacing = "normal", children, ...props }, ref) => {
    const childArray = React.Children.toArray(children);
    const visibleChildren = childArray.slice(0, max);
    const remainingCount = childArray.length - max;
    const spacingClasses = {
        tight: "-space-x-1",
        normal: "-space-x-2",
        loose: "-space-x-1",
    };
    return (<div ref={ref} className={cn("flex items-center", spacingClasses[spacing], className)} {...props}>
        {visibleChildren.map((child, index) => React.cloneElement(child, {
            key: index,
            size,
            className: cn("border-2 border-background ring-2 ring-background", child.props.className),
        }))}
        {remainingCount > 0 && (<Avatar size={size} className="border-2 border-background ring-2 ring-background">
            <AvatarFallback className="text-xs font-medium">
              +{remainingCount}
            </AvatarFallback>
          </Avatar>)}
      </div>);
});
AvatarGroup.displayName = "AvatarGroup";
const UserAvatar = React.forwardRef(({ src, name, status, showStatus = false, size = "default", className, ...props }, ref) => {
    const getInitials = (name) => {
        return name
            .split(" ")
            .map((part) => part.charAt(0).toUpperCase())
            .join("")
            .slice(0, 2);
    };
    const statusColors = {
        online: "bg-green-500",
        offline: "bg-gray-400",
        away: "bg-yellow-500",
        busy: "bg-red-500",
    };
    const statusSizes = {
        sm: "h-2 w-2",
        default: "h-3 w-3",
        lg: "h-3 w-3",
        xl: "h-4 w-4",
        "2xl": "h-5 w-5",
    };
    return (<div className="relative">
      <Avatar ref={ref} size={size} className={className} {...props}>
        {src && <AvatarImage src={src} alt={name}/>}
        <AvatarFallback className="font-medium">
          {name ? getInitials(name) : "U"}
        </AvatarFallback>
      </Avatar>
      {showStatus && status && (<div className={cn("absolute -bottom-0 -right-0 rounded-full border-2 border-background", statusColors[status], statusSizes[size || "default"])}/>)}
    </div>);
});
UserAvatar.displayName = "UserAvatar";
export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, UserAvatar, avatarVariants };
//# sourceMappingURL=avatar.js.map