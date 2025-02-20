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

<<<<<<< HEAD
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
=======
const API_BASE_URL = 'http://0.0.0.0:5000';
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116

export async function apiRequest(
  url: string,
  init?: RequestInit
): Promise<Response> {
<<<<<<< HEAD
  const headers = new Headers({
    ...getAuthHeaders(),
    ...(init?.headers || {})
  });

  console.log('[API] Making request:', { 
    method: init?.method || 'GET', 
    url, 
    hasToken: !!localStorage.getItem('token'),
    timestamp: new Date().toISOString()
  });

  const response = await fetch(url, {
    ...init,
    headers,
=======
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
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
      return await response.json();
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