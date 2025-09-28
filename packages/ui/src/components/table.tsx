"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ChevronDown, ChevronUp, ChevronsUpDown, MoreHorizontal } from "lucide-react"

import { cn } from "../utils/cn"
import { Button } from "./button"
import { MobileOnly, TabletUp } from "./responsive"

const tableVariants = cva(
  "w-full caption-bottom text-sm",
  {
    variants: {
      variant: {
        default: "",
        striped: "[&_tbody_tr:nth-child(even)]:bg-muted/50",
        bordered: "border border-border",
        cards: "block md:table [&_thead]:hidden md:[&_thead]:table-header-group [&_tbody]:block md:[&_tbody]:table-row-group [&_tbody_tr]:block md:[&_tbody_tr]:table-row [&_tbody_tr]:border [&_tbody_tr]:rounded-lg [&_tbody_tr]:mb-4 md:[&_tbody_tr]:mb-0 [&_tbody_tr]:shadow-sm md:[&_tbody_tr]:shadow-none [&_tbody_tr]:p-4 md:[&_tbody_tr]:p-0",
      },
      size: {
        sm: "[&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1",
        default: "[&_td]:px-2 [&_td]:py-2 md:[&_td]:px-4 md:[&_td]:py-2 [&_th]:px-2 [&_th]:py-2 md:[&_th]:px-4 md:[&_th]:py-2",
        lg: "[&_td]:px-4 [&_td]:py-2 md:[&_td]:px-6 md:[&_td]:py-3 [&_th]:px-4 [&_th]:py-2 md:[&_th]:px-6 md:[&_th]:py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & VariantProps<typeof tableVariants> & {
    responsive?: boolean
  }
>(({ className, variant, size, responsive = false, ...props }, ref) => (
  <div className={cn(
    "relative w-full",
    responsive ? "overflow-hidden" : "overflow-auto"
  )}>
    <table
      ref={ref}
      className={cn(tableVariants({ variant, size }), className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & {
    clickable?: boolean
  }
>(({ className, clickable = false, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      clickable && "cursor-pointer",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    sortable?: boolean
    sortDirection?: "asc" | "desc" | null
    onSort?: () => void
  }
>(({ className, sortable = false, sortDirection, onSort, children, ...props }, ref) => {
  const getSortIcon = () => {
    if (!sortable) return null

    switch (sortDirection) {
      case "asc":
        return <ChevronUp className="ml-2 h-4 w-4" />
      case "desc":
        return <ChevronDown className="ml-2 h-4 w-4" />
      default:
        return <ChevronsUpDown className="ml-2 h-4 w-4" />
    }
  }

  if (sortable) {
    return (
      <th
        ref={ref}
        className={cn(
          "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
          className
        )}
        {...props}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 data-[state=open]:bg-accent"
          onClick={onSort}
        >
          <span>{children}</span>
          {getSortIcon()}
        </Button>
      </th>
    )
  }

  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & {
    label?: string
    truncate?: boolean
  }
>(({ className, label, truncate = false, children, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 md:p-4 align-middle [&:has([role=checkbox])]:pr-0",
      "block md:table-cell",
      truncate && "max-w-0 truncate",
      className
    )}
    {...props}
  >
    {label && (
      <div className="md:hidden">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
    )}
    <div className={cn(
      "text-sm md:text-base",
      truncate && "truncate",
      label && "mt-1 md:mt-0"
    )}>
      {children}
    </div>
  </td>
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

// Enhanced Data Table with sorting, filtering, and pagination
export interface Column<T> {
  key: keyof T
  header: string
  cell?: (item: T) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
  width?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  loading?: boolean
  onRowClick?: (item: T) => void
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
    onPageSizeChange: (pageSize: number) => void
  }
  sorting?: {
    column: keyof T | null
    direction: "asc" | "desc" | null
    onSort: (column: keyof T) => void
  }
  selection?: {
    selectedRows: T[]
    onSelectionChange: (selected: T[]) => void
  }
  emptyMessage?: string
  className?: string
  mobileLayout?: "cards" | "scroll"
  priority?: (keyof T)[]
}

function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  onRowClick,
  pagination,
  sorting,
  selection,
  emptyMessage = "No data available",
  className,
  mobileLayout = "cards",
  priority = [],
}: DataTableProps<T>) {
  const [selectedRows, setSelectedRows] = React.useState<T[]>(
    selection?.selectedRows || []
  )

  React.useEffect(() => {
    if (selection?.selectedRows) {
      setSelectedRows(selection.selectedRows)
    }
  }, [selection?.selectedRows])

  const handleSort = (column: keyof T) => {
    if (sorting?.onSort) {
      sorting.onSort(column)
    }
  }

  const handleRowSelect = (row: T, checked: boolean) => {
    const newSelected = checked
      ? [...selectedRows, row]
      : selectedRows.filter((r) => r !== row)

    setSelectedRows(newSelected)
    selection?.onSelectionChange(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    const newSelected = checked ? [...data] : []
    setSelectedRows(newSelected)
    selection?.onSelectionChange(newSelected)
  }

  const isRowSelected = (row: T) => {
    return selectedRows.some((r) => r === row)
  }

  const isAllSelected = data.length > 0 && selectedRows.length === data.length
  const isIndeterminate = selectedRows.length > 0 && selectedRows.length < data.length

  // Get priority columns for mobile display
  const mobileColumns = priority.length > 0
    ? columns.filter(col => priority.includes(col.key))
    : columns.slice(0, 2) // Default to first 2 columns

  // Render mobile card view
  const renderMobileCard = (row: T, index: number) => (
    <div
      key={index}
      className={cn(
        "border rounded-lg p-4 space-y-3 bg-card",
        onRowClick && "cursor-pointer hover:bg-accent/50",
        isRowSelected(row) && "bg-accent"
      )}
      onClick={() => onRowClick?.(row)}
    >
      {selection && (
        <div className="flex items-center justify-between">
          <input
            type="checkbox"
            checked={isRowSelected(row)}
            onChange={(e) => handleRowSelect(row, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}

      {mobileColumns.map((column) => (
        <div key={String(column.key)} className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {column.header}
          </div>
          <div className="text-sm">
            {column.cell ? column.cell(row) : String(row[column.key])}
          </div>
        </div>
      ))}

      {!selection && (
        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 bg-muted animate-pulse rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Mobile Card View */}
      {mobileLayout === "cards" && (
        <MobileOnly>
          {data.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.map((row, index) => renderMobileCard(row, index))}
            </div>
          )}
        </MobileOnly>
      )}

      {/* Desktop Table View */}
      <TabletUp>
        <Table responsive={mobileLayout === "cards"}>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={String(column.key)}
                  sortable={column.sortable}
                  sortDirection={
                    sorting?.column === column.key ? sorting.direction : null
                  }
                  onSort={() => handleSort(column.key)}
                  style={{ width: column.width }}
                >
                  {column.header}
                </TableHead>
              ))}
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selection ? 1 : 0) + 1}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow
                  key={index}
                  clickable={!!onRowClick}
                  onClick={() => onRowClick?.(row)}
                  data-state={isRowSelected(row) ? "selected" : undefined}
                >
                  {selection && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isRowSelected(row)}
                        onChange={(e) => handleRowSelect(row, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={String(column.key)}
                      label={column.header}
                      truncate={!column.width}
                    >
                      {column.cell ? column.cell(row) : String(row[column.key])}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TabletUp>

      {/* Mobile Scrollable Table (alternative layout) */}
      {mobileLayout === "scroll" && (
        <MobileOnly>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {priority.length > 0 ? (
                    columns.filter(col => priority.includes(col.key)).map((column) => (
                      <TableHead key={String(column.key)} className="text-xs">
                        {column.header}
                      </TableHead>
                    ))
                  ) : (
                    columns.slice(0, 3).map((column) => (
                      <TableHead key={String(column.key)} className="text-xs">
                        {column.header}
                      </TableHead>
                    ))
                  )}
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row, index) => (
                    <TableRow
                      key={index}
                      clickable={!!onRowClick}
                      onClick={() => onRowClick?.(row)}
                    >
                      {(priority.length > 0
                        ? columns.filter(col => priority.includes(col.key))
                        : columns.slice(0, 3)
                      ).map((column) => (
                        <TableCell key={String(column.key)} className="text-xs">
                          {column.cell ? column.cell(row) : String(row[column.key])}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </MobileOnly>
      )}

      {pagination && (
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
            <MobileOnly>
              Page {pagination.page} of {Math.ceil(pagination.total / pagination.pageSize)}
            </MobileOnly>
            <TabletUp>
              Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
              {pagination.total} results
            </TabletUp>
          </div>
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="text-xs px-2 py-1 sm:text-sm sm:px-4 sm:py-2"
            >
              Previous
            </Button>
            <span className="text-xs sm:text-sm text-muted-foreground px-2">
              {pagination.page}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              className="text-xs px-2 py-1 sm:text-sm sm:px-4 sm:py-2"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  DataTable,
  tableVariants,
}