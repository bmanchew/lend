import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import ApplyPage from "@/pages/apply";

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
      element: <ProtectedRoute component={CustomerDashboard} allowedRoles={["customer"]} />
    },
    { 
      path: "/merchant", 
      element: <ProtectedRoute component={MerchantDashboard} allowedRoles={["merchant"]} />
    },
    { 
      path: "/merchant/dashboard", 
      element: <ProtectedRoute component={MerchantDashboard} allowedRoles={["merchant"]} />
    },
    { 
      path: "/admin", 
      element: <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />
    },
    { 
      path: "/admin/kyc-verifications", 
      element: <ProtectedRoute component={KycVerificationsPage} allowedRoles={["admin"]} />
    }
  ];

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login/customer" />} />
      {authRoutes.map(route => (
        <Route key={route.path} {...route} />
      ))}
      {protectedRoutes.map(route => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
      <Route path="/apply/:token" element={<ApplyPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  console.log('[App] Rendering App');
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