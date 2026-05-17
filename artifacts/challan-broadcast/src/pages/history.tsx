import { useGetBroadcastHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, CheckCircle2, XCircle, StopCircle, Clock, Send, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
    stopped: { label: "Stopped", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", icon: StopCircle },
    failed: { label: "Failed", className: "bg-red-500/15 text-red-400 border-red-500/20", icon: XCircle },
    running: { label: "Running", className: "bg-primary/15 text-primary border-primary/20", icon: Clock },
  };
  const conf = map[status] ?? { label: status, className: "bg-muted text-muted-foreground", icon: Clock };
  const Icon = conf.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border", conf.className)}>
      <Icon className="w-3 h-3" />
      {conf.label}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function SuccessRate({ sent, total }: { sent: number; total: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-yellow-400" : "bg-red-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function HistoryPage() {
  const { data: history, isLoading } = useGetBroadcastHistory({
    query: { refetchInterval: 10000 },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Broadcast History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Past broadcast sessions and their results</p>
      </div>

      {/* Summary row */}
      {history && history.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <History className="w-8 h-8 text-primary opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Total Sessions</p>
                <p className="text-2xl font-bold text-foreground">{history.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-primary opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Total Reached</p>
                <p className="text-2xl font-bold text-foreground">{history.reduce((s, h) => s + h.total, 0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Send className="w-8 h-8 text-emerald-400 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Total Sent</p>
                <p className="text-2xl font-bold text-emerald-400">{history.reduce((s, h) => s + h.sent, 0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-400 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Total Failed</p>
                <p className="text-2xl font-bold text-red-400">{history.reduce((s, h) => s + h.failed, 0)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Session Log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <History className="w-10 h-10 text-muted-foreground opacity-30" />
              <div>
                <p className="text-sm font-medium text-foreground">No broadcasts yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Start your first broadcast from the Broadcast page</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Session ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Violation</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Progress</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Sent / Total</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                      data-testid={`row-history-${record.id}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">{record.id.slice(-8)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{formatDate(record.startedAt)}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{record.violation}</td>
                      <td className="px-4 py-3 text-xs font-medium text-foreground">₹{record.amount}</td>
                      <td className="px-4 py-3">
                        <SuccessRate sent={record.sent} total={record.total} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="text-emerald-400">{record.sent}</span>
                        <span className="text-muted-foreground"> / {record.total}</span>
                        {record.failed > 0 && (
                          <span className="text-red-400 ml-1">({record.failed} failed)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={record.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
