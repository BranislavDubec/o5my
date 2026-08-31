import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import {
  Calendar, Users, Vote, CreditCard, Settings, LogOut,
  Shield, Menu, X, Sun, Moon, Home, FolderOpen, BellRing, ClipboardList, Trophy, Swords, Flag
} from "lucide-react";
import { canAccessFinances, canManageTeam, canViewPersonalPayments } from "@shared/roles";

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  access?: "management" | "finances" | "payments";
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
     <img
        src="/favicon.ico"
        alt="Futbal App"
        className="w-8 h-8"
      />
      <span className="font-serif font-bold text-lg tracking-tight hidden sm:block">O5MY</span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, updateTheme, isSaving } = useTheme();
  const { toast } = useToast();
  const { t } = useI18n();
  const isDark = theme === "dark";

  const toggle = async () => {
    try {
      await updateTheme(isDark ? "light" : "dark");
    } catch (error) {
      toast({
        title: t("layout.themeSaveError"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={isSaving}
      className="p-2 rounded-lg hover-elevate text-muted-foreground hover:text-foreground transition-colors"
      aria-label={isDark ? t("layout.themeLight") : t("layout.themeDark")}
      aria-pressed={isDark}
      data-testid="button-theme-toggle"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: NavItem[] = [
    { path: "/", label: t("layout.dashboard"), icon: <Home className="w-5 h-5" /> },
    { path: "/calendar", label: t("layout.calendar"), icon: <Calendar className="w-5 h-5" /> },
    { path: "/matches", label: t("layout.matches"), icon: <Swords className="w-5 h-5" /> },
    { path: "/opponents", label: t("layout.opponents"), icon: <Flag className="w-5 h-5" /> },
    { path: "/polls", label: t("layout.polls"), icon: <Vote className="w-5 h-5" /> },
    { path: "/files", label: t("layout.files"), icon: <FolderOpen className="w-5 h-5" /> },
    { path: "/payments", label: t("layout.payments"), icon: <CreditCard className="w-5 h-5" />, access: "payments" },
    { path: "/organization", label: t("layout.organization"), icon: <ClipboardList className="w-5 h-5" /> },
    { path: "/statistics", label: t("layout.statistics"), icon: <Trophy className="w-5 h-5" /> },
    { path: "/members", label: t("layout.members"), icon: <Users className="w-5 h-5" /> },
    { path: "/admin/payments", label: t("layout.adminPayments"), icon: <CreditCard className="w-5 h-5" />, access: "finances" },
    { path: "/admin/bank", label: t("layout.adminBank"), icon: <Shield className="w-5 h-5" />, access: "finances" },
    { path: "/admin/notifications", label: t("layout.adminNotifications"), icon: <BellRing className="w-5 h-5" />, access: "management" },
    { path: "/settings", label: t("layout.settings"), icon: <Settings className="w-5 h-5" /> },
  ];

  const visibleNavItems = navItems.filter(item => {
    if (!item.access) return true;
    if (item.access === "management") return canManageTeam(user?.role);
    if (item.access === "finances") return canAccessFinances(user?.role);
    return canViewPersonalPayments(user?.role);
  });
  const roleLabel = user?.role === "admin"
    ? t("layout.roleAdmin")
    : user?.role === "manager"
      ? t("layout.roleManager")
      : t("layout.rolePlayer");
  const isActive = (path: string) => path === "/" ? location === "/" : location === path || location.startsWith(`${path}/`);

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-sidebar shrink-0">
        <div className="p-4 border-b border-sidebar-border">
          <Logo />
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map(item => (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.path)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
              data-testid={`nav-${item.path.replace(/\//g, "-").replace(/^-/, "")}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm">
              {(user?.nickname || user?.name)?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.nickname || user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.nickname ? user.name : roleLabel}</p>
            </div>
          </div>
          <div className="px-3">
            <LanguageToggle className="w-full justify-center" />
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5" />
            {t("layout.logout")}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background sticky top-0 z-40">
          <Logo />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="p-2 rounded-lg hover-elevate"
              aria-label={t("layout.menuOpen")}
              data-testid="button-mobile-menu"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-background">
          <div />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile Nav Overlay */}
        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-background" data-testid="mobile-nav">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Logo />
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-lg hover-elevate"
                aria-label={t("layout.menuClose")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 space-y-1">
              {visibleNavItems.map(item => (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive(item.path)
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
              <button
                onClick={logout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-5 h-5" />
                {t("layout.logout")}
              </button>
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-background px-2 py-2 safe-area-inset-bottom">
          {visibleNavItems.slice(0, 5).map(item => (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors min-w-[52px]",
                isActive(item.path)
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              data-testid={`bottomnav-${item.path.replace(/\//g, "-").replace(/^-/, "")}`}
            >
              {item.icon}
              <span className="text-[10px]">{item.label.split(" ")[0]}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
