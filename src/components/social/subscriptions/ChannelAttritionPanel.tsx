import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCcw, Users, UserMinus, UserCheck, Sparkles, Zap, Play } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';

interface Props { profileKey: string }

type ChannelKind = 'public' | 'private';

interface ChannelTarget {
  kind: ChannelKind;
  chat_id: string | null;
  label: string;
}

interface MemberRow {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  joined_at: string;
  left_at: string | null;
  is_seed: boolean;
  seed_batch_id: string | null;
  source: string;
  welcomed_at: string | null;
}

interface SnapshotRow {
  ts: string;
  total_members: number;
  seed_active: number;
  organic_active: number;
  organic_joins_window: number;
  organic_leaves_window: number;
  seed_leaves_window: number;
}

interface SeedBatch {
  id: string;
  channel_kind: ChannelKind;
  chat_id: string;
  started_at: string;
  ended_at: string | null;
  detected_via: string;
  expected_count: number | null;
  actual_count: number;
  trigger_window_joins: number | null;
  trigger_rolling_median: number | null;
  notes: string | null;
}

interface RetentionRow {
  chat_id: string;
  channel_kind: ChannelKind;
  is_seed: boolean;
  cohort_week: string;
  cohort_size: number;
  still_active: number;
  surviving_d1: number;
  surviving_d3: number;
  surviving_d7: number;
  surviving_d14: number;
  surviving_d30: number;
  surviving_d60: number;
  surviving_d90: number;
}

