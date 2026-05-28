import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type RenderRow = {
  id: string;
  template_id: string | null;
  profile_kind: string;
  language: string | null;
  token_mint: string;
  ticker: string;
  multiplier: number;
  entry_mcap: number | null;
  current_mcap: number | null;
  asset_ids: string[] | null;
  prompt: string | null;
  output_url: string;
  ai_used: boolean;
  fallback_reason: string | null;
  created_at: string;
};

export function NoLubeArchivePanel() {
  const [rows, setRows] = useState<RenderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'public' | 'private'>('all');

  const load = async () => {
    setLoading(true);
    try {
      let q = (supabase as any).from('no_lube_card_renders').select('*').order('created_at', { ascending: false }).limit(200);
      if (kind !== 'all') q = q.eq('profile_kind', kind);
      if (filter.trim()) q = q.or(`ticker.ilike.%${filter.trim()}%,token_mint.ilike.%${filter.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data || []) as RenderRow[]);
    } catch (e: any) {
      toast.error(`Load failed: ${e.message}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [kind]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Search ticker / mint</Label>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          </div>
          <div>
            <Label className="text-xs">Kind</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="h-9 rounded-md bg-background border border-input px-2 text-sm">
              <option value="all">all</option>
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No renders yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(r => (
            <Card key={r.id}>
              <CardContent className="pt-4 space-y-2">
                <a href={r.output_url} target="_blank" rel="noreferrer" className="block rounded-md overflow-hidden border">
                  <img src={r.output_url} alt={r.ticker} className="w-full object-cover" />
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.profile_kind === 'private' ? 'default' : 'secondary'}>{r.profile_kind}</Badge>
                  {r.language && <Badge variant="outline">{r.language}</Badge>}
                  <Badge variant="outline">${r.ticker}</Badge>
                  <Badge>{Number(r.multiplier).toFixed(2)}X</Badge>
                  {r.ai_used ? <Badge variant="outline">AI</Badge> : <Badge variant="destructive">fallback</Badge>}
                </div>
                <div className="text-xs font-mono text-muted-foreground break-all">{r.token_mint}</div>
                <div className="text-xs text-muted-foreground">
                  Entry: ${r.entry_mcap ? Math.round(r.entry_mcap).toLocaleString() : '?'} → Now: ${r.current_mcap ? Math.round(r.current_mcap).toLocaleString() : '?'}
                </div>
                {r.fallback_reason && <div className="text-xs text-destructive">{r.fallback_reason}</div>}
                {r.prompt && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Prompt</summary>
                    <pre className="whitespace-pre-wrap mt-1 bg-muted p-2 rounded text-[10px]">{r.prompt}</pre>
                  </details>
                )}
                <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}