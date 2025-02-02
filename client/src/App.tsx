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


function AppRouter() { // Renamed Router to AppRouter
  console.log('[Router] Rendering AppRouter'); // Added logging
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login/customer" />} /> {/* Replaced Redirect */}
      <Route path="/login/customer" element={<CustomerLogin />} />
      <Route path="/auth/customer-login" element={<CustomerLogin />} />
      <Route path="/login/merchant" element={<MerchantLogin />} />
      <Route path="/login/admin" element={<AdminLogin />} />
      <Route path="/customer" element={<ProtectedRoute component={CustomerDashboard} />} /> {/* Modified ProtectedRoute usage */}
      <Route path="/merchant" element={<ProtectedRoute component={MerchantDashboard} />} /> {/* Modified ProtectedRoute usage */}
      <Route path="/admin" element={<ProtectedRoute component={AdminDashboard} />} /> {/* Modified ProtectedRoute usage */}
      <Route path="/admin/kyc-verifications" element={<ProtectedRoute component={KycVerificationsPage} />} /> {/* Modified ProtectedRoute usage */}
      <Route path="/apply/:token" element={<ApplyPage />} />
      <Route path="/merchant/dashboard" element={
        <ProtectedRoute 
          path="/merchant/dashboard"
          allowedRoles={["merchant"]} 
          component={MerchantDashboard}
        />
      } />
      <Route path="*" element={<NotFound />} /> {/* Used * for catch-all */}
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