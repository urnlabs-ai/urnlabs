import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type VariantProps } from "class-variance-authority";
declare const Dialog: React.FC<DialogPrimitive.DialogProps>;
declare const DialogTrigger: React.ForwardRefExoticComponent<DialogPrimitive.DialogTriggerProps & React.RefAttributes<HTMLButtonElement>>;
declare const DialogPortal: React.FC<DialogPrimitive.DialogPortalProps>;
declare const DialogClose: React.ForwardRefExoticComponent<DialogPrimitive.DialogCloseProps & React.RefAttributes<HTMLButtonElement>>;
declare const dialogVariants: (props?: ({
    size?: "default" | "full" | "sm" | "lg" | "xl" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const DialogOverlay: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogOverlayProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
    animated?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
declare const DialogContent: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & VariantProps<(props?: ({
    size?: "default" | "full" | "sm" | "lg" | "xl" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    animated?: boolean;
    showClose?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
declare const DialogHeader: {
    ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element;
    displayName: string;
};
declare const DialogFooter: {
    ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element;
    displayName: string;
};
declare const DialogTitle: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogTitleProps & React.RefAttributes<HTMLHeadingElement>, "ref"> & React.RefAttributes<HTMLHeadingElement>>;
declare const DialogDescription: React.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogDescriptionProps & React.RefAttributes<HTMLParagraphElement>, "ref"> & React.RefAttributes<HTMLParagraphElement>>;
export interface UseModalOptions {
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}
export declare function useModal(options?: UseModalOptions): {
    open: boolean;
    openModal: () => void;
    closeModal: () => void;
    toggleModal: () => void;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};
export interface ConfirmDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    variant?: "default" | "destructive";
    loading?: boolean;
}
declare const ConfirmDialog: React.ForwardRefExoticComponent<ConfirmDialogProps & React.RefAttributes<HTMLDivElement>>;
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, ConfirmDialog, dialogVariants, };
//# sourceMappingURL=dialog.d.ts.map