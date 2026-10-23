import { NavLink, Outlet } from "react-router-dom";
import ConnectionStatusBar from "@/components/ConnectionStatusBar";
import InstallAppBanner from "@/components/InstallAppBanner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { MapPin, LayoutDashboard, Clock, Shield, LogOut, FileEdit, CalendarDays, CloudOff, RefreshCw, LifeBuoy } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

const allNavItems = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "admin", "manager"] },
  { to: "/app", icon: Clock, label: "Ponto", end: true, roles: ["owner", "admin", "manager", "employee"] },
  { to: "/app/my-punches", icon: CalendarDays, label: "Meu Ponto", roles: ["owner", "admin", "manager", "employee"] },
  { to: "/app/adjustments", icon: FileEdit, label: "Ajustes", roles: ["owner", "admin", "manager", "employee"] },
  { to: "/app/admin", icon: Shield, label: "Admin", roles: ["owner", "admin"] },
  { to: "/app/suporte", icon: LifeBuoy, label: "Suporte", roles: ["owner", "admin", "manager", "employee"] },
];

const AppLayout = () => {
  const { status } = useOnlineStatus();
  const { signOut, user, role } = useAuth();
  const { pendingCount, failedCount, syncing, retryQueue } = useOfflineQueue();

  const navItems = allNavItems.filter((item) =>
    role ? item.roles.includes(role) : false
  );

  const totalUnsynced = pendingCount + failedCount;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card">
        <InstallAppBanner />
        <ConnectionStatusBar status={status} />
        {totalUnsynced > 0 && (
          <div
            className={`flex items-center justify-between gap-2 px-4 py-1.5 text-xs font-semibold ${
              failedCount > 0
                ? "bg-destructive/15 text-destructive"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            }`}
            role="status"
            aria-live="polite"
          >
            <span className="flex items-center gap-1.5">
              <CloudOff className="h-3.5 w-3.5" />
              {failedCount > 0
                ? `${failedCount} registro(s) com falha • ${pendingCount} pendente(s)`
                : `${pendingCount} registro(s) aguardando sincronização`}
            </span>
            <button
              onClick={retryQueue}
              disabled={syncing}
              className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 hover:bg-background disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Enviando..." : "Reenviar"}
            </button>
          </div>
        )}
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <MapPin className="h-5 w-5 text-primary" />
            <span>GeoPonto</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            {role && ["owner", "admin", "manager"].includes(role) && (
              <NotificationBell />
            )}
            <button
              onClick={signOut}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Desktop nav */}
        <div className="hidden border-t md:block">
          <div className="flex gap-1 px-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="sticky bottom-0 z-40 border-t bg-card md:hidden">
        <div className="flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground"
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
