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

  return (
    <Routes>
      {/* Default redirect to merchant login */}
      <Route path="/" element={<Navigate to="/auth/merchant" replace />} />

      {/* Auth routes */}
      <Route path="/auth/customer" element={<CustomerLogin />} />
      <Route path="/auth/merchant" element={<MerchantLogin />} />
      <Route path="/auth/admin" element={<AdminLogin />} />

      {/* Protected routes */}
      <Route 
        path="/customer/*" 
        element={<ProtectedRoute component={CustomerDashboard} allowedRoles={["customer"]} />}
      />
      <Route 
        path="/merchant/*" 
        element={<ProtectedRoute component={MerchantDashboard} allowedRoles={["merchant"]} />}
      />
      <Route 
        path="/admin/*" 
        element={<ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />}
      />
      <Route 
        path="/admin/kyc-verifications" 
        element={<ProtectedRoute component={KycVerificationsPage} allowedRoles={["admin"]} />}
      />

      {/* Apply route */}
      <Route path="/apply/:token" element={<ApplyPage />} />

      {/* Legacy route redirects */}
      <Route path="/login/merchant" element={<Navigate to="/auth/merchant" replace />} />
      <Route path="/login/admin" element={<Navigate to="/auth/admin" replace />} />

      {/* Catch-all route */}
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