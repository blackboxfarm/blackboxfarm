import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Users, Bot, UserCheck, UserX, ScanSearch, RefreshCw, CalendarIcon } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AuditRun {
  id: string;
  chat_id: number;
  chat_title: string | null;
  total_members: number;
  seeded_count: number;
  organic_count: number;
  bot_count: number;
  unknown_count: number;
  seeded_threshold: number;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AuditMember {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_bot: boolean;
  join_date: string | null;
  participant_type: string;
  classification: string;
}

export function ChannelMemberAudit() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AuditRun | null>(null);
  const [members, setMembers] = useState<AuditMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [channelInput, setChannelInput] = useState("HoldersIntel");
  const [cutoffDate, setCutoffDate] = useState<Date>(new Date("2026-03-25"));
  const [filter, setFilter] = useState<"all" | "organic" | "seeded" | "bot">("all");

  const loadRuns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("telegram_channel_audit_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (data) setRuns(data as unknown as AuditRun[]);
    setLoading(false);
  };

  const loadMembers = async (runId: string) => {
    setLoadingMembers(true);
    const { data } = await supabase
      .from("telegram_channel_member_audit")
      .select("*")
      .eq("audit_batch_id", runId)
      .order("join_date", { ascending: true })
      .limit(1000);
    if (data) setMembers(data as unknown as AuditMember[]);
    setLoadingMembers(false);
  };

  useEffect(() => { loadRuns(); }, []);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-mtproto-auth", {
        body: {
          action: "audit_channel_members",
          channelUsername: channelInput,
          seededCutoffDate: cutoffDate.toISOString().split("T")[0],
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Audit complete: ${data.totalMembers} members found (${data.organic} organic)`);
        await loadRuns();
      } else {
        toast.error(data?.error || "Audit failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Audit failed");
    }
    setAuditing(false);
  };

  const selectRun = (run: AuditRun) => {
    setSelectedRun(run);
    loadMembers(run.id);
  };

  const filteredMembers = members.filter(m => {
    if (filter === "organic") return m.classification === "organic";
    if (filter === "seeded") return m.classification === "seeded";
    if (filter === "bot") return m.classification === "bot";
    return true;
  });

  const classificationBadge = (c: string) => {
    switch (c) {
      case "organic": return <Badge className="text-[10px] bg-green-600"><UserCheck className="h-3 w-3 mr-1" />Organic</Badge>;
      case "seeded": return <Badge variant="secondary" className="text-[10px]"><UserX className="h-3 w-3 mr-1" />Seeded</Badge>;
      case "bot": return <Badge variant="outline" className="text-[10px]"><Bot className="h-3 w-3 mr-1" />Bot</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Run Audit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScanSearch className="h-4 w-4" /> Channel Member Audit (MTProto)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pulls full member list via Telegram Client API. Members who joined on or before the cutoff date are classified as seeded. Joins after are organic.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              placeholder="Channel username or chat ID"
              className="h-8 text-xs w-48"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Seeded before:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-8 w-[150px] justify-start text-left text-xs font-normal",
                      !cutoffDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {cutoffDate ? format(cutoffDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={cutoffDate}
                    onSelect={(d) => d && setCutoffDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button size="sm" onClick={runAudit} disabled={auditing}>
              {auditing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ScanSearch className="h-3 w-3 mr-1" />}
              Run Audit
            </Button>
            <Button variant="outline" size="sm" onClick={loadRuns} disabled={loading}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Past Audit Runs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Audit History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : runs.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No audits yet. Run one above.</p>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <div
                  key={run.id}
                  onClick={() => selectRun(run)}
                  className={`border rounded-md p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedRun?.id === run.id ? "border-primary bg-muted/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{run.chat_title || `Chat ${run.chat_id}`}</span>
                      <Badge variant={run.status === "completed" ? "default" : run.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                        {run.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(run.started_at), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  {run.status === "completed" && (
                    <div className="grid grid-cols-5 gap-2 mt-2">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-sm font-bold">{run.total_members}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Organic</p>
                        <p className="text-sm font-bold text-green-500">{run.organic_count}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Seeded</p>
                        <p className="text-sm font-bold text-muted-foreground">{run.seeded_count}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Bots</p>
                        <p className="text-sm font-bold text-muted-foreground">{run.bot_count}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Organic %</p>
                        <p className="text-sm font-bold text-green-500">
                          {run.total_members > 0 ? Math.round((run.organic_count / run.total_members) * 100) : 0}%
                        </p>
                      </div>
                    </div>
                  )}
                  {run.error_message && (
                    <p className="text-xs text-destructive mt-1">{run.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Member Details */}
      {selectedRun && selectedRun.status === "completed" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Members — {selectedRun.chat_title} ({filteredMembers.length} shown)
              </CardTitle>
              <div className="flex rounded-md border overflow-hidden">
                {(["all", "organic", "seeded", "bot"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-xs capitalize ${
                      filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Join Date</TableHead>
                      <TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Classification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No members in this filter
                        </TableCell>
                      </TableRow>
                    ) : filteredMembers.map(m => (
                      <TableRow key={m.id} className={m.classification === "seeded" ? "opacity-50" : ""}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {m.join_date ? (
                            <>
                              {format(new Date(m.join_date), "MMM d, yyyy")}
                              <span className="text-muted-foreground ml-1">
                                {formatDistanceToNow(new Date(m.join_date), { addSuffix: true })}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {m.telegram_username ? `@${m.telegram_username}` : m.first_name || String(m.telegram_user_id)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] capitalize">{m.participant_type}</Badge>
                        </TableCell>
                        <TableCell>{classificationBadge(m.classification)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
