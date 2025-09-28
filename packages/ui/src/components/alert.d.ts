import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const alertVariants: (props?: ({
    variant?: "default" | "info" | "warning" | "success" | "destructive" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Alert: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & VariantProps<(props?: ({
    variant?: "default" | "info" | "warning" | "success" | "destructive" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
    dismissible?: boolean;
    onDismiss?: () => void;
} & React.RefAttributes<HTMLDivElement>>;
declare const AlertTitle: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLHeadingElement> & React.RefAttributes<HTMLParagraphElement>>;
declare const AlertDescription: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>>;
export interface AlertWithIconProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    animated?: boolean;
    dismissible?: boolean;
    onDismiss?: () => void;
    showDefaultIcon?: boolean;
}
declare const AlertWithIcon: React.ForwardRefExoticComponent<AlertWithIconProps & React.RefAttributes<HTMLDivElement>>;
declare const SuccessAlert: React.ForwardRefExoticComponent<Omit<AlertWithIconProps, "variant"> & React.RefAttributes<HTMLDivElement>>;
declare const ErrorAlert: React.ForwardRefExoticComponent<Omit<AlertWithIconProps, "variant"> & React.RefAttributes<HTMLDivElement>>;
declare const WarningAlert: React.ForwardRefExoticComponent<Omit<AlertWithIconProps, "variant"> & React.RefAttributes<HTMLDivElement>>;
declare const InfoAlert: React.ForwardRefExoticComponent<Omit<AlertWithIconProps, "variant"> & React.RefAttributes<HTMLDivElement>>;
export interface UseAlertOptions {
    duration?: number;
    onDismiss?: () => void;
}
export declare function useAlert(options?: UseAlertOptions): {
    isVisible: boolean;
    showAlert: () => void;
    hideAlert: () => void;
};
export { Alert, AlertTitle, AlertDescription, AlertWithIcon, SuccessAlert, ErrorAlert, WarningAlert, InfoAlert, alertVariants, };
//# sourceMappingURL=alert.d.ts.map