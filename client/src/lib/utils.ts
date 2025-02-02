import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
// Debug logging utility
export const debugLog = (component: string, action: string, data?: any) => {
  console.log(`[${component}] ${action}`, data ? data : '');
};
