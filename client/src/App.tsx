import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Switch, Route, Redirect } from "wouter";
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


function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/login/customer" />
      </Route>
      <Route path="/login/customer">
        <CustomerLogin />
      </Route>
      <Route path="/auth/customer-login">
        <CustomerLogin />
      </Route>
      <Route path="/login/merchant" component={MerchantLogin} />
      <Route path="/login/admin" component={AdminLogin} />
      <ProtectedRoute path="/customer" component={CustomerDashboard} />
      <ProtectedRoute path="/merchant" component={MerchantDashboard} />
      <ProtectedRoute path="/admin" component={AdminDashboard} />
      <ProtectedRoute path="/admin/kyc-verifications" component={KycVerificationsPage} />
      <Route path="/apply/:token" component={ApplyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;