"use client";
import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva } from "class-variance-authority";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../utils/cn";
import { toast as toastAnimation } from "../utils/animations";
const ToastProvider = ToastPrimitives.Provider;
const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (<ToastPrimitives.Viewport ref={ref} className={cn("fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]", className)} {...props}/>));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;
const toastVariants = cva("group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full", {
    variants: {
        variant: {
            default: "border bg-background text-foreground",
            destructive: "destructive border-destructive bg-destructive text-destructive-foreground",
            success: "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
            warning: "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100",
            info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
const Toast = React.forwardRef(({ className, variant, animated = true, ...props }, ref) => {
    if (animated) {
        return (<ToastPrimitives.Root ref={ref} asChild className={cn(toastVariants({ variant }), className)} {...props}>
        <motion.div variants={toastAnimation} initial="initial" animate="animate" exit="exit" layout/>
      </ToastPrimitives.Root>);
    }
    return (<ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props}/>);
});
Toast.displayName = ToastPrimitives.Root.displayName;
const ToastAction = React.forwardRef(({ className, ...props }, ref) => (<ToastPrimitives.Action ref={ref} className={cn("inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive", className)} {...props}/>));
ToastAction.displayName = ToastPrimitives.Action.displayName;
const ToastClose = React.forwardRef(({ className, ...props }, ref) => (<ToastPrimitives.Close ref={ref} className={cn("absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600", className)} toast-close="" {...props}>
    <X className="h-4 w-4"/>
  </ToastPrimitives.Close>));
ToastClose.displayName = ToastPrimitives.Close.displayName;
const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (<ToastPrimitives.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props}/>));
ToastTitle.displayName = ToastPrimitives.Title.displayName;
const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (<ToastPrimitives.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props}/>));
ToastDescription.displayName = ToastPrimitives.Description.displayName;
const ToastContext = React.createContext(null);
const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 1000000;
function ToastContextProvider({ children }) {
    const [toasts, setToasts] = React.useState([]);
    const addToast = React.useCallback((toast) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { ...toast, id };
        setToasts((prev) => {
            const newToasts = [newToast, ...prev].slice(0, TOAST_LIMIT);
            return newToasts;
        });
        if (toast.duration !== Infinity) {
            setTimeout(() => {
                removeToast(id);
            }, toast.duration || 5000);
        }
    }, []);
    const removeToast = React.useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);
    const removeAllToasts = React.useCallback(() => {
        setToasts([]);
    }, []);
    return (<ToastContext.Provider value={{ toasts, addToast, removeToast, removeAllToasts }}>
      {children}
    </ToastContext.Provider>);
}
function useToast() {
    const context = React.useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastContextProvider");
    }
    return context;
}
// Pre-built toast functions
function createToastFunction(variant) {
    return (toast) => {
        const { addToast } = useToast();
        addToast({ ...toast, variant });
    };
}
const toast = {
    default: (toast) => {
        const { addToast } = useToast();
        addToast({ ...toast, variant: "default" });
    },
    success: (toast) => {
        const { addToast } = useToast();
        addToast({ ...toast, variant: "success" });
    },
    error: (toast) => {
        const { addToast } = useToast();
        addToast({ ...toast, variant: "destructive" });
    },
    warning: (toast) => {
        const { addToast } = useToast();
        addToast({ ...toast, variant: "warning" });
    },
    info: (toast) => {
        const { addToast } = useToast();
        addToast({ ...toast, variant: "info" });
    },
};
const EnhancedToast = React.forwardRef(({ icon, title, description, showClose = true, variant, children, ...props }, ref) => {
    const getDefaultIcon = () => {
        switch (variant) {
            case "success":
                return <CheckCircle className="h-5 w-5"/>;
            case "destructive":
                return <AlertCircle className="h-5 w-5"/>;
            case "warning":
                return <AlertTriangle className="h-5 w-5"/>;
            case "info":
                return <Info className="h-5 w-5"/>;
            default:
                return null;
        }
    };
    const displayIcon = icon !== undefined ? icon : getDefaultIcon();
    return (<Toast ref={ref} variant={variant} {...props}>
        <div className="flex items-start gap-3">
          {displayIcon && <div className="flex-shrink-0 mt-0.5">{displayIcon}</div>}
          <div className="flex-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
            {children}
          </div>
        </div>
        {showClose && <ToastClose />}
      </Toast>);
});
EnhancedToast.displayName = "EnhancedToast";
// Toaster component to render all toasts
function Toaster() {
    const { toasts } = useToast();
    return (<ToastProvider>
      <AnimatePresence>
        {toasts.map((toast) => (<EnhancedToast key={toast.id} variant={toast.variant} title={toast.title} description={toast.description}>
            {toast.action}
          </EnhancedToast>))}
      </AnimatePresence>
      <ToastViewport />
    </ToastProvider>);
}
export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction, ToastContextProvider, EnhancedToast, Toaster, useToast, toast, };
//# sourceMappingURL=toast.js.map