export function ChannelAttritionPanel({ profileKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [targets, setTargets] = useState<ChannelTarget[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotRow[]>>({});
  const [members, setMembers] = useState<Record<string, MemberRow[]>>({});
  const [batches, setBatches] = useState<SeedBatch[]>([]);
  const [retention, setRetention] = useState<RetentionRow[]>([]);
  const [activeKind, setActiveKind] = useState<ChannelKind>('public');

  const load = async () => {
    setLoading(true);
    try {
      const { data: cfg } = await supabase
        .from('profile_subscription_configs')
        .select('public_chat_id, private_chat_id')
        .eq('profile_key', profileKey)
        .maybeSingle();
      const targetList: ChannelTarget[] = [
        { kind: 'public',  chat_id: cfg?.public_chat_id  ?? null, label: 'Public channel' },
        { kind: 'private', chat_id: cfg?.private_chat_id ?? null, label: 'Private channel' },
      ];
      setTargets(targetList);

      const chatIds = targetList.map(t => t.chat_id).filter(Boolean) as string[];
      if (chatIds.length === 0) { setLoading(false); return; }

      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const [snapsRes, batchesRes, retRes, memPubRes, memPrivRes] = await Promise.all([
        supabase.from('nolube_channel_snapshots')
          .select('chat_id, ts, total_members, seed_active, organic_active, organic_joins_window, organic_leaves_window, seed_leaves_window')
          .in('chat_id', chatIds).gte('ts', since).order('ts', { ascending: true }),
        supabase.from('nolube_seed_batches')
          .select('*').in('chat_id', chatIds).order('started_at', { ascending: false }).limit(50),
        supabase.from('nolube_member_retention')
          .select('*').eq('profile_key', profileKey).order('cohort_week', { ascending: false }).limit(40),
        targetList[0].chat_id ? supabase.from('nolube_channel_members')
          .select('id, telegram_user_id, username, first_name, joined_at, left_at, is_seed, seed_batch_id, source, welcomed_at')
          .eq('chat_id', targetList[0].chat_id).order('joined_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
        targetList[1].chat_id ? supabase.from('nolube_channel_members')
          .select('id, telegram_user_id, username, first_name, joined_at, left_at, is_seed, seed_batch_id, source, welcomed_at')
          .eq('chat_id', targetList[1].chat_id).order('joined_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
      ]);

      const snapMap: Record<string, SnapshotRow[]> = {};
      for (const r of (snapsRes.data ?? []) as any[]) {
        (snapMap[r.chat_id] ||= []).push(r);
      }
      setSnapshots(snapMap);
      setBatches((batchesRes.data ?? []) as SeedBatch[]);
      setRetention((retRes.data ?? []) as RetentionRow[]);
      const memMap: Record<string, MemberRow[]> = {};
      if (targetList[0].chat_id) memMap[targetList[0].chat_id] = (memPubRes.data ?? []) as MemberRow[];
      if (targetList[1].chat_id) memMap[targetList[1].chat_id] = (memPrivRes.data ?? []) as MemberRow[];
      setMembers(memMap);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load attrition data');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [profileKey]);

  const runSync = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('nolube-channel-roster-sync', {
        body: { profile_key: profileKey },
      });
      if (error) throw error;
      toast.success(`Sync done — ${(data?.results ?? []).map((r: any) => `${r.channel_kind}: +${r.new_inserts}/-${r.marked_left}`).join(' | ')}`);
      await load();
    } catch (e: any) {
      toast.error('Sync failed: ' + (e?.message ?? String(e)));
    }
    setRunning(false);
  };

  const startManualBatch = async (kind: ChannelKind, chatId: string) => {
    const expectedRaw = prompt(`How many seeded members are you adding to the ${kind} channel? (optional)`);
    const expected = expectedRaw && /^\d+$/.test(expectedRaw) ? parseInt(expectedRaw, 10) : null;
    const { error } = await supabase.from('nolube_seed_batches').insert({
      profile_key: profileKey,
      channel_kind: kind,
      chat_id: chatId,
      detected_via: 'manual',
      expected_count: expected,
      notes: 'Manual seed window opened from admin UI.',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Manual seed window opened — next joiners will be tagged as seed.');
    load();
  };

  const closeBatch = async (batchId: string) => {
    const { error } = await supabase.from('nolube_seed_batches')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', batchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Seed window closed.');
    load();
  };

  const reclassifyMember = async (memberId: string, isSeed: boolean) => {
    const { error } = await supabase.from('nolube_channel_members')
      .update({ is_seed: isSeed, classification_locked: true })
      .eq('id', memberId);
    if (error) { toast.error(error.message); return; }
    toast.success(isSeed ? 'Marked as seed.' : 'Marked as organic.');
    load();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Channel Attrition</h3>
          <p className="text-sm text-muted-foreground">
            Seed vs organic membership tracking. Roster syncs every 15 min via MTProto;
            spikes (≥20 joins in 15 min AND ≥5× the 7-day median) auto-open a seed batch.
          </p>
        </div>
        <Button onClick={runSync} disabled={running} size="sm">
          {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
          Sync now
        </Button>
      </div>

      <Tabs value={activeKind} onValueChange={v => setActiveKind(v as ChannelKind)}>
        <TabsList>
          {targets.map(t => (
            <TabsTrigger key={t.kind} value={t.kind}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {targets.map(t => (
          <TabsContent key={t.kind} value={t.kind} className="space-y-4 mt-3">
            <ChannelView
              target={t}
              snapshots={t.chat_id ? snapshots[t.chat_id] ?? [] : []}
              members={t.chat_id ? members[t.chat_id] ?? [] : []}
              batches={batches.filter(b => b.chat_id === t.chat_id)}
              retention={retention.filter(r => r.chat_id === t.chat_id)}
              onStartManualBatch={() => t.chat_id && startManualBatch(t.kind, t.chat_id)}
              onCloseBatch={closeBatch}
              onReclassify={reclassifyMember}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---------- per-channel view ----------
function ChannelView({
  target, snapshots, members, batches, retention,
  onStartManualBatch, onCloseBatch, onReclassify,
}: {
  target: ChannelTarget;
  snapshots: SnapshotRow[];
  members: MemberRow[];
  batches: SeedBatch[];
  retention: RetentionRow[];
  onStartManualBatch: () => void;
  onCloseBatch: (id: string) => void;
  onReclassify: (id: string, isSeed: boolean) => void;
}) {
  const latest = snapshots[snapshots.length - 1];
  const openBatch = batches.find(b => !b.ended_at);

  if (!target.chat_id) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">
      No <b>{target.kind}</b> chat_id configured. Set it in the Bot &amp; Channel tab to begin tracking.
    </CardContent></Card>;
  }

  const chartData = snapshots.map(s => ({
    ts: new Date(s.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    total: s.total_members,
    seed: s.seed_active,
    organic: s.organic_active,
  }));

  // organic-only members list
  const organicJoins = members.filter(m => !m.is_seed && !m.left_at).slice(0, 50);
  const organicLeaves = members.filter(m => !m.is_seed && m.left_at).slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat icon={Users} label="Total active" value={latest?.total_members ?? 0} />
        <Stat icon={Sparkles} label="Seed active"
          value={latest?.seed_active ?? 0}
          hint="From bulk-seeded windows" />
        <Stat icon={UserCheck} label="Organic active"
          value={latest?.organic_active ?? 0}
          hint="Real, untracked joiners — this is the number to watch" />
        <Stat icon={UserMinus} label="Last-15m churn"
          value={(latest?.organic_leaves_window ?? 0) + (latest?.seed_leaves_window ?? 0)}
          hint={`organic: ${latest?.organic_leaves_window ?? 0} · seed: ${latest?.seed_leaves_window ?? 0}`} />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant={openBatch ? 'outline' : 'default'} onClick={onStartManualBatch}>
          <Play className="h-4 w-4 mr-1" />
          {openBatch ? 'Open another seed window' : 'Open manual seed window'}
        </Button>
        {openBatch && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Zap className="h-3 w-3" /> Open: {openBatch.detected_via} · since {new Date(openBatch.started_at).toLocaleString()}
            <button className="ml-2 underline text-xs" onClick={() => onCloseBatch(openBatch.id)}>close</button>
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Membership trend (14 days)</CardTitle></CardHeader>
        <CardContent style={{ height: 260 }}>
          {chartData.length === 0
            ? <div className="text-sm text-muted-foreground">No snapshots yet — run a sync.</div>
            : <ResponsiveContainer><LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" minTickGap={32} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" dot={false} />
                <Line type="monotone" dataKey="seed" stroke="hsl(var(--muted-foreground))" dot={false} />
                <Line type="monotone" dataKey="organic" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} />
              </LineChart></ResponsiveContainer>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-member retention by weekly cohort</CardTitle></CardHeader>
        <CardContent>
          <RetentionTable rows={retention} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent organic joins</CardTitle></CardHeader>
          <CardContent>
            <MemberTable rows={organicJoins} onReclassify={onReclassify} mode="joins" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent organic leaves</CardTitle></CardHeader>
          <CardContent>
            <MemberTable rows={organicLeaves} onReclassify={onReclassify} mode="leaves" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Seed batches</CardTitle></CardHeader>
        <CardContent>
          {batches.length === 0
            ? <div className="text-sm text-muted-foreground">No seed batches yet.</div>
            : <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Detected via</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">{new Date(b.started_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{b.detected_via}</Badge></TableCell>
                      <TableCell>{b.expected_count ?? '—'}</TableCell>
                      <TableCell>{b.actual_count}</TableCell>
                      <TableCell className="text-xs">
                        {b.trigger_window_joins != null
                          ? `${b.trigger_window_joins} joins vs median ${b.trigger_rolling_median?.toFixed(2) ?? '0'}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {b.ended_at
                          ? <Badge variant="secondary">closed</Badge>
                          : <button className="text-xs underline" onClick={() => onCloseBatch(b.id)}>close</button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
        <div className="text-2xl font-semibold mt-1">{value.toLocaleString()}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MemberTable({
  rows, onReclassify, mode,
}: { rows: MemberRow[]; onReclassify: (id: string, isSeed: boolean) => void; mode: 'joins' | 'leaves' }) {
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">None.</div>;
  return (
    <div className="max-h-80 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>{mode === 'joins' ? 'Joined' : 'Left'}</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(m => {
            const label = m.username ? '@' + m.username : (m.first_name || `id:${m.telegram_user_id}`);
            const when = new Date(mode === 'joins' ? m.joined_at : (m.left_at ?? m.joined_at)).toLocaleString();
            return (
              <TableRow key={m.id}>
                <TableCell className="text-xs">{label}</TableCell>
                <TableCell className="text-xs">{when}</TableCell>
                <TableCell className="text-right">
                  <button className="text-[10px] underline text-muted-foreground"
                    onClick={() => onReclassify(m.id, true)}>mark seed</button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RetentionTable({ rows }: { rows: RetentionRow[] }) {
  // pivot: rows already include organic + seed cohorts
  const organic = useMemo(() => rows.filter(r => !r.is_seed), [rows]);
  const seed = useMemo(() => rows.filter(r => r.is_seed), [rows]);

  if (rows.length === 0) return <div className="text-sm text-muted-foreground">No cohorts yet.</div>;

  const renderTable = (title: string, list: RetentionRow[]) => (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{title}</div>
      {list.length === 0
        ? <div className="text-xs text-muted-foreground">—</div>
        : <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort week</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>D1</TableHead>
                  <TableHead>D3</TableHead>
                  <TableHead>D7</TableHead>
                  <TableHead>D14</TableHead>
                  <TableHead>D30</TableHead>
                  <TableHead>D60</TableHead>
                  <TableHead>D90</TableHead>
                  <TableHead>Still</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(r => {
                  const pct = (n: number) => r.cohort_size ? `${Math.round((n / r.cohort_size) * 100)}%` : '—';
                  return (
                    <TableRow key={`${r.cohort_week}-${r.is_seed}`}>
                      <TableCell className="text-xs">{new Date(r.cohort_week).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">{r.cohort_size}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d1)}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d3)}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d7)}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d14)}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d30)}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d60)}</TableCell>
                      <TableCell className="text-xs">{pct(r.surviving_d90)}</TableCell>
                      <TableCell className="text-xs">{pct(r.still_active)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>}
    </div>
  );

  return (
    <div className="space-y-4">
      {renderTable('Organic cohorts (real joiners)', organic)}
      {renderTable('Seed cohorts (bulk-added)', seed)}
    </div>
  );
}