import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, AlertTriangle, Activity } from 'lucide-react';

interface WalletFamily {
  id: string;
  seed_wallet: string;
  family_name: string | null;
  total_wallets: number;
  risk_score: number;
  total_mints_detected: number;
  last_rescored_at: string | null;
  created_at: string;
  tier_counts?: { A: number; B: number; C: number };
  active_members?: number;
  mint_count?: number;
}

interface FamilyDashboardProps {
  onSelectFamily: (familyId: string) => void;
}

export function FamilyDashboard({ onSelectFamily }: FamilyDashboardProps) {
  const [families, setFamilies] = useState<WalletFamily[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFamilies();
  }, []);

  async function loadFamilies() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('family-graph-api', {
        body: { action: 'list' },
      });
      if (error) throw error;
      setFamilies(data?.families || []);
    } catch (err) {
      console.error('Failed to load families:', err);
    } finally {
      setLoading(false);
    }
  }

  function shortWallet(w: string) {
    return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : '—';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading families...</span>
      </div>
    );
  }

  if (!families.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No wallet families discovered yet</p>
        <p className="text-sm mt-1">The discovery engine will seed from your Allstar Registry automatically</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Discovered Wallet Families ({families.length})</h3>
        <button onClick={loadFamilies} className="text-sm text-primary hover:underline">Refresh</button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead compact>Family</TableHead>
            <TableHead compact>Seed Wallet</TableHead>
            <TableHead compact>Wallets</TableHead>
            <TableHead compact>Tiers (A/B/C)</TableHead>
            <TableHead compact>Mints</TableHead>
            <TableHead compact>Risk</TableHead>
            <TableHead compact>Last Scored</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {families.map(f => (
            <TableRow
              key={f.id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => onSelectFamily(f.id)}
            >
              <TableCell compact className="font-medium">
                {f.family_name || 'Unnamed'}
              </TableCell>
              <TableCell compact className="font-mono text-xs">
                {shortWallet(f.seed_wallet)}
              </TableCell>
              <TableCell compact>
                <Badge variant="secondary">{f.total_wallets || f.active_members || 0}</Badge>
              </TableCell>
              <TableCell compact>
                <div className="flex gap-1">
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{f.tier_counts?.A || 0}</Badge>
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{f.tier_counts?.B || 0}</Badge>
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">{f.tier_counts?.C || 0}</Badge>
                </div>
              </TableCell>
              <TableCell compact>
                {(f.total_mints_detected || f.mint_count || 0) > 0 ? (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {f.total_mints_detected || f.mint_count}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell compact>
                <span className={Number(f.risk_score) > 50 ? 'text-red-400' : 'text-muted-foreground'}>
                  {Number(f.risk_score).toFixed(0)}
                </span>
              </TableCell>
              <TableCell compact className="text-muted-foreground text-xs">
                {f.last_rescored_at ? new Date(f.last_rescored_at).toLocaleDateString() : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
