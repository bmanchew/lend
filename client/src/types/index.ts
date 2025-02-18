export interface LoginData {
  username: string;
  password: string;
  loginType: 'merchant' | 'admin' | 'customer';
}

export interface LoginResponse {
  token: string;
  id: number;
  role: 'merchant' | 'admin' | 'customer';
  name: string;
  email: string;
}