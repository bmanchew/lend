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
      <Route path="/" element={<Navigate to="/login/customer" />} />
      <Route path="/login/customer" element={<CustomerLogin />} />
      <Route path="/auth/customer-login" element={<CustomerLogin />} />
      <Route path="/login/merchant" element={<MerchantLogin />} />
      <Route path="/login/admin" element={<AdminLogin />} />
      <Route path="/customer" element={<ProtectedRoute component={CustomerDashboard} />} />
      <Route path="/merchant" element={<ProtectedRoute component={MerchantDashboard} />} />
      <Route path="/admin" element={<ProtectedRoute component={AdminDashboard} />} />
      <Route path="/admin/kyc-verifications" element={<ProtectedRoute component={KycVerificationsPage} />} />
      <Route path="/merchant/dashboard" element={<ProtectedRoute path="/merchant/dashboard" allowedRoles={["merchant"]} component={MerchantDashboard} />} />
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