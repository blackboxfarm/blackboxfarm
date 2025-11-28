import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Copy, Trash2, ChevronDown, ChevronRight, Lock, Unlock, Play, History, Edit, Archive, RotateCcw, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface AirdropWallet {
  id: string;
  nickname: string | null;
  pubkey: string;
  sol_balance: number;
  created_at: string;
  is_active: boolean;
  is_archived: boolean;
}

interface AirdropConfig {
  id: string;
  wallet_id: string;
  name: string;
  token_mint: string;
  amount_per_wallet: number;
  memo: string | null;
  recipients: string[];
  status: 'draft' | 'locked' | 'executed';
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AirdropDistribution {
  id: string;
  wallet_id: string;
  config_id: string | null;
  token_mint: string;
  amount_per_wallet: number;
  recipient_count: number;
  memo: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  transaction_signatures: string[] | null;
}

const MEMO_MAX_CHARS = 280;

export function AirdropManager() {
  const [wallets, setWallets] = useState<AirdropWallet[]>([]);
  const [configs, setConfigs] = useState<Record<string, AirdropConfig[]>>({});
  const [distributions, setDistributions] = useState<Record<string, AirdropDistribution[]>>({});
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Dialog states
  const [createWalletOpen, setCreateWalletOpen] = useState(false);
  const [newWalletNickname, setNewWalletNickname] = useState("");

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AirdropConfig | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState({
    name: "",
    token_mint: "",
    amount_per_wallet: "",
    memo: "",
    recipients: ""
  });

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyConfigId, setHistoryConfigId] = useState<string | null>(null);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveWalletId, setArchiveWalletId] = useState<string | null>(null);
  const [archiveStep, setArchiveStep] = useState(1);

  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [executeConfig, setExecuteConfig] = useState<AirdropConfig | null>(null);
  const [refreshingWallet, setRefreshingWallet] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    const { data, error } = await supabase
      .from("airdrop_wallets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load wallets");
      return;
    }

    setWallets(
      (data || []).map((w) => ({
        ...w,
        is_archived: w.is_archived ?? false
      }))
    );
  }, []);

  const loadConfigs = useCallback(async (walletId: string) => {
    const { data, error } = await supabase
      .from("airdrop_configs")
      .select("*")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load configs");
      return;
    }

    const mappedConfigs: AirdropConfig[] = (data || []).map((c) => ({
      ...c,
      status: c.status as 'draft' | 'locked' | 'executed',
      recipients: Array.isArray(c.recipients) ? (c.recipients as string[]) : []
    }));

    setConfigs((prev) => ({
      ...prev,
      [walletId]: mappedConfigs
    }));
  }, []);

  const loadDistributions = useCallback(async (configId: string) => {
    const { data, error } = await supabase
      .from("airdrop_distributions")
      .select("*")
      .eq("config_id", configId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load distribution history");
      return;
    }

    const mappedDists: AirdropDistribution[] = (data || []).map((d) => ({
      ...d,
      transaction_signatures: Array.isArray(d.transaction_signatures) ? (d.transaction_signatures as string[]) : null
    }));

    setDistributions((prev) => ({
      ...prev,
      [configId]: mappedDists
    }));
  }, []);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  const createWallet = async () => {
    if (!newWalletNickname.trim()) {
      toast.error("Please enter a nickname");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("airdrop-wallet-generator", {
        body: { nickname: newWalletNickname }
      });

      if (error) throw error;

      toast.success(`Wallet created: ${data.pubkey.slice(0, 8)}...`);
      setCreateWalletOpen(false);
      setNewWalletNickname("");
      loadWallets();
    } catch (error: any) {
      toast.error(error.message || "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  };

  const refreshWalletBalance = async (walletId: string, pubkey: string) => {
    setRefreshingWallet(walletId);
    try {
      // Fetch balance from Solana mainnet RPC
      const response = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [pubkey]
        })
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message || "Failed to fetch balance");
      }

      const solBalance = (result.result?.value || 0) / 1_000_000_000; // Convert lamports to SOL

      // Update database
      const { error } = await supabase
        .from("airdrop_wallets")
        .update({ sol_balance: solBalance })
        .eq("id", walletId);

      if (error) throw error;

      // Update local state
      setWallets((prev) =>
        prev.map((w) => (w.id === walletId ? { ...w, sol_balance: solBalance } : w))
      );

      toast.success(`Balance updated: ${solBalance.toFixed(4)} SOL`);
    } catch (error: any) {
      toast.error(error.message || "Failed to refresh balance");
    } finally {
      setRefreshingWallet(null);
    }
  };

  const toggleWalletExpanded = async (walletId: string) => {
    const newExpanded = new Set(expandedWallets);
    if (newExpanded.has(walletId)) {
      newExpanded.delete(walletId);
    } else {
      newExpanded.add(walletId);
      if (!configs[walletId]) {
        await loadConfigs(walletId);
      }
    }
    setExpandedWallets(newExpanded);
  };

  const openConfigDialog = (walletId: string, config?: AirdropConfig) => {
    setSelectedWalletId(walletId);
    if (config) {
      setEditingConfig(config);
      setConfigForm({
        name: config.name,
        token_mint: config.token_mint,
        amount_per_wallet: config.amount_per_wallet.toString(),
        memo: config.memo || "",
        recipients: config.recipients.join("\n")
      });
    } else {
      setEditingConfig(null);
      setConfigForm({
        name: "",
        token_mint: "",
        amount_per_wallet: "",
        memo: "",
        recipients: ""
      });
    }
    setConfigDialogOpen(true);
  };

  const saveConfig = async () => {
    if (!selectedWalletId) return;

    const recipients = configForm.recipients
      .split(/[\n,]/)
      .map((r) => r.trim())
      .filter((r) => r.length >= 32 && r.length <= 44);

    if (!configForm.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    if (!configForm.token_mint.trim()) {
      toast.error("Please enter a token mint");
      return;
    }
    if (!configForm.amount_per_wallet || parseFloat(configForm.amount_per_wallet) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Please enter at least one valid recipient");
      return;
    }

    setLoading(true);
    try {
      if (editingConfig) {
        const { error } = await supabase
          .from("airdrop_configs")
          .update({
            name: configForm.name,
            token_mint: configForm.token_mint,
            amount_per_wallet: parseFloat(configForm.amount_per_wallet),
            memo: configForm.memo || null,
            recipients: recipients
          })
          .eq("id", editingConfig.id);

        if (error) throw error;
        toast.success("Config updated");
      } else {
        const { error } = await supabase.from("airdrop_configs").insert({
          wallet_id: selectedWalletId,
          name: configForm.name,
          token_mint: configForm.token_mint,
          amount_per_wallet: parseFloat(configForm.amount_per_wallet),
          memo: configForm.memo || null,
          recipients: recipients
        });

        if (error) throw error;
        toast.success("Config created");
      }

      setConfigDialogOpen(false);
      loadConfigs(selectedWalletId);
    } catch (error: any) {
      toast.error(error.message || "Failed to save config");
    } finally {
      setLoading(false);
    }
  };

  const toggleConfigLock = async (config: AirdropConfig) => {
    const newStatus = config.status === "locked" ? "draft" : "locked";

    const { error } = await supabase
      .from("airdrop_configs")
      .update({ status: newStatus })
      .eq("id", config.id);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    toast.success(newStatus === "locked" ? "Config locked" : "Config unlocked");
    loadConfigs(config.wallet_id);
  };

  const openExecuteDialog = (config: AirdropConfig) => {
    setExecuteConfig(config);
    setExecuteDialogOpen(true);
  };

  const executeAirdrop = async () => {
    if (!executeConfig) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("execute-airdrop", {
        body: {
          wallet_id: executeConfig.wallet_id,
          config_id: executeConfig.id,
          token_mint: executeConfig.token_mint,
          amount_per_wallet: executeConfig.amount_per_wallet,
          recipients: executeConfig.recipients,
          memo: executeConfig.memo
        }
      });

      if (error) throw error;

      // Update config status and execution count
      await supabase
        .from("airdrop_configs")
        .update({
          status: "executed",
          execution_count: executeConfig.execution_count + 1,
          last_executed_at: new Date().toISOString()
        })
        .eq("id", executeConfig.id);

      toast.success(`Airdrop executed! ${data.successCount || executeConfig.recipients.length} transfers completed`);
      setExecuteDialogOpen(false);
      loadConfigs(executeConfig.wallet_id);
    } catch (error: any) {
      toast.error(error.message || "Failed to execute airdrop");
    } finally {
      setLoading(false);
    }
  };

  const deleteConfig = async (config: AirdropConfig) => {
    if (config.status !== "draft") {
      toast.error("Can only delete draft configs");
      return;
    }

    const { error } = await supabase.from("airdrop_configs").delete().eq("id", config.id);

    if (error) {
      toast.error("Failed to delete config");
      return;
    }

    toast.success("Config deleted");
    loadConfigs(config.wallet_id);
  };

  const openHistory = async (configId: string) => {
    setHistoryConfigId(configId);
    await loadDistributions(configId);
    setHistoryDialogOpen(true);
  };

  const startArchiveWallet = (walletId: string) => {
    setArchiveWalletId(walletId);
    setArchiveStep(1);
    setArchiveDialogOpen(true);
  };

  const archiveWallet = async () => {
    if (!archiveWalletId) return;

    const { error } = await supabase
      .from("airdrop_wallets")
      .update({ is_archived: true, is_active: false })
      .eq("id", archiveWalletId);

    if (error) {
      toast.error("Failed to archive wallet");
      return;
    }

    toast.success("Wallet archived (private keys preserved)");
    setArchiveDialogOpen(false);
    setArchiveStep(1);
    loadWallets();
  };

  const restoreWallet = async (walletId: string) => {
    const { error } = await supabase
      .from("airdrop_wallets")
      .update({ is_archived: false, is_active: true })
      .eq("id", walletId);

    if (error) {
      toast.error("Failed to restore wallet");
      return;
    }

    toast.success("Wallet restored");
    loadWallets();
  };

  const updateNickname = async (walletId: string, nickname: string) => {
    const { error } = await supabase.from("airdrop_wallets").update({ nickname }).eq("id", walletId);

    if (error) {
      toast.error("Failed to update nickname");
      return;
    }

    loadWallets();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const filteredWallets = wallets.filter((w) => (showArchived ? w.is_archived : !w.is_archived));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
      case "locked":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">Locked</Badge>;
      case "executed":
        return <Badge variant="secondary" className="bg-green-500/20 text-green-400">Executed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const parsedRecipientCount = configForm.recipients
    .split(/[\n,]/)
    .filter((r) => r.trim().length >= 32).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Airdrop Wallets</h2>
          <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Show Active" : "Show Archived"}
          </Button>
        </div>
        <Button onClick={() => setCreateWalletOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Wallet
        </Button>
      </div>

      <div className="space-y-4">
        {filteredWallets.map((wallet) => (
          <Card key={wallet.id} className={wallet.is_archived ? "opacity-60" : ""}>
            <Collapsible open={expandedWallets.has(wallet.id)} onOpenChange={() => toggleWalletExpanded(wallet.id)}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger className="flex items-center gap-3 hover:opacity-80">
                    {expandedWallets.has(wallet.id) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Input
                          value={wallet.nickname || ""}
                          onChange={(e) => updateNickname(wallet.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 w-48 bg-transparent border-transparent hover:border-border focus:border-border"
                          placeholder="Enter nickname"
                        />
                        {wallet.is_archived && <Badge variant="outline" className="text-muted-foreground">Archived</Badge>}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <span className="font-mono">{wallet.pubkey.slice(0, 8)}...{wallet.pubkey.slice(-6)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(wallet.pubkey);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">SOL Balance</div>
                        <div className="font-mono font-medium">{(wallet.sol_balance || 0).toFixed(4)} SOL</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          refreshWalletBalance(wallet.id, wallet.pubkey);
                        }}
                        disabled={refreshingWallet === wallet.id}
                        title="Refresh balance"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingWallet === wallet.id ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    {wallet.is_archived ? (
                      <Button variant="outline" size="icon" onClick={() => restoreWallet(wallet.id)} title="Restore wallet">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => startArchiveWallet(wallet.id)}
                        title="Archive wallet"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">Airdrop Configurations</h3>
                      {!wallet.is_archived && (
                        <Button size="sm" onClick={() => openConfigDialog(wallet.id)}>
                          <Plus className="h-4 w-4 mr-1" />
                          New Config
                        </Button>
                      )}
                    </div>

                    {(configs[wallet.id] || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No airdrop configurations yet</p>
                    ) : (
                      <div className="space-y-3">
                        {(configs[wallet.id] || []).map((config) => (
                          <div key={config.id} className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{config.name}</span>
                                  {getStatusBadge(config.status)}
                                  {config.execution_count > 0 && (
                                    <Badge variant="outline" className="text-xs">Executed {config.execution_count}x</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground space-y-0.5">
                                  <div className="font-mono">Token: {config.token_mint.slice(0, 8)}...{config.token_mint.slice(-6)}</div>
                                  <div>{config.amount_per_wallet.toLocaleString()} tokens → {config.recipients.length} recipients</div>
                                  {config.memo && <div className="italic">Memo: {config.memo}</div>}
                                  {config.last_executed_at && (
                                    <div>Last run: {format(new Date(config.last_executed_at), "MMM d, yyyy HH:mm")}</div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {config.execution_count > 0 && (
                                  <Button variant="ghost" size="icon" onClick={() => openHistory(config.id)} title="View history">
                                    <History className="h-4 w-4" />
                                  </Button>
                                )}

                                {config.status === "draft" && (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => openConfigDialog(wallet.id, config)} title="Edit">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => toggleConfigLock(config)} title="Lock">
                                      <Lock className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      onClick={() => deleteConfig(config)}
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}

                                {config.status === "locked" && (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => toggleConfigLock(config)} title="Unlock">
                                      <Unlock className="h-4 w-4" />
                                    </Button>
                                    <Button variant="default" size="sm" onClick={() => openExecuteDialog(config)} className="ml-2">
                                      <Play className="h-4 w-4 mr-1" />
                                      Execute
                                    </Button>
                                  </>
                                )}

                                {config.status === "executed" && (
                                  <Button variant="outline" size="sm" onClick={() => openExecuteDialog(config)} className="ml-2">
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                    Re-execute
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}

        {filteredWallets.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {showArchived ? "No archived wallets" : "No wallets yet. Create one to get started."}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Wallet Dialog */}
      <Dialog open={createWalletOpen} onOpenChange={setCreateWalletOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Airdrop Wallet</DialogTitle>
            <DialogDescription>Generate a new Solana wallet for airdrops. The private key will be securely stored.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                value={newWalletNickname}
                onChange={(e) => setNewWalletNickname(e.target.value)}
                placeholder="e.g., Marketing Airdrop"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWalletOpen(false)}>Cancel</Button>
            <Button onClick={createWallet} disabled={loading}>{loading ? "Creating..." : "Create Wallet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingConfig ? "Edit Airdrop Config" : "New Airdrop Config"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            <div>
              <Label>Config Name</Label>
              <Input
                value={configForm.name}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Community Reward Round 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Token Mint Address</Label>
                <Input
                  value={configForm.token_mint}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, token_mint: e.target.value }))}
                  placeholder="Token mint address"
                />
              </div>
              <div>
                <Label>Amount per Wallet</Label>
                <Input
                  type="number"
                  value={configForm.amount_per_wallet}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, amount_per_wallet: e.target.value }))}
                  placeholder="e.g., 1111"
                />
              </div>
            </div>

            <div>
              <Label>
                Memo (optional) <span className="text-muted-foreground">{configForm.memo.length}/{MEMO_MAX_CHARS} chars</span>
              </Label>
              <Input
                value={configForm.memo}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, memo: e.target.value.slice(0, MEMO_MAX_CHARS) }))}
                placeholder="Message to include in transactions"
              />
            </div>

            <div>
              <Label>
                Recipient Wallet Addresses <Badge variant="secondary">{parsedRecipientCount} detected</Badge>
              </Label>
              <Textarea
                value={configForm.recipients}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, recipients: e.target.value }))}
                placeholder="Paste wallet addresses (one per line or comma-separated)"
                rows={8}
                className="font-mono text-sm"
              />
            </div>

            {parsedRecipientCount > 0 && configForm.amount_per_wallet && (
              <Card className="bg-muted/50">
                <CardContent className="py-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{parsedRecipientCount}</p>
                      <p className="text-xs text-muted-foreground">Recipients</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{parseFloat(configForm.amount_per_wallet).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Tokens Each</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {(parsedRecipientCount * parseFloat(configForm.amount_per_wallet || "0")).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Tokens</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveConfig} disabled={loading}>{loading ? "Saving..." : "Save Config"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute Confirmation Dialog */}
      <AlertDialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Execute Airdrop</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {executeConfig && (
                  <div className="space-y-2 mt-2">
                    <p><strong>{executeConfig.name}</strong></p>
                    <p className="font-mono text-xs">Token: {executeConfig.token_mint.slice(0, 12)}...</p>
                    <p>Amount: {executeConfig.amount_per_wallet.toLocaleString()} tokens per wallet</p>
                    <p>Recipients: {executeConfig.recipients.length} wallets</p>
                    <p className="font-medium mt-4">
                      Total: {(executeConfig.amount_per_wallet * executeConfig.recipients.length).toLocaleString()} tokens
                    </p>
                    {executeConfig.execution_count > 0 && (
                      <p className="text-yellow-500">⚠️ This config has been executed {executeConfig.execution_count} time(s) before</p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeAirdrop} disabled={loading}>
              {loading ? "Executing..." : "Confirm Execute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Execution History</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {historyConfigId && (distributions[historyConfigId] || []).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No execution history</p>
            ) : (
              (distributions[historyConfigId || ""] || []).map((dist) => (
                <div key={dist.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{format(new Date(dist.created_at), "MMM d, yyyy HH:mm")}</span>
                    <Badge variant={dist.status === "completed" ? "default" : "destructive"}>{dist.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {dist.recipient_count} recipients • {dist.amount_per_wallet.toLocaleString()} tokens each
                  </div>
                  {dist.transaction_signatures && (
                    <div className="text-xs text-muted-foreground">
                      {(dist.transaction_signatures as string[]).length} transaction(s)
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Wallet Multi-Step Confirmation */}
      <AlertDialog
        open={archiveDialogOpen}
        onOpenChange={(open) => {
          if (!open) setArchiveStep(1);
          setArchiveDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveStep === 1 && "Archive Wallet?"}
              {archiveStep === 2 && "Are you sure?"}
              {archiveStep === 3 && "Final Confirmation"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveStep === 1 && "This will archive the wallet. The private keys will be preserved for future recovery."}
              {archiveStep === 2 &&
                "The wallet will no longer appear in the active list. You can restore it later from the archived view."}
              {archiveStep === 3 && (
                <span className="text-yellow-500 font-medium">
                  This is your final warning. Click "Archive" to proceed or "Cancel" to go back.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setArchiveStep(1)}>Cancel</AlertDialogCancel>
            {archiveStep < 3 ? (
              <AlertDialogAction onClick={() => setArchiveStep((s) => s + 1)}>Continue ({archiveStep}/3)</AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={archiveWallet} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Archive Wallet
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
