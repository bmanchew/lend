import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
<<<<<<< HEAD
import { Switch, Route, useLocation, Router } from "wouter";
=======
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth.tsx";
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
  const [location, setLocation] = useLocation();

<<<<<<< HEAD
  React.useEffect(() => {
    // Redirect root to merchant login
    if (location === "/" && window.location.pathname === "/") {
      setLocation("/auth/merchant");
    }
  }, []); // Run only once on mount

  return (
    <Switch>
      {/* Auth routes */}
      <Route path="/auth/customer" component={CustomerLogin} />
      <Route path="/auth/merchant" component={MerchantLogin} />
      <Route path="/auth/admin" component={AdminLogin} />

      {/* Protected routes */}
      <Route 
        path="/customer/*"
        component={() => <ProtectedRoute component={CustomerDashboard} allowedRoles={["customer"]} />}
      />
      <Route 
        path="/merchant/*"
        component={() => <ProtectedRoute component={MerchantDashboard} allowedRoles={["merchant"]} />}
      />
      <Route 
        path="/admin/*"
        component={() => <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />}
      />
      <Route 
        path="/admin/kyc-verifications"
        component={() => <ProtectedRoute component={KycVerificationsPage} allowedRoles={["admin"]} />}
      />

      {/* Apply route */}
      <Route path="/apply/:token" component={ApplyPage} />

      {/* Legacy route redirects */}
      <Route path="/login/merchant">
        {() => {
          setLocation("/auth/merchant");
          return null;
        }}
      </Route>
      <Route path="/login/admin">
        {() => {
          setLocation("/auth/admin");
          return null;
        }}
      </Route>

      {/* Catch-all route */}
      <Route component={NotFound} />
    </Switch>
=======
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
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
  );
}

function App() {
<<<<<<< HEAD
=======
  console.log('[App] Rendering App');
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRouter />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </Router>
  );
}

export default App;