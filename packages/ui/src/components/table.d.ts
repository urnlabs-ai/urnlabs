import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const tableVariants: (props?: ({
    variant?: "default" | "bordered" | "striped" | "cards" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string;
declare const Table: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableElement> & VariantProps<(props?: ({
    variant?: "default" | "bordered" | "striped" | "cards" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/dist/types").ClassProp) | undefined) => string> & {
    responsive?: boolean;
} & React.RefAttributes<HTMLTableElement>>;
declare const TableHeader: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
declare const TableBody: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
declare const TableFooter: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableSectionElement> & React.RefAttributes<HTMLTableSectionElement>>;
declare const TableRow: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableRowElement> & {
    clickable?: boolean;
} & React.RefAttributes<HTMLTableRowElement>>;
declare const TableHead: React.ForwardRefExoticComponent<React.ThHTMLAttributes<HTMLTableCellElement> & {
    sortable?: boolean;
    sortDirection?: "asc" | "desc" | null;
    onSort?: () => void;
} & React.RefAttributes<HTMLTableCellElement>>;
declare const TableCell: React.ForwardRefExoticComponent<React.TdHTMLAttributes<HTMLTableCellElement> & {
    label?: string;
    truncate?: boolean;
} & React.RefAttributes<HTMLTableCellElement>>;
declare const TableCaption: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLTableCaptionElement> & React.RefAttributes<HTMLTableCaptionElement>>;
export interface Column<T> {
    key: keyof T;
    header: string;
    cell?: (item: T) => React.ReactNode;
    sortable?: boolean;
    filterable?: boolean;
    width?: string;
}
export interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    loading?: boolean;
    onRowClick?: (item: T) => void;
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (pageSize: number) => void;
    };
    sorting?: {
        column: keyof T | null;
        direction: "asc" | "desc" | null;
        onSort: (column: keyof T) => void;
    };
    selection?: {
        selectedRows: T[];
        onSelectionChange: (selected: T[]) => void;
    };
    emptyMessage?: string;
    className?: string;
    mobileLayout?: "cards" | "scroll";
    priority?: (keyof T)[];
}
declare function DataTable<T extends Record<string, any>>({ data, columns, loading, onRowClick, pagination, sorting, selection, emptyMessage, className, mobileLayout, priority, }: DataTableProps<T>): React.JSX.Element;
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, DataTable, tableVariants, };
//# sourceMappingURL=table.d.ts.map