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
  kycStatus?: string | null;
  phoneNumber?: string | null;
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

export type ContractStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'defaulted';

export interface Contract {
  id: number;
  customerId: number;
  merchantId: number;
  contractNumber: string;
  amount: string;
  term: number;
  interestRate: string;
  status: ContractStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  downPayment?: string;
  monthlyPayment?: string;
  totalInterest?: string;
  nextPaymentDate?: string | Date;
  remainingBalance?: string;
  achVerificationStatus?: string;
  plaidAccessToken?: string;
  plaidAccountId?: string;
}