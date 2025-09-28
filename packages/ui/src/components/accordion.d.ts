import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { type VariantProps } from "class-variance-authority";
declare const accordionVariants: (props?: ({
    variant?: "default" | "ghost" | "bordered" | "separated" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Accordion: React.ForwardRefExoticComponent<((Omit<AccordionPrimitive.AccordionSingleProps & React.RefAttributes<HTMLDivElement>, "ref"> | Omit<AccordionPrimitive.AccordionMultipleProps & React.RefAttributes<HTMLDivElement>, "ref">) & VariantProps<(props?: ({
    variant?: "default" | "ghost" | "bordered" | "separated" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string>) & React.RefAttributes<HTMLDivElement>>;
declare const AccordionItem: React.ForwardRefExoticComponent<Omit<AccordionPrimitive.AccordionItemProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
    variant?: "default" | "bordered" | "separated" | "ghost";
} & React.RefAttributes<HTMLDivElement>>;
declare const AccordionTrigger: React.ForwardRefExoticComponent<Omit<AccordionPrimitive.AccordionTriggerProps & React.RefAttributes<HTMLButtonElement>, "ref"> & {
    icon?: "chevron" | "plus" | "none";
    iconPosition?: "left" | "right";
    animated?: boolean;
} & React.RefAttributes<HTMLButtonElement>>;
declare const AccordionContent: React.ForwardRefExoticComponent<Omit<AccordionPrimitive.AccordionContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
    animated?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
export interface AccordionItemData {
    value: string;
    trigger: React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
    icon?: React.ReactNode;
}
export interface EnhancedAccordionProps extends Omit<React.ComponentPropsWithoutRef<typeof Accordion>, "children"> {
    items: AccordionItemData[];
    icon?: "chevron" | "plus" | "none";
    iconPosition?: "left" | "right";
    animated?: boolean;
}
declare const EnhancedAccordion: React.ForwardRefExoticComponent<EnhancedAccordionProps & React.RefAttributes<HTMLDivElement>>;
export interface FAQItem {
    question: string;
    answer: React.ReactNode;
    category?: string;
}
export interface FAQAccordionProps extends Omit<EnhancedAccordionProps, "items"> {
    faqs: FAQItem[];
    showCategories?: boolean;
    searchable?: boolean;
}
declare const FAQAccordion: React.ForwardRefExoticComponent<FAQAccordionProps & React.RefAttributes<HTMLDivElement>>;
export interface NestedAccordionItem extends AccordionItemData {
    children?: NestedAccordionItem[];
}
export interface NestedAccordionProps extends Omit<EnhancedAccordionProps, "items"> {
    items: NestedAccordionItem[];
    maxDepth?: number;
}
declare const NestedAccordion: React.ForwardRefExoticComponent<NestedAccordionProps & React.RefAttributes<HTMLDivElement>>;
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, EnhancedAccordion, FAQAccordion, NestedAccordion, accordionVariants, };
//# sourceMappingURL=accordion.d.ts.map