"use client";
import * as React from "react";
import { cva } from "class-variance-authority";
import { Eye, EyeOff, Search, X } from "lucide-react";
import { cn } from "../utils/cn";
import { Button } from "./button";
const inputVariants = cva("flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", {
    variants: {
        variant: {
            default: "",
            ghost: "border-transparent bg-transparent",
            filled: "bg-muted border-transparent",
        },
        inputSize: {
            default: "h-10",
            sm: "h-9 text-xs",
            lg: "h-11",
            xl: "h-12 text-base",
        },
    },
    defaultVariants: {
        variant: "default",
        inputSize: "default",
    },
});
const Input = React.forwardRef(({ className, type, variant, inputSize, icon, iconPosition = "left", clearable = false, onClear, value, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";
    const inputType = isPassword && showPassword ? "text" : type;
    const hasValue = value !== undefined && value !== "";
    const showClearButton = clearable && hasValue && onClear;
    return (<div className="relative">
        {icon && iconPosition === "left" && (<div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>)}

        <input type={inputType} className={cn(inputVariants({ variant, inputSize }), icon && iconPosition === "left" && "pl-10", (icon && iconPosition === "right") || isPassword || showClearButton
            ? "pr-10"
            : "", className)} ref={ref} value={value} {...props}/>

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {showClearButton && (<Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground" onClick={onClear}>
              <X className="h-3 w-3"/>
            </Button>)}

          {isPassword && (<Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? (<EyeOff className="h-3 w-3"/>) : (<Eye className="h-3 w-3"/>)}
            </Button>)}

          {icon && iconPosition === "right" && !isPassword && !showClearButton && (<div className="text-muted-foreground">{icon}</div>)}
        </div>
      </div>);
});
Input.displayName = "Input";
const SearchInput = React.forwardRef(({ onSearch, placeholder = "Search...", ...props }, ref) => {
    const [value, setValue] = React.useState("");
    const handleChange = (e) => {
        const newValue = e.target.value;
        setValue(newValue);
        onSearch?.(newValue);
    };
    const handleClear = () => {
        setValue("");
        onSearch?.("");
    };
    return (<Input ref={ref} type="search" value={value} onChange={handleChange} placeholder={placeholder} icon={<Search className="h-4 w-4"/>} iconPosition="left" clearable onClear={handleClear} {...props}/>);
});
SearchInput.displayName = "SearchInput";
const Textarea = React.forwardRef(({ className, variant, resize = true, ...props }, ref) => {
    return (<textarea className={cn(inputVariants({ variant }), "min-h-[80px]", !resize && "resize-none", className)} ref={ref} {...props}/>);
});
Textarea.displayName = "Textarea";
export { Input, SearchInput, Textarea, inputVariants };
//# sourceMappingURL=input.js.map