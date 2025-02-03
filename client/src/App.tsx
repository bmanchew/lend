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


function AppRouter() {
  console.log('[Router] Rendering AppRouter');

  // Group routes by type for better organization
  const authRoutes = [
    { path: "/login/customer", element: <CustomerLogin /> },
    { path: "/auth/customer-login", element: <CustomerLogin /> },
    { path: "/login/merchant", element: <MerchantLogin /> },
    { path: "/login/admin", element: <AdminLogin /> },
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