import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
// Debug logging utility
export const debugLog = (component: string, action: string, data?: any) => {
  console.log(`[${component}] ${action}`, data ? data : '');
};

export async function handleError(error: any) {
  console.error('Error:', error);
  const message = error.response?.data?.message || error.message || 'An error occurred';
  return { error: message, status: error.response?.status };
}