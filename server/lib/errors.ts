// Enhanced base API error class
export class APIError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly cause?: Error;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: any,
    cause?: Error
  ) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.cause = cause;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

// Enhanced auth error class
export class AuthError extends APIError {
  constructor(
    status: number,
    message: string,
    code: keyof typeof AUTH_ERROR_CODES,
    details?: any,
    cause?: Error
  ) {
    super(status, message, code, details, cause);
    this.name = 'AuthError';

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

// Type-safe error codes
export const AUTH_ERROR_CODES = {
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED'
} as const;

// Type for auth error codes
export type AuthErrorCode = keyof typeof AUTH_ERROR_CODES;