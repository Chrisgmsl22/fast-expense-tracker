import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine class names: clsx for conditional handling, twMerge to dedupe
 * conflicting Tailwind utility classes (e.g. `p-2 p-4` → `p-4`).
 * Standard shadcn/ui helper.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
