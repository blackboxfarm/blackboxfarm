import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, RefreshCw, Sprout } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VigilStats {
  total: number;
  watching: number;
  declining: number;
  dead: number;
  thriving: number;
  lastScan: string | null;
}

export function VigilStatusPanel() {
  const [stats, setStats] = useState<VigilStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [totalRes, watchingRes, decliningRes, deadRes, thrivingRes, lastRes] = await Promise.all([
        supabase.from('token_vigil').select('*', { count: 'exact', head: true }),
        supabase.from('token_vigil').select('*', { count: 'exact', head: true }).eq('status', 'watching'),
        supabase.from('token_vigil').select('*', { count: 'exact', head: true }).eq('status', 'declining'),
        supabase.from('token_vigil').select('*', { count: 'exact', head: true }).eq('status', 'dead'),
        supabase.from('token_vigil').select('*', { count: 'exact', head: true }).eq('status', 'thriving'),
        supabase.from('token_vigil').select('last_scanned_at').order('last_scanned_at', { ascending: false }).limit(1),
      ]);

      setStats({
        total: totalRes.count || 0,
        watching: watchingRes.count || 0,
        declining: decliningRes.count || 0,
        dead: deadRes.count || 0,
        thriving: thrivingRes.count || 0,
        lastScan: lastRes.data?.[0]?.last_scanned_at || null,
      });
    } catch (e) {
      console.error('Failed to fetch vigil stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const seedVigil = useCallback(async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('token-vigil', {
        body: { seed: true },
      });
      if (error) throw error;
      toast.success(`Vigil seeded: ${data.seeded} new tokens, ${data.scanned} scanned, ${data.deaths} deaths detected`);
      fetchStats();
    } catch (e: any) {
      toast.error(`Seed failed: ${e.message}`);
    } finally {
      setSeeding(false);
    }
  }, [fetchStats]);

  const lastScanAge = stats?.lastScan
    ? `${Math.round((Date.now() - new Date(stats.lastScan).getTime()) / 60000)}m ago`
    : 'never';

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Token Vigil Status
        </CardTitle>
        <CardDescription className="text-xs">
          Death detection + post-mortem assessments for AI training
        </CardDescription>
        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30 w-fit mt-1">
          ⚡ Automated — runs every ~5 min via orchestrator
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">📊 {stats.total} tracked</Badge>
            <Badge variant="outline" className="bg-green-500/10">👁 {stats.watching} watching</Badge>
            <Badge variant="outline" className="bg-yellow-500/10">📉 {stats.declining} declining</Badge>
            <Badge variant="outline" className="bg-red-500/10">💀 {stats.dead} dead</Badge>
            <Badge variant="outline" className="bg-emerald-500/10">🌱 {stats.thriving} thriving</Badge>
            <Badge variant="outline">⏱ Last scan: {lastScanAge}</Badge>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={seedVigil} disabled={seeding}>
            <Sprout className="w-3 h-3 mr-1" /> {seeding ? 'Seeding...' : 'Seed Vigil (bulk)'}
          </Button>
          <Button size="sm" variant="outline" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
