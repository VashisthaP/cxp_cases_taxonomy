// ==========================================================================
// Shadcn UI Utility: cn() - merges Tailwind classes with clsx + tailwind-merge
// ==========================================================================
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and resolves Tailwind conflicts with twMerge.
 * Used throughout all Shadcn UI components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
