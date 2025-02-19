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

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-4 text-red-500">Something went wrong. Please try again.</div>;
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