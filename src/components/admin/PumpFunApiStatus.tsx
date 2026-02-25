import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Rocket, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type ApiStatus = 'checking' | 'online' | 'offline' | 'degraded';

export function PumpFunApiStatus() {
  const [status, setStatus] = useState<ApiStatus>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [auditStats, setAuditStats] = useState<{ matches: number; mismatches: number; unreachable: number } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      // Check latest audit results to determine API status
      const { data } = await supabase
        .from('creator_audit_results')
        .select('matches, mismatches, unreachable, errors, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      if (data && data.length > 0) {
        const recent = data[0];
        const totalReachable = recent.matches + recent.mismatches;
        const total = totalReachable + recent.unreachable;

        if (total === 0) {
          setStatus('checking');
        } else if (recent.unreachable === total) {
          setStatus('offline');
        } else if (recent.unreachable > totalReachable) {
          setStatus('degraded');
        } else {
          setStatus('online');
        }

        setAuditStats({
          matches: data.reduce((sum, r) => sum + r.matches, 0),
          mismatches: data.reduce((sum, r) => sum + r.mismatches, 0),
          unreachable: recent.unreachable,
        });
        setLastChecked(new Date(recent.created_at));
      } else {
        setStatus('checking');
      }
    } catch {
      setStatus('checking');
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60_000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const statusConfig = {
    checking: { label: 'Checking...', color: 'bg-muted text-muted-foreground', icon: RefreshCw },
    online: { label: 'Online', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: Wifi },
    degraded: { label: 'Degraded', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Wifi },
    offline: { label: 'Offline', color: 'bg-destructive/20 text-destructive border-destructive/30', icon: WifiOff },
  };

  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  return (
    <Card className={`border-2 transition-colors ${
      status === 'offline' ? 'border-destructive/50 bg-destructive/5' :
      status === 'online' ? 'border-emerald-500/30 bg-emerald-500/5' :
      status === 'degraded' ? 'border-amber-500/30 bg-amber-500/5' :
      'border-muted'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Rocket className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <CardTitle className="text-base">Pump.fun API</CardTitle>
            <CardDescription className="text-xs">
              Creator audit pipeline
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={checkStatus}
            disabled={isChecking}
          >
            <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cfg.color}>
            <StatusIcon className={`h-3 w-3 mr-1 ${status === 'checking' ? 'animate-spin' : ''}`} />
            {cfg.label}
          </Badge>
          {lastChecked && (
            <span className="text-[10px] text-muted-foreground">
              {lastChecked.toLocaleTimeString()}
            </span>
          )}
        </div>
        {auditStats && status !== 'checking' && (
          <div className="flex gap-2 text-[10px] text-muted-foreground">
            {auditStats.matches > 0 && <span className="text-emerald-400">✓{auditStats.matches}</span>}
            {auditStats.mismatches > 0 && <span className="text-destructive">✗{auditStats.mismatches}</span>}
            {auditStats.unreachable > 0 && <span>⊘{auditStats.unreachable}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
