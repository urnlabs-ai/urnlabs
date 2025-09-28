import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
/**
 * Utility function to merge Tailwind CSS classes with proper precedence
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
/**
 * Create a component variant using class-variance-authority pattern
 */
export { cva } from "class-variance-authority";
//# sourceMappingURL=cn.js.map