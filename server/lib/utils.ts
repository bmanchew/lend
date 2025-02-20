
/**
 * Validates and formats a phone number
 * @param phone The phone number to validate
 * @returns Formatted phone number or null if invalid
 */
export function validateAndFormatPhone(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle various formats
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  return null;
}

/**
 * Checks if a string is a valid email
 * @param email The email to validate
 * @returns boolean indicating if email is valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
