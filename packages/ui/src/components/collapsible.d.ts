import * as React from "react";
declare const collapsibleVariants: (props?: ({
    variant?: "default" | "ghost" | "bordered" | "card" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Collapsible: any;
declare const CollapsibleTrigger: React.ForwardRefExoticComponent<any>;
declare const CollapsibleContent: React.ForwardRefExoticComponent<any>;
export interface EnhancedCollapsibleProps extends React.ComponentPropsWithoutRef<typeof Collapsible> {
    trigger: React.ReactNode;
    children: React.ReactNode;
    icon?: "chevron-down" | "chevron-right" | "plus" | "none";
    iconPosition?: "left" | "right";
    variant?: "default" | "bordered" | "card" | "ghost";
    size?: "sm" | "default" | "lg";
    animated?: boolean;
    disabled?: boolean;
    className?: string;
}
declare const EnhancedCollapsible: React.ForwardRefExoticComponent<EnhancedCollapsibleProps & React.RefAttributes<any>>;
export interface CollapsibleListItem {
    id: string;
    trigger: React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
    defaultOpen?: boolean;
}
export interface CollapsibleListProps {
    items: CollapsibleListItem[];
    type?: "single" | "multiple";
    icon?: "chevron-down" | "chevron-right" | "plus" | "none";
    iconPosition?: "left" | "right";
    variant?: "default" | "bordered" | "card" | "ghost";
    size?: "sm" | "default" | "lg";
    animated?: boolean;
    className?: string;
}
declare const CollapsibleList: React.ForwardRefExoticComponent<CollapsibleListProps & React.RefAttributes<HTMLDivElement>>;
export interface SidebarCollapsibleProps extends EnhancedCollapsibleProps {
    badge?: string | number;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}
declare const SidebarCollapsible: React.ForwardRefExoticComponent<SidebarCollapsibleProps & React.RefAttributes<any>>;
export { Collapsible, CollapsibleTrigger, CollapsibleContent, EnhancedCollapsible, CollapsibleList, SidebarCollapsible, collapsibleVariants, };
//# sourceMappingURL=collapsible.d.ts.map