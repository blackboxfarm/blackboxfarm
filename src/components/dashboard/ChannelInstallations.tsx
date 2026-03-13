import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Hash, Wallet, CheckCircle, XCircle, Loader2, Settings, RefreshCw, Copy, AlertTriangle } from "lucide-react";

interface ChannelInstallation {
  id: string;
  chat_id: number;
  chat_title: string | null;
  chat_type: string;
  is_active: boolean;
  is_paid: boolean;
  kicked: boolean;
  admin_config: {
    delay_ms: number;
    verbose: boolean;
    admin_only_commands: boolean;
    enabled_tiers: string[];
    dev_wallet_alerts: boolean;
  };
  installed_at: string;
  paid_at: string | null;
}

interface ChannelWallet {
  id: string;
  installation_id: string;
  pubkey: string;
  required_sol: number;
  current_balance: number;
  is_paid: boolean;
  verified_at: string | null;
}

export function ChannelInstallations() {
  const { user } = useAuth();
  const [installations, setInstallations] = useState<ChannelInstallation[]>([]);
  const [wallets, setWallets] = useState<Record<string, ChannelWallet>>({});
  const [loading, setLoading] = useState(true);
  const [generatingWallet, setGeneratingWallet] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: installs } = await supabase
        .from("channel_installations")
        .select("*")
        .eq("user_id", user.id)
        .order("installed_at", { ascending: false });

      if (installs) {
        setInstallations(installs as unknown as ChannelInstallation[]);
        
        const ids = installs.map((i: any) => i.id);
        if (ids.length > 0) {
          const { data: walletsData } = await supabase
            .from("channel_payment_wallets")
            .select("*")
            .in("installation_id", ids);
          
          if (walletsData) {
            const walletMap: Record<string, ChannelWallet> = {};
            (walletsData as unknown as ChannelWallet[]).forEach(w => {
              walletMap[w.installation_id] = w;
            });
            setWallets(walletMap);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching channel installations:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generateWallet = async (installationId: string) => {
    setGeneratingWallet(installationId);
    try {
      const { data, error } = await supabase.functions.invoke("channel-wallet-generator", {
        body: { installation_id: installationId },
      });
      if (error) throw error;
      toast.success(`Payment wallet generated: ${data.wallet.pubkey.slice(0, 12)}...`);
      await fetchData();
    } catch (err: any) {
      toast.error(`Failed to generate wallet: ${err.message}`);
    } finally {
      setGeneratingWallet(null);
    }
  };

  const verifyPayment = async (installationId: string) => {
    setVerifying(installationId);
    try {
      const { data, error } = await supabase.functions.invoke("verify-channel-payment", {
        body: { installation_id: installationId },
      });
      if (error) throw error;
      if (data.is_paid) {
        toast.success("✅ Payment verified! Bot is now active in this channel.");
      } else {
        toast.info(`Balance: ${data.balance} SOL — need ${data.required} SOL to activate.`);
      }
      await fetchData();
    } catch (err: any) {
      toast.error(`Verification failed: ${err.message}`);
    } finally {
      setVerifying(null);
    }
  };

  const updateConfig = async (installationId: string, config: any) => {
    try {
      const { error } = await supabase
        .from("channel_installations")
        .update({ admin_config: config, updated_at: new Date().toISOString() })
        .eq("id", installationId);
      if (error) throw error;
      toast.success("Config updated");
      await fetchData();
    } catch (err: any) {
      toast.error(`Config update failed: ${err.message}`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (installations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Hash className="h-5 w-5 text-primary" />
            Channel Installations
          </CardTitle>
          <CardDescription>
            Add @holdersintel_bot to your Telegram group or channel. It will automatically appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 space-y-3 text-muted-foreground">
            <p className="text-sm">No channel installations yet.</p>
            <p className="text-xs">
              Add the bot to a group/channel in Telegram — it will register here automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hash className="h-5 w-5 text-primary" />
              Channel Installations ({installations.length})
            </CardTitle>
            <CardDescription>Manage your bot installations. 0.25 SOL one-time per channel.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {installations.map(install => {
          const wallet = wallets[install.id];
          const config = install.admin_config;
          const isExpanded = expandedConfig === install.id;

          return (
            <div key={install.id} className="rounded-lg border bg-card p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="font-medium text-sm">{install.chat_title || `Chat ${install.chat_id}`}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-mono">ID: {install.chat_id}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{install.chat_type}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {install.kicked && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Removed
                    </Badge>
                  )}
                  {install.is_paid ? (
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px]">
                      <CheckCircle className="h-3 w-3 mr-1" /> Paid
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                      <XCircle className="h-3 w-3 mr-1" /> Unpaid
                    </Badge>
                  )}
                  {install.is_active && (
                    <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">Active</Badge>
                  )}
                </div>
              </div>

              {/* Payment Wallet Section */}
              {!install.is_paid && (
                <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
                  {wallet ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs text-muted-foreground">Send 0.25 SOL to:</span>
                        </div>
                        <Button
                          variant="outline" size="sm"
                          className="h-6 text-[10px] px-2 gap-1"
                          onClick={() => verifyPayment(install.id)}
                          disabled={verifying === install.id}
                        >
                          {verifying === install.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          Verify Payment
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] font-mono text-primary bg-background/50 px-2 py-1 rounded flex-1 select-all break-all">
                          {wallet.pubkey}
                        </code>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(wallet.pubkey)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Balance: {wallet.current_balance} SOL</span>
                        <span>Required: {wallet.required_sol} SOL</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Generate a payment wallet to activate this channel</span>
                      <Button
                        size="sm" className="h-7 text-xs gap-1"
                        onClick={() => generateWallet(install.id)}
                        disabled={generatingWallet === install.id}
                      >
                        {generatingWallet === install.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wallet className="h-3 w-3" />
                        )}
                        Generate Wallet
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Config Toggle */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost" size="sm"
                  className="text-xs h-7 gap-1 text-muted-foreground"
                  onClick={() => setExpandedConfig(isExpanded ? null : install.id)}
                >
                  <Settings className="h-3 w-3" />
                  {isExpanded ? "Hide Config" : "Channel Config"}
                </Button>
              </div>

              {/* Expanded Config */}
              {isExpanded && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Response Delay (ms)</Label>
                      <Input
                        type="number" min={0} step={100}
                        className="h-7 text-xs"
                        defaultValue={config.delay_ms}
                        onBlur={(e) => updateConfig(install.id, { ...config, delay_ms: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1.5 flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-[11px]">Verbose Replies</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={config.verbose}
                            onCheckedChange={(v) => updateConfig(install.id, { ...config, verbose: v })}
                          />
                          <span className="text-[10px] text-muted-foreground">{config.verbose ? "Long-form" : "Short-form"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Admin-Only Commands</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.admin_only_commands}
                          onCheckedChange={(v) => updateConfig(install.id, { ...config, admin_only_commands: v })}
                        />
                        <span className="text-[10px] text-muted-foreground">{config.admin_only_commands ? "Admins only" : "All members"}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">🚨 Dev Wallet Alerts</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.dev_wallet_alerts}
                          onCheckedChange={(v) => updateConfig(install.id, { ...config, dev_wallet_alerts: v })}
                        />
                        <span className="text-[10px] text-muted-foreground">{config.dev_wallet_alerts ? "On" : "Off"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
