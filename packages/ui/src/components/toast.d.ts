import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { type VariantProps } from "class-variance-authority";
declare const ToastProvider: React.FC<ToastPrimitives.ToastProviderProps>;
declare const ToastViewport: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastViewportProps & React.RefAttributes<HTMLOListElement>, "ref"> & React.RefAttributes<HTMLOListElement>>;
declare const Toast: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastProps & React.RefAttributes<HTMLLIElement>, "ref"> & VariantProps<(props?: ({
    variant?: "default" | "info" | "warning" | "success" | "destructive" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
} & React.RefAttributes<HTMLLIElement>>;
declare const ToastAction: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastActionProps & React.RefAttributes<HTMLButtonElement>, "ref"> & React.RefAttributes<HTMLButtonElement>>;
declare const ToastClose: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastCloseProps & React.RefAttributes<HTMLButtonElement>, "ref"> & React.RefAttributes<HTMLButtonElement>>;
declare const ToastTitle: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastTitleProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
declare const ToastDescription: React.ForwardRefExoticComponent<Omit<ToastPrimitives.ToastDescriptionProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;
interface ToastContextType {
    toasts: ToastData[];
    addToast: (toast: Omit<ToastData, "id">) => void;
    removeToast: (id: string) => void;
    removeAllToasts: () => void;
}
export interface ToastData {
    id: string;
    title?: string;
    description?: string;
    action?: ToastActionElement;
    variant?: ToastProps["variant"];
    duration?: number;
}
declare function ToastContextProvider({ children }: {
    children: React.ReactNode;
}): React.JSX.Element;
declare function useToast(): ToastContextType;
declare const toast: {
    default: (toast: Omit<ToastData, "id" | "variant">) => void;
    success: (toast: Omit<ToastData, "id" | "variant">) => void;
    error: (toast: Omit<ToastData, "id" | "variant">) => void;
    warning: (toast: Omit<ToastData, "id" | "variant">) => void;
    info: (toast: Omit<ToastData, "id" | "variant">) => void;
};
export interface EnhancedToastProps extends ToastProps {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    showClose?: boolean;
}
declare const EnhancedToast: React.ForwardRefExoticComponent<EnhancedToastProps & React.RefAttributes<HTMLLIElement>>;
declare function Toaster(): React.JSX.Element;
export { type ToastProps, type ToastActionElement, ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction, ToastContextProvider, EnhancedToast, Toaster, useToast, toast, };
//# sourceMappingURL=toast.d.ts.map