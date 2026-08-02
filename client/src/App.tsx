import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { PwaInstallProvider } from "@/contexts/pwa-install-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import Dashboard from "@/pages/dashboard";
import CalendarPage from "@/pages/calendar";
import EventDetailPage from "@/pages/event-detail";
import PollsPage from "@/pages/polls";
import PollDetailPage from "@/pages/poll-detail";
import PaymentsPage from "@/pages/payments";
import PaymentDetailPage from "@/pages/payment-detail";
import MediaPage from "@/pages/media";
import TacticDetailPage from "@/pages/tactic-detail";
import OrganizationPage from "@/pages/organization";
import StatisticsPage from "@/pages/statistics";
import AdminMembers from "@/pages/admin-members";
import AdminPayments from "@/pages/admin-payments";
import AdminBank from "@/pages/admin-bank";
import AdminNotifications from "@/pages/admin-notifications";
import Settings from "@/pages/settings";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin";
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function useAppHashLocation(
  options?: Parameters<typeof useHashLocation>[0],
): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation(options);
  return [location.split("?", 1)[0], navigate];
}

function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <FullPageSpinner />;
  }
  if (!user) {
    return <Redirect to="/login" />;
  }
  if (requiredRole && user.role !== requiredRole) {
    return <Redirect to="/" />;
  }
  return <Layout>{children}</Layout>;
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        {user ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/register">
        {user ? <Redirect to="/" /> : <Register />}
      </Route>
      <Route path="/verify-email">
        {user ? <Redirect to="/" /> : <VerifyEmail />}
      </Route>

      {/* Protected routes */}
      <Route path="/">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute><CalendarPage /></ProtectedRoute>
      </Route>
      <Route path="/events/:id">
        <ProtectedRoute><EventDetailPage /></ProtectedRoute>
      </Route>
      <Route path="/polls">
        <ProtectedRoute><PollsPage /></ProtectedRoute>
      </Route>
      <Route path="/polls/:id">
        <ProtectedRoute><PollDetailPage /></ProtectedRoute>
      </Route>
      <Route path="/payments">
        <ProtectedRoute><PaymentsPage /></ProtectedRoute>
      </Route>
      <Route path="/payments/:id">
        <ProtectedRoute><PaymentDetailPage /></ProtectedRoute>
      </Route>
      <Route path="/files">
        <ProtectedRoute><MediaPage /></ProtectedRoute>
      </Route>
      <Route path="/files/tactics/:id">
        <ProtectedRoute><TacticDetailPage /></ProtectedRoute>
      </Route>
      <Route path="/organization">
        <ProtectedRoute><OrganizationPage /></ProtectedRoute>
      </Route>
      <Route path="/statistics">
        <ProtectedRoute><StatisticsPage /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>

      {/* Admin routes */}
      <Route path="/admin/members">
        <ProtectedRoute requiredRole="admin"><AdminMembers /></ProtectedRoute>
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute requiredRole="admin"><AdminPayments /></ProtectedRoute>
      </Route>
      <Route path="/admin/bank">
        <ProtectedRoute requiredRole="admin"><AdminBank /></ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute requiredRole="admin"><AdminNotifications /></ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PwaInstallProvider>
        <TooltipProvider>
          <Toaster />
          <AuthProvider>
            <ThemeProvider>
              <Router hook={useAppHashLocation}>
                <AppRouter />
              </Router>
            </ThemeProvider>
          </AuthProvider>
        </TooltipProvider>
      </PwaInstallProvider>
    </QueryClientProvider>
  );
}

export default App;
