import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Switch, Route, useLocation, Router } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth.tsx";
import { ProtectedRoute } from "./lib/protected-route";

// Page imports
import {
  NotFound,
  CustomerLogin,
  MerchantLogin,
  AdminLogin,
  CustomerDashboard,
  MerchantDashboard,
  AdminDashboard,
  KycVerificationsPage,
  ApplyPage
} from "@/pages";

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Switch>
            {/* Public routes */}
            <Route path="/login/customer" component={CustomerLogin} />
            <Route path="/login/merchant" component={MerchantLogin} />
            <Route path="/login/admin" component={AdminLogin} />
            <Route path="/apply" component={ApplyPage} />

            {/* Protected routes */}
            <Route path="/dashboard/customer">
              <ProtectedRoute role="customer" component={CustomerDashboard} />
            </Route>
            <Route path="/dashboard/merchant">
              <ProtectedRoute role="merchant" component={MerchantDashboard} />
            </Route>
            <Route path="/dashboard/admin">
              <ProtectedRoute role="admin" component={AdminDashboard} />
            </Route>
            <Route path="/admin/kyc">
              <ProtectedRoute role="admin" component={KycVerificationsPage} />
            </Route>

            {/* Fallback route */}
            <Route component={NotFound} />
          </Switch>
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;