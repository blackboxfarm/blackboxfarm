import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface AuditResult {
  handle: string;
  followerCount: number;
  sampleSize: number;
  realPct: number;
  suspiciousPct: number;
  botPct: number;
  geoBreakdown: { location: string; count: number; pct: number }[];
  signalsSummary: Record<string, number>;
  topSuspects: { username: string; score: number; signals: string[]; location?: string }[];
  verdict: string;
}

interface PastAudit {
  id: string;
  handle: string;
  real_pct: number;
  suspicious_pct: number;
  bot_pct: number;
  sample_size: number;
  verdict: string;
  created_at: string;
}

const COLORS = ["hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--chart-1))"];

export function FollowerAuditTab() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [pastAudits, setPastAudits] = useState<PastAudit[]>([]);
  const [showPast, setShowPast] = useState(false);

  const runAudit = async () => {
    if (!handle.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("follower-audit", {
        body: { handle: handle.trim(), sampleSize: 500 },
      });
      if (error) throw error;
      setResult(data as AuditResult);
      toast.success(`Audit complete for @${data.handle}`);
    } catch (err: any) {
      toast.error(err.message || "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  const loadPastAudits = async () => {
    const { data } = await supabase
      .from("follower_audits" as any)
      .select("id, handle, real_pct, suspicious_pct, bot_pct, sample_size, verdict, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setPastAudits(data as unknown as PastAudit[]);
    setShowPast(true);
  };

  const pieData = result
    ? [
        { name: "Real", value: result.realPct },
        { name: "Suspicious", value: result.suspiciousPct },
        { name: "Bot", value: result.botPct },
      ]
    : [];

  const verdictColor = result
    ? result.realPct >= 70
      ? "text-green-400"
      : result.realPct >= 40
        ? "text-yellow-400"
        : "text-red-400"
    : "";

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" />
            Follower Audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                placeholder="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                className="pl-8"
                onKeyDown={(e) => e.key === "Enter" && runAudit()}
              />
            </div>
            <Button onClick={runAudit} disabled={loading || !handle.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              {loading ? "Auditing..." : "Audit Followers"}
            </Button>
            <Button variant="outline" size="sm" onClick={loadPastAudits}>
              <Clock className="h-4 w-4 mr-1" /> History
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Samples ~500 followers via Apify (~$0.50–$1.50 per audit). Results are cached.
          </p>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-muted-foreground">Scraping followers and scoring bot signals...</p>
            <p className="text-xs text-muted-foreground mt-1">This takes 30–90 seconds</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Verdict */}
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">@{result.handle}</h3>
                  <p className="text-sm text-muted-foreground">
                    {result.followerCount.toLocaleString()} followers · {result.sampleSize} sampled
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${verdictColor}`}>
                    {result.realPct.toFixed(0)}% Real
                  </p>
                  <Badge variant={result.realPct >= 70 ? "default" : result.realPct >= 40 ? "secondary" : "destructive"}>
                    {result.realPct >= 70 ? "Good" : result.realPct >= 40 ? "Mixed" : "Poor"}
                  </Badge>
                </div>
              </div>
              <p className={`mt-3 text-sm font-medium ${verdictColor}`}>{result.verdict}</p>
            </CardContent>
          </Card>

          {/* Chart + Geo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Follower Breakdown</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-1"><MapPin className="h-4 w-4" /> Geographic Distribution</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.geoBreakdown.slice(0, 8).map((g) => (
                    <div key={g.location} className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[200px]">{g.location}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${Math.min(g.pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">{g.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Signal Summary */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Bot Signal Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.signalsSummary)
                  .sort((a, b) => b[1] - a[1])
                  .map(([signal, count]) => (
                    <Badge key={signal} variant="outline" className="text-xs">
                      {signal}: {count}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Suspects Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                Top 20 Most Suspicious Followers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact>Username</TableHead>
                    <TableHead compact>Score</TableHead>
                    <TableHead compact>Location</TableHead>
                    <TableHead compact>Signals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.topSuspects.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell compact>
                        <a
                          href={`https://x.com/${s.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          @{s.username}
                        </a>
                      </TableCell>
                      <TableCell compact>
                        <Badge variant={s.score >= 40 ? "destructive" : s.score >= 20 ? "secondary" : "default"}>
                          {s.score}
                        </Badge>
                      </TableCell>
                      <TableCell compact className="text-muted-foreground">{s.location || "—"}</TableCell>
                      <TableCell compact>
                        <div className="flex flex-wrap gap-1">
                          {s.signals.map((sig, j) => (
                            <span key={j} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{sig}</span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Past Audits */}
      {showPast && pastAudits.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Past Audits</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead compact>Handle</TableHead>
                  <TableHead compact>Real %</TableHead>
                  <TableHead compact>Suspicious %</TableHead>
                  <TableHead compact>Bot %</TableHead>
                  <TableHead compact>Sample</TableHead>
                  <TableHead compact>Verdict</TableHead>
                  <TableHead compact>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastAudits.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => setHandle(a.handle)}>
                    <TableCell compact>@{a.handle}</TableCell>
                    <TableCell compact className="text-green-400">{a.real_pct}%</TableCell>
                    <TableCell compact className="text-yellow-400">{a.suspicious_pct}%</TableCell>
                    <TableCell compact className="text-red-400">{a.bot_pct}%</TableCell>
                    <TableCell compact>{a.sample_size}</TableCell>
                    <TableCell compact className="max-w-[200px] truncate">{a.verdict}</TableCell>
                    <TableCell compact className="text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
