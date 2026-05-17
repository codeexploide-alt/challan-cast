import { Link, useLocation } from "wouter";
import { LayoutDashboard, Radio, History, Shield, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useGetSessionStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/broadcast", label: "Broadcast", icon: Radio },
  { href: "/history", label: "History", icon: History },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: session } = useGetSessionStatus({
    query: {
      refetchInterval: 3000,
    },
  });

  const statusIcon = () => {
    if (!session) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    if (session.status === "connected") return <Wifi className="w-4 h-4 text-emerald-400" />;
    if (session.status === "connecting" || session.status === "qr_ready")
      return <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />;
    return <WifiOff className="w-4 h-4 text-red-400" />;
  };

  const statusLabel = () => {
    if (!session) return "Checking...";
    if (session.status === "connected") return session.phone ?? "Connected";
    if (session.status === "qr_ready") return "Scan QR";
    if (session.status === "connecting") return "Connecting...";
    return "Disconnected";
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-sidebar">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground tracking-wide">ChallanCast</p>
              <p className="text-xs text-muted-foreground">Enforcement System</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* WhatsApp Status */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2.5">
            {statusIcon()}
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{statusLabel()}</p>
              <p className="text-xs text-muted-foreground">WhatsApp</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
