import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Switch, Route, useLocation, Router } from "wouter";
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

  React.useEffect(() => {
    // Show the auth landing page for root
    if (location === "/") {
      setLocation("/auth/customer-login");
    }
  }, [location, setLocation]);

  return (
    <Switch>
      {/* Auth routes */}
      <Route path="/auth/customer-login" component={CustomerLogin} />
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
      <Route path="/apply/:phone" component={ApplyPage} />

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
  );
}

function App() {
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