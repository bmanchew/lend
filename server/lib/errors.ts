
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class AuthError extends APIError {
  constructor(
    status: number,
    message: string,
    code: string,
    details?: any
  ) {
    super(status, message, code, details);
    this.name = 'AuthError';
  }
}

export const AUTH_ERROR_CODES = {
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED'
} as const;
