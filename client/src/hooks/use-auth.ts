import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface DeviceInfo {
  isMobile: boolean;
  platform: string;
  userAgent: string;
}

export interface LoginData {
  username: string;
  password: string;
  loginType: "admin" | "merchant" | "customer";
  deviceInfo: DeviceInfo;
}

interface LoginResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  name?: string;
  token: string;
}

export function useAuth() {
  const loginMutation = useMutation<LoginResponse, Error, LoginData>({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest("/api/auth/login", {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.json();
    }
  });

  return {
    loginMutation,
  };
}