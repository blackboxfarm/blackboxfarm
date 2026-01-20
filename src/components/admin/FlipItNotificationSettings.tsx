import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, BellOff, MessageCircle, RefreshCw, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NotificationTarget {
  id: string;
  label: string;
  target_type: string;
  chat_username?: string | null;
  chat_id?: string | null;
  resolved_name?: string | null;
}

interface NotificationSettings {
  id: string;
  is_enabled: boolean;
  notify_on_buy: boolean;
  notify_on_sell: boolean;
  selectedTargetIds: string[];
}

export function FlipItNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [targets, setTargets] = useState<NotificationTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("No user logged in");
        setLoading(false);
        return;
      }

      // Load all Telegram targets
      const { data: targetsData } = await supabase
        .from('telegram_message_targets')
        .select('*')
        .eq('user_id', user.id)
        .order('label');
      
      setTargets(targetsData || []);

      // Load notification settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('flipit_notification_settings')
        .select(`
          id,
          is_enabled,
          notify_on_buy,
          notify_on_sell,
          flipit_notification_targets (
            target_id
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (settingsData) {
        const targetIds = (settingsData.flipit_notification_targets as { target_id: string }[])?.map(t => t.target_id) || [];
        setSettings({
          id: settingsData.id,
          is_enabled: settingsData.is_enabled,
          notify_on_buy: settingsData.notify_on_buy,
          notify_on_sell: settingsData.notify_on_sell,
          selectedTargetIds: targetIds,
        });
      } else {
        // Create default settings
        const { data: newSettings, error: createError } = await supabase
          .from('flipit_notification_settings')
          .insert({
            user_id: user.id,
            is_enabled: false,
            notify_on_buy: true,
            notify_on_sell: true,
          })
          .select()
          .single();

        if (newSettings) {
          setSettings({
            id: newSettings.id,
            is_enabled: newSettings.is_enabled,
            notify_on_buy: newSettings.notify_on_buy,
            notify_on_sell: newSettings.notify_on_sell,
            selectedTargetIds: [],
          });
        }
      }
    } catch (error) {
      console.error("Failed to load notification settings:", error);
      toast({
        title: "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveSettings = async (updates: Partial<NotificationSettings>) => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      // Update main settings
      const { error: updateError } = await supabase
        .from('flipit_notification_settings')
        .update({
          is_enabled: newSettings.is_enabled,
          notify_on_buy: newSettings.notify_on_buy,
          notify_on_sell: newSettings.notify_on_sell,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (updateError) throw updateError;

      // Update targets if changed
      if (updates.selectedTargetIds !== undefined) {
        // Delete existing targets first and wait for it to complete
        const { error: deleteError } = await supabase
          .from('flipit_notification_targets')
          .delete()
          .eq('settings_id', settings.id);

        if (deleteError) {
          console.error("Delete error:", deleteError);
          throw deleteError;
        }

        // Insert new targets only after delete is confirmed
        if (newSettings.selectedTargetIds.length > 0) {
          const { error: insertError } = await supabase
            .from('flipit_notification_targets')
            .insert(
              newSettings.selectedTargetIds.map(targetId => ({
                settings_id: settings.id,
                target_id: targetId,
              }))
            );

          if (insertError) {
            console.error("Insert error:", insertError);
            throw insertError;
          }
        }
      }

      toast({
        title: "Settings saved",
        description: newSettings.is_enabled ? "Telegram notifications are enabled" : "Notifications disabled",
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast({
        title: "Failed to save settings",
        variant: "destructive",
      });
      // Revert on error
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const toggleTarget = (targetId: string) => {
    if (!settings) return;
    
    const currentIds = settings.selectedTargetIds;
    const newIds = currentIds.includes(targetId)
      ? currentIds.filter(id => id !== targetId)
      : [...currentIds, targetId];
    
    saveSettings({ selectedTargetIds: newIds });
  };

  const sendTestNotification = async () => {
    if (!settings || settings.selectedTargetIds.length === 0) return;
    
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-notify', {
        body: {
          type: 'buy',
          tokenSymbol: 'TEST',
          tokenName: 'Test Notification Token',
          tokenMint: 'TestMint123456789TestMint123456789TestMint',
          amountSol: 0.05,
          amountUsd: 10.00,
          tokenAmount: 1000000,
          pricePerToken: 0.00001,
          multiplier2x: 0.00002,
          multiplier3x: 0.00003,
          walletAddress: 'TestWallet123...789',
          isTest: true,
        },
      });

      if (error) throw error;

      toast({
        title: "Test notification sent!",
        description: `Check your Telegram group${settings.selectedTargetIds.length > 1 ? 's' : ''} for the message.`,
      });
    } catch (error) {
      console.error("Failed to send test notification:", error);
      toast({
        title: "Failed to send test",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-6 text-center text-muted-foreground">
          Please log in to configure notifications
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Telegram Notifications
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div className="flex items-center gap-3">
            {settings.is_enabled ? (
              <Bell className="h-5 w-5 text-green-400" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <Label className="font-medium">Enable Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Send trade alerts to Telegram
              </p>
            </div>
          </div>
          <Switch
            checked={settings.is_enabled}
            onCheckedChange={(checked) => saveSettings({ is_enabled: checked })}
            disabled={saving}
          />
        </div>

        {settings.is_enabled && (
          <>
            {/* Event Type Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                <Label className="text-sm">Buy Alerts</Label>
                <Switch
                  checked={settings.notify_on_buy}
                  onCheckedChange={(checked) => saveSettings({ notify_on_buy: checked })}
                  disabled={saving}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                <Label className="text-sm">Sell Alerts</Label>
                <Switch
                  checked={settings.notify_on_sell}
                  onCheckedChange={(checked) => saveSettings({ notify_on_sell: checked })}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Target Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Send to Groups</Label>
              {targets.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 bg-background/50 rounded-lg">
                  No Telegram groups configured. Add groups in the Telegram Monitor tab.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {targets.map((target) => (
                    <div
                      key={target.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/50 cursor-pointer hover:bg-background/70 transition-colors"
                      onClick={() => toggleTarget(target.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={settings.selectedTargetIds.includes(target.id)}
                          onCheckedChange={() => toggleTarget(target.id)}
                          disabled={saving}
                        />
                        <div>
                          <span className="text-sm font-medium">
                            {target.resolved_name || target.label}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={`ml-2 text-xs ${
                              target.target_type === 'private' 
                                ? 'border-purple-500/50 text-purple-400' 
                                : 'border-blue-500/50 text-blue-400'
                            }`}
                          >
                            {target.target_type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Summary & Test Button */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div className="text-xs text-muted-foreground">
                {settings.selectedTargetIds.length === 0 ? (
                  <span className="text-yellow-400">⚠️ No groups selected</span>
                ) : (
                  <span className="text-green-400">
                    ✓ {settings.selectedTargetIds.length} group{settings.selectedTargetIds.length > 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              {settings.selectedTargetIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTestNotification}
                  disabled={sendingTest}
                  className="h-7 text-xs"
                >
                  {sendingTest ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3 mr-1" />
                  )}
                  Send Test
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
