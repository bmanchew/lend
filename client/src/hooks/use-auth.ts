import { ReactNode, createContext, useContext } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface DeviceInfo {
  isMobile: boolean;
  platform: string;
  userAgent: string;
}

export interface LoginData {
  username: string;
  password: string;
  loginType: "admin" | "merchant" | "customer";
  deviceInfo?: DeviceInfo;
}

export interface LoginResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  name?: string;
  token: string;
}

interface AuthContextType {
  user: LoginResponse | null;
  loginMutation: ReturnType<typeof useLoginMutation>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function useLoginMutation() {
  const { toast } = useToast();
  return useMutation<LoginResponse, Error, LoginData>({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest("/api/auth/login", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const loginMutation = useLoginMutation();
  const { data: user } = useQuery<LoginResponse | null>({
    queryKey: ['/api/auth/me'],
    retry: false
  });

  return (
    <AuthContext.Provider value={{ user: user ?? null, loginMutation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}