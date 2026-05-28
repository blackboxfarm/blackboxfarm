import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import processMd from '../../../docs/no-lube-process.md?raw';

/**
 * No Lube — Private channel "Process" tab.
 * - Top: button to open the processing protocol (.md) in a popup.
 * - Below: live list of tokens scraped from the Insiders channel.
 *   Clicking a row opens a popup showing every lifecycle column as var = value,
 *   1 per line — mapped 1:1 to the .md spec.
 */

const FIELDS: string[] = [
  'token_symbol', 'token_mint', 'channel_name', 'launchpad',
  'entry_mc_text', 'entry_market_cap', 'peak_market_cap', 'peak_multiplier',
  'peak_reached_at', 'milestone_count', 'last_milestone_at', 'total_messages',
  'first_called_at',
  'ingest_status', 'ingest_started_at', 'ingest_completed_at', 'ingest_last_error',
  'creator_status', 'creator_wallet', 'creator_attempts',
  'creator_last_attempt_at', 'creator_resolved_at', 'creator_risk_tier',
  'dev_wallet_resolved_at', 'dev_history_warning',
  'kyc_status', 'kyc_label', 'kyc_attempts', 'kyc_last_attempt_at',
  'genealogy_depth', 'genealogy_kyc_root',
  'mesh_hydrated_at', 'mesh_promoted_at', 'mesh_promotion_status', 'mesh_promotion_reason',
  'holders_refreshed_at', 'blackbox_harvested_at',
  'enrichment_status', 'enrichment_last_run_at',
  'socials_changed', 'socials_last_checked_at',
  'is_rugged', 'lifespan_minutes', 'created_at', 'updated_at',
];

type Row = Record<string, unknown> & {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  first_called_at: string;
  ingest_status: string | null;
  creator_status: string | null;
  kyc_status: string | null;
};

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '∅ null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const short = (s: string, n = 6) => (s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export function NoLubeProcessPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select(FIELDS.concat(['id']).join(','))
      .order('first_called_at', { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Insiders → No Lube pipeline</div>
            <p className="text-xs text-muted-foreground">
              Every field the system fetches, resolves, calculates and writes per token. Click a token row to see its live values.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDoc(true)}>
              <FileText className="h-3 w-3 mr-1" /> View protocol
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground mb-2">
            Last {rows.length} tokens scraped from the Insiders channel (newest first)
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Ticker / Mint</TableHead>
                <TableHead compact>Ingest</TableHead>
                <TableHead compact>Creator</TableHead>
                <TableHead compact>KYC</TableHead>
                <TableHead compact>First called</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <TableCell compact>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-pink-300">${r.token_symbol || '?'}</span>
                      <code className="text-[10px] text-muted-foreground font-mono">{short(r.token_mint)}</code>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell compact><Badge variant="outline" className="text-[10px]">{r.ingest_status || '—'}</Badge></TableCell>
                  <TableCell compact><Badge variant="outline" className="text-[10px]">{r.creator_status || '—'}</Badge></TableCell>
                  <TableCell compact><Badge variant="outline" className="text-[10px]">{r.kyc_status || '—'}</Badge></TableCell>
                  <TableCell compact className="text-[10px] text-muted-foreground">
                    {new Date(r.first_called_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell compact colSpan={5} className="text-center text-muted-foreground">No tokens yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Protocol .md popup */}
      <Dialog open={showDoc} onOpenChange={setShowDoc}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>No Lube — Processing Protocol</DialogTitle>
          </DialogHeader>
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{processMd}</pre>
        </DialogContent>
      </Dialog>

      {/* Per-token var=value popup */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.token_symbol ? `$${selected.token_symbol}` : 'Token'} —{' '}
              <code className="text-xs">{selected?.token_mint}</code>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="font-mono text-xs space-y-0.5">
              {FIELDS.map(f => (
                <div key={f} className="grid grid-cols-[220px_1fr] gap-2 border-b border-border/30 py-0.5">
                  <span className="text-pink-300">{f}</span>
                  <span className="text-foreground break-all">= {fmt((selected as Record<string, unknown>)[f])}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
