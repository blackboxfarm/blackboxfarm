import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageSquareOff, MessageSquare } from 'lucide-react';

export function TelegramBroadcastToggle() {
  const [isSuspended, setIsSuspended] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'telegram_broadcast_suspended')
        .maybeSingle();

      if (error) throw error;
      setIsSuspended(data?.value === true);
    } catch (err) {
      console.error('Failed to fetch TG broadcast status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSuspension = async (suspended: boolean) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: suspended, updated_by: 'super_admin' })
        .eq('key', 'telegram_broadcast_suspended');

      if (error) throw error;
      
      setIsSuspended(suspended);
      toast.success(suspended 
        ? '🔇 Telegram broadcasts suspended' 
        : '🔔 Telegram broadcasts resumed'
      );
    } catch (err) {
      console.error('Failed to toggle TG broadcast:', err);
      toast.error('Failed to update setting');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={`border-2 transition-colors ${isSuspended ? 'border-destructive/50 bg-destructive/5' : 'border-primary/20'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          {isSuspended ? (
            <MessageSquareOff className="h-5 w-5 text-destructive" />
          ) : (
            <MessageSquare className="h-5 w-5 text-primary" />
          )}
          <div>
            <CardTitle className="text-base">Telegram Group Broadcasts</CardTitle>
            <CardDescription className="text-xs">
              XBot posts & Search Generator → BLACKBOX
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Label htmlFor="tg-suspend" className="text-sm">
            {isSuspended ? (
              <span className="text-destructive font-medium">⏸️ Suspended</span>
            ) : (
              <span className="text-primary">✅ Active</span>
            )}
          </Label>
          <Switch
            id="tg-suspend"
            checked={!isSuspended}
            onCheckedChange={(checked) => toggleSuspension(!checked)}
            disabled={isLoading}
          />
        </div>
      </CardContent>
    </Card>
  );
}
