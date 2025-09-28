import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type VariantProps } from "class-variance-authority";
declare const tabsListVariants: (props?: ({
    variant?: "default" | "underline" | "line" | "pills" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const tabsTriggerVariants: (props?: ({
    variant?: "default" | "underline" | "line" | "pills" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Tabs: React.ForwardRefExoticComponent<TabsPrimitive.TabsProps & React.RefAttributes<HTMLDivElement>>;
declare const TabsList: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsListProps & React.RefAttributes<HTMLDivElement>, "ref"> & VariantProps<(props?: ({
    variant?: "default" | "underline" | "line" | "pills" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & React.RefAttributes<HTMLDivElement>>;
declare const TabsTrigger: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsTriggerProps & React.RefAttributes<HTMLButtonElement>, "ref"> & VariantProps<(props?: ({
    variant?: "default" | "underline" | "line" | "pills" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    icon?: React.ReactNode;
    badge?: string | number;
    animated?: boolean;
} & React.RefAttributes<HTMLButtonElement>>;
declare const TabsContent: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
    animated?: boolean;
} & React.RefAttributes<HTMLDivElement>>;
export interface VerticalTabsProps {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    className?: string;
    children: React.ReactNode;
}
declare const VerticalTabs: React.ForwardRefExoticComponent<VerticalTabsProps & React.RefAttributes<HTMLDivElement>>;
declare const VerticalTabsList: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsListProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
declare const VerticalTabsTrigger: React.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsTriggerProps & React.RefAttributes<HTMLButtonElement>, "ref"> & {
    icon?: React.ReactNode;
} & React.RefAttributes<HTMLButtonElement>>;
export interface LazyTabContentProps {
    value: string;
    children: React.ReactNode;
    className?: string;
    forceMount?: boolean;
}
declare const LazyTabContent: React.ForwardRefExoticComponent<LazyTabContentProps & React.RefAttributes<HTMLDivElement>>;
export { Tabs, TabsList, TabsTrigger, TabsContent, VerticalTabs, VerticalTabsList, VerticalTabsTrigger, LazyTabContent, tabsListVariants, tabsTriggerVariants, };
//# sourceMappingURL=tabs.d.ts.map