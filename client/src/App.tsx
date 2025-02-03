import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"; // Changed import
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import NotFound from "@/pages/not-found";
import CustomerLogin from "./pages/auth/customer-login";
import MerchantLogin from "./pages/auth/merchant-login";
import AdminLogin from "./pages/auth/admin-login";
import CustomerDashboard from "@/pages/customer/dashboard";
import MerchantDashboard from "@/pages/merchant/dashboard";
import AdminDashboard from "@/pages/admin/dashboard";
import KycVerificationsPage from "@/pages/admin/kyc-verifications";
import ApplyPage from "@/pages/apply"; // Placeholder component


// Route configurations
interface RouteConfig {
  path: string;
  element: JSX.Element;
  roles?: string[];
}

export class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error?: Error}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button 
              className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRouter() {
  console.log('[Router] Rendering AppRouter');

  // Structured route configurations
  const authRoutes = [
    { path: "/login/customer", element: <CustomerLogin />, title: "Customer Login" },
    { path: "/auth/customer-login", element: <CustomerLogin />, title: "Customer Login" },
    { path: "/login/merchant", element: <MerchantLogin />, title: "Merchant Login" },
    { path: "/login/admin", element: <AdminLogin />, title: "Admin Login" },
  ];

  const protectedRoutes = [
    { 
      path: "/customer", 
      element: <ProtectedRoute component={CustomerDashboard} />
    },
    { 
      path: "/merchant", 
      element: <ProtectedRoute component={MerchantDashboard} />
    },
    { 
      path: "/admin", 
      element: <ProtectedRoute component={AdminDashboard} />
    },
    { 
      path: "/admin/kyc-verifications", 
      element: <ProtectedRoute component={KycVerificationsPage} />
    },
    { 
      path: "/merchant/dashboard",
      element: (
        <ProtectedRoute 
          path="/merchant/dashboard"
          allowedRoles={["merchant"]} 
          component={MerchantDashboard}
        />
      )
    },
  ];

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login/customer" />} />
      {authRoutes.map(route => (
        <Route key={route.path} {...route} />
      ))}
      {protectedRoutes.map(route => (
        <Route key={route.path} {...route} />
      ))}
      <Route path="/apply/:token" element={<ApplyPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  console.log('[App] Rendering App'); // Added logging
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;