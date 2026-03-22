import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Check, ExternalLink } from 'lucide-react';

interface MintEvent {
  id: string;
  family_id: string;
  mint_address: string;
  detected_by_wallet: string;
  event_type: string;
  confidence: number;
  tx_signature: string | null;
  token_name: string | null;
  token_symbol: string | null;
  launchpad: string | null;
  is_acknowledged: boolean;
  created_at: string;
  family_name?: string;
}

export function FamilyMintFeed() {
  const [events, setEvents] = useState<MintEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [showAcknowledged]);

  async function loadEvents() {
    setLoading(true);
    try {
      let query = supabase
        .from('wallet_family_mint_events')
        .select('*, wallet_families!inner(family_name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!showAcknowledged) {
        query = query.eq('is_acknowledged', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEvents((data || []).map((d: any) => ({
        ...d,
        family_name: d.wallet_families?.family_name,
      })));
    } catch (err) {
      console.error('Failed to load mint events:', err);
    } finally {
      setLoading(false);
    }
  }

  async function acknowledge(id: string) {
    await supabase.from('wallet_family_mint_events').update({
      is_acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', id);
    setEvents(prev => prev.map(e => e.id === id ? { ...e, is_acknowledged: true } : e));
  }

  function shortAddr(w: string) {
    return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : '—';
  }

  const eventTypeColors: Record<string, string> = {
    DIRECT_DEV_MINT: 'bg-red-500/20 text-red-400 border-red-500/30',
    PROBABLE_DEV_ASSOCIATED_MINT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    FAMILY_EARLY_ENTRY: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    SIBLING_WALLET_MINT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    UNKNOWN: 'bg-muted text-muted-foreground',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          Family Mint Feed ({events.filter(e => !e.is_acknowledged).length} unread)
        </h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={e => setShowAcknowledged(e.target.checked)}
            className="rounded"
          />
          Show acknowledged
        </label>
      </div>

      {!events.length ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No mint events detected yet</p>
          <p className="text-xs mt-1">The mint monitor polls family wallets every 5-15 minutes</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead compact>Time</TableHead>
              <TableHead compact>Family</TableHead>
              <TableHead compact>Token</TableHead>
              <TableHead compact>Mint Address</TableHead>
              <TableHead compact>Detected By</TableHead>
              <TableHead compact>Type</TableHead>
              <TableHead compact>Confidence</TableHead>
              <TableHead compact>Links</TableHead>
              <TableHead compact>Ack</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map(ev => (
              <TableRow key={ev.id} className={!ev.is_acknowledged ? 'bg-red-500/5' : ''}>
                <TableCell compact className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(ev.created_at).toLocaleString()}
                </TableCell>
                <TableCell compact className="font-medium text-xs">
                  {ev.family_name || '—'}
                </TableCell>
                <TableCell compact>
                  {ev.token_symbol ? (
                    <span className="font-bold">${ev.token_symbol}</span>
                  ) : ev.token_name || '—'}
                </TableCell>
                <TableCell compact className="font-mono text-xs">
                  {shortAddr(ev.mint_address)}
                </TableCell>
                <TableCell compact className="font-mono text-xs">
                  {shortAddr(ev.detected_by_wallet)}
                </TableCell>
                <TableCell compact>
                  <Badge className={eventTypeColors[ev.event_type] || eventTypeColors.UNKNOWN}>
                    {ev.event_type.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell compact>
                  <span className={Number(ev.confidence) >= 80 ? 'text-green-400' : Number(ev.confidence) >= 50 ? 'text-yellow-400' : 'text-muted-foreground'}>
                    {Number(ev.confidence).toFixed(0)}%
                  </span>
                </TableCell>
                <TableCell compact>
                  <div className="flex gap-1">
                    {ev.launchpad === 'pump.fun' && (
                      <a href={`https://pump.fun/coin/${ev.mint_address}`} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs flex items-center gap-0.5">
                        PF <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <a href={`https://dexscreener.com/solana/${ev.mint_address}`} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs flex items-center gap-0.5">
                      DEX <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </TableCell>
                <TableCell compact>
                  {ev.is_acknowledged ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <button
                      onClick={() => acknowledge(ev.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      Ack
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
