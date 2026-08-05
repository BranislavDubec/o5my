import { Switch, Route, Router, Redirect } from "wouter";
import { useState } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { PwaInstallProvider } from "@/contexts/pwa-install-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { Layout } from "@/components/layout";
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_VERSION } from "@shared/terms";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import TermsPage from "@/pages/terms";
import Dashboard from "@/pages/dashboard";
import CalendarPage from "@/pages/calendar";
import MatchesPage from "@/pages/matches";
import OpponentsPage from "@/pages/opponents";
import EventDetailPage from "@/pages/event-detail";
import PollsPage from "@/pages/polls";
import PollDetailPage from "@/pages/poll-detail";
import PaymentsPage from "@/pages/payments";
import PaymentDetailPage from "@/pages/payment-detail";
import MediaPage from "@/pages/media";
import TacticDetailPage from "@/pages/tactic-detail";
import TacticPdfPage from "@/pages/tactic-pdf";
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

// Shown after login when the user has not yet accepted the current version of
// the terms (existing accounts were created before terms tracking existed).
function TermsGate() {
  const { acceptTerms, logout } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      await acceptTerms();
    } catch (err: any) {
      setError(err.message || "Súhlas sa nepodarilo uložiť");
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 bg-background">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.jpg" alt="O5MY" className="w-16 h-16 rounded-full object-cover" />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
          <p className="text-sm text-muted-foreground">
            Aktualizovali sme podmienky používania (verzia {TERMS_VERSION}). Pred pokračovaním si ich
            prečítaj a odsúhlas.
          </p>
          <p className="text-sm italic text-muted-foreground bg-muted rounded-lg px-4 py-3 max-w-xl">
            {TERMS_INTRO}
          </p>
        </div>

        <Card>
          <CardContent className="py-6 space-y-6 max-h-[50vh] overflow-y-auto">
            {TERMS_SECTIONS.map((section) => (
              <section key={section.title} className="space-y-2">
                <h2 className="text-base font-semibold">{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <div className="flex flex-col items-center gap-2 pb-4">
          <Button className="w-full max-w-sm" onClick={handleAccept} disabled={isAccepting}>
            {isAccepting ? "Ukladám..." : "Súhlasím s podmienkami používania"}
          </Button>
          <Button variant="ghost" onClick={logout} disabled={isAccepting}>
            Odhlásiť sa
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  // Block the whole app until the current terms version is accepted.
  if (user && user.termsVersion < TERMS_VERSION) {
    return <TermsGate />;
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
      <Route path="/terms">
        <TermsPage />
      </Route>
      <Route path="/verify-email">
        {user ? <Redirect to="/" /> : <VerifyEmail />}
      </Route>
      <Route path="/forgot-password">
        {user ? <Redirect to="/settings" /> : <ForgotPassword />}
      </Route>
      <Route path="/reset-password">
        <ResetPassword />
      </Route>

      {/* Protected routes */}
      <Route path="/">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute><CalendarPage /></ProtectedRoute>
      </Route>
      <Route path="/matches">
        <ProtectedRoute><MatchesPage /></ProtectedRoute>
      </Route>
      <Route path="/opponents">
        <ProtectedRoute><OpponentsPage /></ProtectedRoute>
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
      <Route path="/files/tactics/:id/pdf/:fileId">
        <ProtectedRoute><TacticPdfPage /></ProtectedRoute>
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
      <Route path="/members">
        <ProtectedRoute><AdminMembers /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>

      {/* Admin routes */}
      <Route path="/admin/members">
        <Redirect to="/members" />
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
