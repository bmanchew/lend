export interface LoginData {
  username: string;
  password: string;
  loginType: 'merchant' | 'admin' | 'customer';
}

export interface LoginResponse {
  token: string;
  id: number;
  role: 'merchant' | 'admin' | 'customer';
  name: string | null;
  email: string;
  username: string;
  phoneNumber: string | null;
  kycStatus: string | null;
  plaidAccessToken: string | null;
  createdAt: string | null;
  lastOtpCode: string | null;
  otpExpiry: string | null;
  faceIdHash: string | null;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'merchant' | 'admin' | 'customer';
  name: string | null;
  phoneNumber: string | null;
  createdAt: Date | null;
  plaidAccessToken: string | null;
  kycStatus: string | null;
  lastOtpCode: string | null;
  otpExpiry: Date | null;
  faceIdHash: string | null;
}

export interface JWTPayload {
  id: number;
  role: 'merchant' | 'admin' | 'customer';
  name?: string;
  email?: string;
  phoneNumber?: string;
}