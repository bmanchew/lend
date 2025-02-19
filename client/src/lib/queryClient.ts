import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function apiRequest(
  url: string,
  init?: RequestInit
): Promise<Response> {
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

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: HeadersInit = getAuthHeaders();

    console.log('[API] Making query:', { 
      queryKey, 
      hasToken: !!localStorage.getItem('token'),
      timestamp: new Date().toISOString()
    });

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      // Clear token on 401 as it might be invalid/expired
      localStorage.removeItem('token');
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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