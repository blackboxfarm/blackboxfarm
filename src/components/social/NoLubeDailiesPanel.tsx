import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Play, Send, Loader2 } from 'lucide-react';

const PROFILE_ID = 'no_lube';

interface Profile {
  id: string;
  display_name: string;
  day_start_hour: number;
  timezone: string;
  post_hour: number;
  bg_public_url: string | null;
  bg_private_url: string | null;
  bg_public_prompt: string | null;
  bg_private_prompt: string | null;
  accent_hex: string;
  brand_tagline: string | null;
  post_to_tg_public: boolean;
  post_to_tg_private: boolean;
  enabled: boolean;
}

interface Run {
  id: string;
  local_date: string;
  status: string;
  entry_count: number;
  image_public_url: string | null;
  image_private_url: string | null;
  rendered_at: string | null;
  posted_at: string | null;
  error: string | null;
}

export function NoLubeDailiesPanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: p } = await supabase.from('leaderboard_profiles').select('*').eq('id', PROFILE_ID).maybeSingle();
    if (!p) {
      const { data: created } = await supabase.from('leaderboard_profiles').insert({
        id: PROFILE_ID, display_name: 'No Lube Alpha', day_start_hour: 6,
        timezone: 'America/Toronto', post_hour: 4, accent_hex: '#22d3ee',
        brand_tagline: 'No Lube Daily Top 20',
      }).select('*').single();
      setProfile(created as any);
    } else {
      setProfile(p as any);
    }
    const { data: r } = await supabase.from('leaderboard_daily_runs')
      .select('id, local_date, status, entry_count, image_public_url, image_private_url, rendered_at, posted_at, error')
      .eq('profile_id', PROFILE_ID).order('local_date', { ascending: false }).limit(14);
    setRuns((r || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (patch: Partial<Profile>) => {
    if (!profile) return;
    const { error } = await supabase.from('leaderboard_profiles').update(patch).eq('id', PROFILE_ID);
    if (error) return toast.error(error.message);
    setProfile({ ...profile, ...patch });
    toast.success('Saved');
  };

  const regenBg = async (variant: 'public' | 'private') => {
    setBusy(`bg_${variant}`);
    try {
      const { data, error } = await supabase.functions.invoke('leaderboard-regenerate-bg', {
        body: { profile_id: PROFILE_ID, variant, prompt: variant === 'public' ? profile?.bg_public_prompt : profile?.bg_private_prompt },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'failed');
      toast.success(`${variant} background regenerated`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const runNow = async () => {
    setBusy('build');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke('leaderboard-daily-builder', {
        body: { force_profile_id: PROFILE_ID, force_local_date: yesterday },
      });
      if (error) throw error;
      toast.success(`Built: ${JSON.stringify(data?.results?.[0] || data).slice(0, 120)}`);
      setTimeout(load, 2000);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const rerender = async (run_id: string) => {
    setBusy(`render_${run_id}`);
    try {
      const { data, error } = await supabase.functions.invoke('leaderboard-render', { body: { run_id } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'failed');
      toast.success('Re-rendered');
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const repost = async (run_id: string) => {
    setBusy(`post_${run_id}`);
    try {
      const { data, error } = await supabase.functions.invoke('leaderboard-post', { body: { run_id } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'failed');
      toast.success('Posted');
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  if (loading || !profile) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || '';
  const previewUrl = (runId: string, variant: 'public' | 'private') =>
    `https://${projectRef}.supabase.co/functions/v1/leaderboard-html?run_id=${runId}&variant=${variant}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🏆 Daily Leaderboard — {profile.display_name}
            <Badge variant={profile.enabled ? 'default' : 'outline'}>{profile.enabled ? 'enabled' : 'disabled'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>Day start hour</Label><Input type="number" min={0} max={23} value={profile.day_start_hour}
              onChange={(e) => setProfile({ ...profile, day_start_hour: Number(e.target.value) })}
              onBlur={(e) => save({ day_start_hour: Number(e.target.value) })} /></div>
            <div><Label>Post hour</Label><Input type="number" min={0} max={23} value={profile.post_hour}
              onChange={(e) => setProfile({ ...profile, post_hour: Number(e.target.value) })}
              onBlur={(e) => save({ post_hour: Number(e.target.value) })} /></div>
            <div><Label>Timezone</Label><Input value={profile.timezone}
              onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
              onBlur={(e) => save({ timezone: e.target.value })} /></div>
            <div><Label>Accent</Label><Input value={profile.accent_hex}
              onChange={(e) => setProfile({ ...profile, accent_hex: e.target.value })}
              onBlur={(e) => save({ accent_hex: e.target.value })} /></div>
          </div>
          <div><Label>Brand tagline</Label><Input value={profile.brand_tagline || ''}
            onChange={(e) => setProfile({ ...profile, brand_tagline: e.target.value })}
            onBlur={(e) => save({ brand_tagline: e.target.value })} /></div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2"><Switch checked={profile.enabled}
              onCheckedChange={(v) => save({ enabled: v })} /><Label>Enabled</Label></div>
            <div className="flex items-center gap-2"><Switch checked={profile.post_to_tg_public}
              onCheckedChange={(v) => save({ post_to_tg_public: v })} /><Label>Post to TG Public</Label></div>
            <div className="flex items-center gap-2"><Switch checked={profile.post_to_tg_private}
              onCheckedChange={(v) => save({ post_to_tg_private: v })} /><Label>Post to TG Private</Label></div>
            <Button onClick={runNow} disabled={busy === 'build'} className="ml-auto">
              {busy === 'build' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Build yesterday now
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['public', 'private'] as const).map((v) => (
          <Card key={v}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="capitalize">{v} background</span>
                <Button size="sm" onClick={() => regenBg(v)} disabled={busy === `bg_${v}`}>
                  {busy === `bg_${v}` ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Regenerate
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="aspect-[4/5] bg-muted rounded-lg overflow-hidden border">
                {(v === 'public' ? profile.bg_public_url : profile.bg_private_url) ? (
                  <img src={(v === 'public' ? profile.bg_public_url : profile.bg_private_url) || ''}
                    className="w-full h-full object-cover" />
                ) : <div className="flex items-center justify-center h-full text-muted-foreground text-xs">No background yet</div>}
              </div>
              <Textarea rows={4} placeholder="Background prompt (optional override)"
                value={(v === 'public' ? profile.bg_public_prompt : profile.bg_private_prompt) || ''}
                onChange={(e) => setProfile({ ...profile, [`bg_${v}_prompt`]: e.target.value } as any)}
                onBlur={(e) => save({ [`bg_${v}_prompt`]: e.target.value } as any)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No runs yet — click “Build yesterday now”.</div>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2 border rounded-md">
                  <div className="font-mono text-sm w-28">{r.local_date}</div>
                  <Badge variant={r.status === 'posted' ? 'default' : r.status === 'failed' ? 'destructive' : 'outline'}>
                    {r.status}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{r.entry_count} entries</div>
                  {r.image_public_url && (
                    <a href={r.image_public_url} target="_blank" rel="noreferrer" className="text-xs underline">public.png</a>
                  )}
                  {r.image_private_url && (
                    <a href={r.image_private_url} target="_blank" rel="noreferrer" className="text-xs underline">private.png</a>
                  )}
                  <a href={previewUrl(r.id, 'public')} target="_blank" rel="noreferrer" className="text-xs underline">preview</a>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => rerender(r.id)} disabled={busy === `render_${r.id}`}>
                      {busy === `render_${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => repost(r.id)} disabled={busy === `post_${r.id}`}>
                      {busy === `post_${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                  </div>
                  {r.error && <div className="text-xs text-destructive ml-2 truncate max-w-[200px]" title={r.error}>{r.error}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}