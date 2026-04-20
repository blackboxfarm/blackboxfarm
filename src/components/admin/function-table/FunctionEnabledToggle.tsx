import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ToggleRow {
  function_name: string;
  enabled: boolean;
  disabled_reason: string | null;
  disabled_at: string | null;
  last_skipped_at: string | null;
  skip_count_24h: number;
}

/** Hook used by the parent table to fetch all toggles in one query. */
export function useFunctionToggles() {
  return useQuery({
    queryKey: ['function-toggles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('function_toggles')
        .select('function_name, enabled, disabled_reason, disabled_at, last_skipped_at, skip_count_24h');
      if (error) throw error;
      const map: Record<string, ToggleRow> = {};
      (data || []).forEach((r: any) => { map[r.function_name] = r as ToggleRow; });
      return map;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

interface Props {
  functionName: string;
  toggle?: ToggleRow;
}

export function FunctionEnabledToggle({ functionName, toggle }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const enabled = toggle?.enabled !== false; // default ON

  const mutation = useMutation({
    mutationFn: async ({ nextEnabled, why }: { nextEnabled: boolean; why?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        function_name: functionName,
        enabled: nextEnabled,
        disabled_reason: nextEnabled ? null : (why || null),
        disabled_at: nextEnabled ? null : new Date().toISOString(),
        disabled_by: nextEnabled ? null : (user?.id ?? null),
      };
      const { error } = await supabase
        .from('function_toggles')
        .upsert(payload, { onConflict: 'function_name' });
      if (error) throw error;

      // Audit notification
      await supabase.from('admin_notifications').insert({
        notification_type: 'function_toggle',
        title: `Function ${nextEnabled ? 'enabled' : 'disabled'}: ${functionName}`,
        message: nextEnabled
          ? `${functionName} re-enabled`
          : `${functionName} disabled${why ? `: ${why}` : ''}`,
        metadata: { function_name: functionName, enabled: nextEnabled, reason: why ?? null, by: user?.id ?? null },
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['function-toggles'] });
      toast.success(vars.nextEnabled ? `${functionName} enabled` : `${functionName} disabled`);
      setOpen(false);
      setReason('');
    },
    onError: (err: any) => {
      toast.error(`Toggle failed: ${err.message}`);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (enabled) {
      // Turning OFF — open popover for optional reason
      setOpen(true);
    } else {
      // Turning ON — instant
      mutation.mutate({ nextEnabled: true });
    }
  };

  const tooltipContent = (
    <div className="text-xs space-y-1">
      {enabled ? (
        <div className="text-green-400">Enabled — function runs on schedule</div>
      ) : (
        <>
          <div className="text-red-400 font-semibold">DISABLED</div>
          {toggle?.disabled_reason && <div>Reason: {toggle.disabled_reason}</div>}
          {toggle?.disabled_at && (
            <div className="text-muted-foreground">
              Since: {format(new Date(toggle.disabled_at), 'PPp')}
            </div>
          )}
          <div className="text-muted-foreground">
            Skipped (24h): {toggle?.skip_count_24h ?? 0}
          </div>
          {toggle?.last_skipped_at && (
            <div className="text-muted-foreground">
              Last skip: {format(new Date(toggle.last_skipped_at), 'PPp')}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      checked={enabled}
                      onClick={handleClick}
                      disabled={mutation.isPending}
                      className={cn(!enabled && "data-[state=unchecked]:bg-red-900/40")}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">{tooltipContent}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Disable {functionName}?</div>
            <div className="text-xs text-muted-foreground">
              Cron will keep firing but the function will exit immediately. Optional reason for the audit log:
            </div>
            <Textarea
              placeholder="e.g. eating too much Helius credit"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-xs"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setReason(''); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => mutation.mutate({ nextEnabled: false, why: reason.trim() || undefined })}
                disabled={mutation.isPending}
              >
                Disable
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {!enabled && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-400 border-red-500/40">
          OFF
        </Badge>
      )}
    </div>
  );
}