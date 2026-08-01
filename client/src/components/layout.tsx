import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import {
  Calendar, Users, Vote, CreditCard, Settings, LogOut,
  Shield, Menu, X, Sun, Moon, Home
} from "lucide-react";

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: <Home className="w-5 h-5" /> },
  { path: "/calendar", label: "Kalendár", icon: <Calendar className="w-5 h-5" /> },
  { path: "/polls", label: "Ankety", icon: <Vote className="w-5 h-5" /> },
  { path: "/payments", label: "Platby", icon: <CreditCard className="w-5 h-5" /> },
  { path: "/admin/members", label: "Členovia", icon: <Users className="w-5 h-5" />, adminOnly: true },
  { path: "/admin/payments", label: "Správa platieb", icon: <CreditCard className="w-5 h-5" />, adminOnly: true },
  { path: "/admin/bank", label: "Banka", icon: <Shield className="w-5 h-5" />, adminOnly: true },
  { path: "/settings", label: "Nastavenia", icon: <Settings className="w-5 h-5" /> },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none" aria-label="Futbal App">
        <circle cx="16" cy="16" r="14" fill="hsl(var(--primary))" />
        <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" />
        <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(72 16 16)" />
        <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(144 16 16)" />
        <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(216 16 16)" />
        <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(288 16 16)" />
      </svg>
      <span className="font-serif font-bold text-lg tracking-tight hidden sm:block">O5MY</span>
    </Link>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg hover-elevate text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Prepnúť tmavý režim"
      data-testid="button-theme-toggle"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const visibleNavItems = navItems.filter(item => !item.adminOnly || user?.role === "admin");

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
                location === item.path
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
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role === "admin" ? "Admin" : "Hráč"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5" />
            Odhlásiť
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background sticky top-0 z-40">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="p-2 rounded-lg hover-elevate"
              aria-label="Menu"
              data-testid="button-mobile-menu"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-background">
          <div />
          <ThemeToggle />
        </header>

        {/* Mobile Nav Overlay */}
        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-background" data-testid="mobile-nav">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Logo />
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-lg hover-elevate"
                aria-label="Zavrieť menu"
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
                    location === item.path
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
                Odhlásiť
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
                location === item.path
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
