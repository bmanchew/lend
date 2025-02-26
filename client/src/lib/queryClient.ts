import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage;
    try {
      const errorData = await res.json();
      errorMessage = errorData.message || errorData.error || res.statusText;
    } catch {
      errorMessage = res.statusText;
    }
    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  } : {
    'Content-Type': 'application/json'
  };
}

const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://shifi.replit.app' 
  : '';

export const apiRequest = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const fullUrl = `${API_BASE}${url}`;
  const headers = new Headers({
    ...getAuthHeaders(),
    ...(options?.headers || {})
  });

  console.log('[API] Making request:', { 
    method: options?.method || 'GET', 
    url: fullUrl, 
    hasToken: !!localStorage.getItem('token'),
    timestamp: new Date().toISOString()
  });

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    console.log('[API] Unauthorized request, clearing token');
    localStorage.removeItem('token');
  }

  await throwIfResNotOk(response);
  return response;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const response = await fetch(queryKey[0] as string, {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (response.status === 401) {
        console.log('[API] Unauthorized query, clearing token');
        localStorage.removeItem('token');
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
        throw new Error("Unauthorized");
      }

      await throwIfResNotOk(response);
      const data = await response.json();
      
      // Handle both direct data and {status, data} envelope formats
      if (data && typeof data === 'object' && 'status' in data && data.status === 'success' && 'data' in data) {
        return data;
      }
      return data;
    } catch (error) {
      console.error('[API] Query error:', error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});