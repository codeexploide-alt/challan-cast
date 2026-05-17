import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSessionStatus,
  useGetQrCode,
  useDisconnectSession,
  useGetBroadcastStatus,
  getGetSessionStatusQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wifi, WifiOff, Loader2, QrCode, LogOut, Radio, CheckCircle2, XCircle, Send, Users
} from "lucide-react";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showQr, setShowQr] = useState(false);

  const { data: session, isLoading: sessionLoading } = useGetSessionStatus({
    query: { refetchInterval: 3000 },
  });

  const { data: qrData } = useGetQrCode({
    query: {
      refetchInterval: showQr ? 3000 : false,
      enabled: showQr,
    },
  });

  const { data: broadcastStatus } = useGetBroadcastStatus({
    query: {
      refetchInterval: (data) => (data?.active ? 2000 : 5000),
    },
  });

  const disconnectMutation = useDisconnectSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionStatusQueryKey() });
      },
    },
  });

  const isConnected = session?.status === "connected";
  const isConnecting = session?.status === "connecting" || session?.status === "qr_ready";

  const sentPct = broadcastStatus && broadcastStatus.total > 0
    ? Math.round((broadcastStatus.sent / broadcastStatus.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System overview and connection status</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <p className="text-sm font-semibold mt-1 text-foreground">
                  {sessionLoading ? "Checking..." : (session?.status ?? "Unknown")}
                </p>
              </div>
              {isConnected ? (
                <Wifi className="w-8 h-8 text-primary opacity-80" />
              ) : isConnecting ? (
                <Loader2 className="w-8 h-8 text-yellow-400 animate-spin opacity-80" />
              ) : (
                <WifiOff className="w-8 h-8 text-muted-foreground opacity-60" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Broadcast</p>
                <p className="text-sm font-semibold mt-1 text-foreground capitalize">
                  {broadcastStatus?.status ?? "idle"}
                </p>
              </div>
              <Radio className={`w-8 h-8 opacity-80 ${broadcastStatus?.active ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Sent</p>
                <p className="text-2xl font-bold mt-1 text-primary">{broadcastStatus?.sent ?? 0}</p>
              </div>
              <Send className="w-8 h-8 text-primary opacity-40" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Failed</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{broadcastStatus?.failed ?? 0}</p>
              </div>
              <XCircle className="w-8 h-8 text-destructive opacity-40" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* WhatsApp Connection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="w-4 h-4 text-primary" />
              WhatsApp Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isConnected ? "bg-emerald-400" :
                isConnecting ? "bg-yellow-400 animate-pulse" :
                "bg-red-400"
              }`} />
              <div>
                <p className="text-sm font-medium text-foreground capitalize">{session?.status ?? "Unknown"}</p>
                {session?.phone && (
                  <p className="text-xs text-muted-foreground">+{session.phone}</p>
                )}
              </div>
              <Badge
                variant={isConnected ? "default" : "secondary"}
                className="ml-auto text-xs"
              >
                {isConnected ? "Live" : isConnecting ? "Pending" : "Offline"}
              </Badge>
            </div>

            {/* QR Code display */}
            {showQr && qrData?.qr && (
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-lg">
                  <img
                    src={qrData.qr}
                    alt="WhatsApp QR Code"
                    className="w-44 h-44"
                    data-testid="qr-code-image"
                  />
                </div>
              </div>
            )}

            {showQr && !qrData?.qr && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {!isConnected && (
                <Button
                  size="sm"
                  variant={showQr ? "secondary" : "default"}
                  className="flex-1"
                  onClick={() => setShowQr(!showQr)}
                  data-testid="button-show-qr"
                >
                  <QrCode className="w-3.5 h-3.5 mr-1.5" />
                  {showQr ? "Hide QR" : "Show QR"}
                </Button>
              )}
              {isConnected && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Disconnect
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {isConnected
                ? "WhatsApp is ready to send messages"
                : "Scan QR code with your WhatsApp to connect"}
            </p>
          </CardContent>
        </Card>

        {/* Active Broadcast */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Radio className="w-4 h-4 text-primary" />
              Active Broadcast
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {broadcastStatus?.active ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-medium text-foreground">Running</span>
                  <Badge variant="default" className="ml-auto text-xs">Live</Badge>
                </div>

                {/* Progress ring */}
                <div className="flex items-center gap-5">
                  <div className="relative w-20 h-20 shrink-0">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle
                        cx="40" cy="40" r="32"
                        fill="none" stroke="hsl(var(--muted))" strokeWidth="6"
                      />
                      <circle
                        cx="40" cy="40" r="32"
                        fill="none" stroke="hsl(var(--primary))" strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 32}`}
                        strokeDashoffset={`${2 * Math.PI * 32 * (1 - sentPct / 100)}`}
                        style={{ transition: "stroke-dashoffset 0.5s ease" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-primary">{sentPct}%</span>
                    </div>
                  </div>

                  <div className="space-y-2 flex-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total</span>
                      <span className="text-foreground font-medium">{broadcastStatus.total}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Sent</span>
                      <span className="text-emerald-400 font-medium">{broadcastStatus.sent}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Failed</span>
                      <span className="text-red-400 font-medium">{broadcastStatus.failed}</span>
                    </div>
                    {broadcastStatus.currentNumber && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Current</span>
                        <span className="text-foreground font-mono text-xs">{broadcastStatus.currentNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                <Users className="w-10 h-10 text-muted-foreground opacity-40" />
                <div>
                  <p className="text-sm font-medium text-foreground">No active broadcast</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Go to Broadcast to start sending</p>
                </div>
                {broadcastStatus?.status === "completed" && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Last broadcast completed
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
