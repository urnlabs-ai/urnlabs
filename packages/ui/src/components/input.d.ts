import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const inputVariants: (props?: ({
    variant?: "default" | "filled" | "ghost" | null | undefined;
    inputSize?: "default" | "sm" | "lg" | "xl" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof inputVariants> {
    icon?: React.ReactNode;
    iconPosition?: "left" | "right";
    clearable?: boolean;
    onClear?: () => void;
}
declare const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;
export interface SearchInputProps extends Omit<InputProps, "type" | "icon"> {
    onSearch?: (value: string) => void;
    placeholder?: string;
}
declare const SearchInput: React.ForwardRefExoticComponent<SearchInputProps & React.RefAttributes<HTMLInputElement>>;
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, VariantProps<typeof inputVariants> {
    resize?: boolean;
}
declare const Textarea: React.ForwardRefExoticComponent<TextareaProps & React.RefAttributes<HTMLTextAreaElement>>;
export { Input, SearchInput, Textarea, inputVariants };
//# sourceMappingURL=input.d.ts.map