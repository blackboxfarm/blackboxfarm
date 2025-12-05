import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Wallet, Plus, RefreshCw, Copy, Send, ArrowDownLeft, 
  ShoppingCart, DollarSign, Coins, Settings, History,
  QrCode, ExternalLink, Loader2, ArrowUpRight, Trash2, Zap
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import QRCode from 'qrcode';

interface WalletInfo {
  pubkey: string;
  sol_balance: number;
  tokens: TokenInfo[];
}

interface TokenInfo {
  mint: string;
  balance: number;
  decimals: number;
  address: string;
  symbol?: string;
  name?: string;
  logoURI?: string;
  usdValue?: number;
}

interface AutoBuyConfig {
  id: string;
  is_enabled: boolean;
  buy_amount_sol: number;
  max_daily_buys: number;
  min_launcher_score: number;
  slippage_bps: number;
  buys_today: number;
  // Smart auto-buy settings
  auto_buy_min_market_cap: number;
  auto_buy_max_market_cap: number;
  auto_buy_min_holders: number;
  auto_buy_min_age_minutes: number;
  auto_buy_require_dev_buy: boolean;
  // Distribution settings
  distribution_enabled: boolean;
  distribution_wallet_1: string;
  distribution_wallet_2: string;
  distribution_wallet_3: string;
  distribution_percent_per_wallet: number;
  distribution_percent_wallet_1: number;
  distribution_percent_wallet_2: number;
  distribution_percent_wallet_3: number;
}

interface MegaWhaleWalletManagerProps {
  userId: string;
}

export function MegaWhaleWalletManager({ userId }: MegaWhaleWalletManagerProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [config, setConfig] = useState<AutoBuyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  // Transfer state
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferType, setTransferType] = useState<'sol' | 'token'>('sol');
  const [transferToken, setTransferToken] = useState<TokenInfo | null>(null);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  
  // Buy state
  const [buyMint, setBuyMint] = useState('');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [buying, setBuying] = useState(false);
  
  // Sell state
  const [selling, setSelling] = useState<string | null>(null);

  const loadWalletInfo = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-wallet-transfer', {
        body: { action: 'get_wallet_info', user_id: userId }
      });

      if (error) throw error;
      
      if (data?.wallet) {
        setWallet(data.wallet);
        
        // Generate QR code
        const qr = await QRCode.toDataURL(data.wallet.pubkey, { width: 200 });
        setQrCodeUrl(qr);
        
        // Fetch token metadata for better display
        await enrichTokenData(data.wallet.tokens);
      }
    } catch (error: any) {
      console.error('Failed to load wallet info:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [userId]);

  const loadConfig = useCallback(async () => {
    try {
      // Load auto-buy config
      const { data, error } = await supabase.functions.invoke('mega-whale-auto-buyer', {
        body: { action: 'get_config', user_id: userId }
      });

      if (error) throw error;
      
      // Load alert config for distribution and smart buy settings
      const { data: alertConfig } = await supabase
        .from('mega_whale_alert_config')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (data?.config) {
        setConfig({
          ...data.config,
          // Merge distribution settings from alert config
          distribution_enabled: alertConfig?.distribution_enabled ?? false,
          distribution_wallet_1: alertConfig?.distribution_wallet_1 || '',
          distribution_wallet_2: alertConfig?.distribution_wallet_2 || '',
          distribution_wallet_3: alertConfig?.distribution_wallet_3 || '',
          distribution_percent_per_wallet: alertConfig?.distribution_percent_per_wallet || 10,
          distribution_percent_wallet_1: alertConfig?.distribution_percent_wallet_1 || 10,
          distribution_percent_wallet_2: alertConfig?.distribution_percent_wallet_2 || 10,
          distribution_percent_wallet_3: alertConfig?.distribution_percent_wallet_3 || 10,
          // Merge smart buy settings
          auto_buy_min_market_cap: alertConfig?.auto_buy_min_market_cap || 9500,
          auto_buy_max_market_cap: alertConfig?.auto_buy_max_market_cap || 50000,
          auto_buy_min_holders: alertConfig?.auto_buy_min_holders || 5,
          auto_buy_min_age_minutes: alertConfig?.auto_buy_min_age_minutes || 3,
          auto_buy_require_dev_buy: alertConfig?.auto_buy_require_dev_buy ?? true
        });
      }
    } catch (error: any) {
      console.error('Failed to load config:', error);
    }
  }, [userId]);

  useEffect(() => {
    loadWalletInfo();
    loadConfig();
  }, [loadWalletInfo, loadConfig]);

  const enrichTokenData = async (tokens: TokenInfo[]) => {
    if (!tokens.length) return;
    
    try {
      // Fetch from Jupiter for token metadata
      const mints = tokens.map(t => t.mint);
      const response = await fetch(`https://api.jup.ag/tokens/v1/strict`);
      const allTokens = await response.json();
      
      const enriched = tokens.map(token => {
        const metadata = allTokens.find((t: any) => t.address === token.mint);
        return {
          ...token,
          symbol: metadata?.symbol || token.mint.slice(0, 6),
          name: metadata?.name || 'Unknown Token',
          logoURI: metadata?.logoURI
        };
      });
      
      setWallet(prev => prev ? { ...prev, tokens: enriched } : null);
    } catch (error) {
      console.error('Failed to enrich token data:', error);
    }
  };

  const generateWallet = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-auto-buyer', {
        body: { action: 'generate_wallet', user_id: userId }
      });

      if (error) throw error;
      
      toast.success('Wallet generated! Fund it to start using.');
      await loadWalletInfo();
      await loadConfig();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate wallet');
    } finally {
      setGenerating(false);
    }
  };

  const copyAddress = () => {
    if (wallet?.pubkey) {
      navigator.clipboard.writeText(wallet.pubkey);
      toast.success('Address copied!');
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    
    try {
      // Save auto-buy config
      const { error } = await supabase.functions.invoke('mega-whale-auto-buyer', {
        body: {
          action: 'update_config',
          user_id: userId,
          config: {
            is_enabled: config.is_enabled,
            buy_amount_sol: config.buy_amount_sol,
            max_daily_buys: config.max_daily_buys,
            min_launcher_score: config.min_launcher_score,
            slippage_bps: config.slippage_bps
          }
        }
      });

      if (error) throw error;
      
      // Save distribution settings and smart buy config directly to mega_whale_alert_config
      const { error: alertConfigError } = await supabase
        .from('mega_whale_alert_config')
        .update({
          distribution_enabled: config.distribution_enabled,
          distribution_wallet_1: config.distribution_wallet_1 || null,
          distribution_wallet_2: config.distribution_wallet_2 || null,
          distribution_wallet_3: config.distribution_wallet_3 || null,
          distribution_percent_per_wallet: config.distribution_percent_per_wallet || 10,
          distribution_percent_wallet_1: config.distribution_percent_wallet_1 || 10,
          distribution_percent_wallet_2: config.distribution_percent_wallet_2 || 10,
          distribution_percent_wallet_3: config.distribution_percent_wallet_3 || 10,
          auto_buy_min_market_cap: config.auto_buy_min_market_cap || 9500,
          auto_buy_max_market_cap: config.auto_buy_max_market_cap || 50000,
          auto_buy_min_holders: config.auto_buy_min_holders || 5,
          auto_buy_min_age_minutes: config.auto_buy_min_age_minutes || 3,
          auto_buy_require_dev_buy: config.auto_buy_require_dev_buy ?? true
        })
        .eq('user_id', userId);
      
      if (alertConfigError) throw alertConfigError;
      
      toast.success('Settings saved!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferRecipient || !transferAmount) {
      toast.error('Please fill all fields');
      return;
    }

    setTransferring(true);
    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-wallet-transfer', {
        body: {
          action: transferType === 'sol' ? 'transfer_sol' : 'transfer_token',
          user_id: userId,
          recipient: transferRecipient,
          amount: parseFloat(transferAmount),
          token_mint: transferToken?.mint
        }
      });

      if (error) throw error;
      
      toast.success(`Transfer successful! Signature: ${data.signature?.slice(0, 20)}...`);
      setShowTransferDialog(false);
      setTransferRecipient('');
      setTransferAmount('');
      await loadWalletInfo();
    } catch (error: any) {
      toast.error(error.message || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const handleBuy = async () => {
    if (!buyMint || !buyAmount) {
      toast.error('Please enter token mint and amount');
      return;
    }

    setBuying(true);
    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-wallet-transfer', {
        body: {
          action: 'buy_token',
          user_id: userId,
          token_mint: buyMint,
          amount: parseFloat(buyAmount)
        }
      });

      if (error) throw error;
      
      toast.success('Buy order executed!');
      setBuyMint('');
      await loadWalletInfo();
    } catch (error: any) {
      toast.error(error.message || 'Buy failed');
    } finally {
      setBuying(false);
    }
  };

  const handleSell = async (token: TokenInfo, amount?: number) => {
    setSelling(token.mint);
    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-wallet-transfer', {
        body: {
          action: 'sell_token',
          user_id: userId,
          token_mint: token.mint,
          amount: amount || token.balance
        }
      });

      if (error) throw error;
      
      toast.success('Sell order executed!');
      await loadWalletInfo();
    } catch (error: any) {
      toast.error(error.message || 'Sell failed');
    } finally {
      setSelling(null);
    }
  };

  const openTransferDialog = (type: 'sol' | 'token', token?: TokenInfo) => {
    setTransferType(type);
    setTransferToken(token || null);
    setTransferRecipient('');
    setTransferAmount('');
    setShowTransferDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wallet Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Your MEGA WHALE Wallet
          </CardTitle>
          <CardDescription>
            Dedicated wallet for auto-buying whale mints and manual trading
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!wallet ? (
            <div className="text-center py-8">
              <Wallet className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No wallet generated yet</p>
              <Button onClick={generateWallet} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Generate Wallet
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Wallet Info */}
              <div className="flex items-start gap-6">
                {qrCodeUrl && (
                  <div className="flex-shrink-0">
                    <img 
                      src={qrCodeUrl} 
                      alt="Wallet QR Code" 
                      className="w-32 h-32 rounded-lg border"
                    />
                  </div>
                )}
                <div className="flex-1 space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Public Key</Label>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                        {wallet.pubkey}
                      </code>
                      <Button size="sm" variant="outline" onClick={copyAddress}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`https://solscan.io/account/${wallet.pubkey}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">SOL Balance</Label>
                      <div className="text-2xl font-bold">
                        {wallet.sol_balance.toFixed(4)} SOL
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={loadWalletInfo}
                      disabled={refreshing}
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => openTransferDialog('sol')}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send SOL
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {wallet && (
        <>
          {/* Buy Token Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5" />
                Buy Token
              </CardTitle>
              <CardDescription>
                Manually buy any token using SOL from your wallet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>Token Mint Address</Label>
                  <Input 
                    placeholder="Enter token mint address..."
                    value={buyMint}
                    onChange={(e) => setBuyMint(e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <Label>Amount (SOL)</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBuy} disabled={buying || !buyMint}>
                    {buying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Buy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Holdings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Coins className="h-5 w-5" />
                    Token Holdings
                  </CardTitle>
                  <CardDescription>
                    All tokens in your wallet
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={loadWalletInfo} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {wallet.tokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Coins className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No tokens in wallet</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {wallet.tokens.map((token) => (
                      <div 
                        key={token.mint} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {token.logoURI ? (
                            <img src={token.logoURI} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <Coins className="h-4 w-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{token.symbol || token.mint.slice(0, 6)}</div>
                            <div className="text-xs text-muted-foreground">
                              {token.balance.toLocaleString()} tokens
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => openTransferDialog('token', token)}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Send
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleSell(token)}
                            disabled={selling === token.mint}
                          >
                            {selling === token.mint ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <DollarSign className="h-3 w-3 mr-1" />
                                Sell
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Auto-Buy Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5" />
                Auto-Buy Settings
              </CardTitle>
              <CardDescription>
                Automatically buy tokens when tracked whales mint new tokens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {config ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable Auto-Buy</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically buy when whales mint tokens
                      </p>
                    </div>
                    <Switch 
                      checked={config.is_enabled}
                      onCheckedChange={(checked) => setConfig({...config, is_enabled: checked})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Buy Amount (SOL)</Label>
                      <Input 
                        type="number"
                        step="0.01"
                        value={config.buy_amount_sol}
                        onChange={(e) => setConfig({...config, buy_amount_sol: parseFloat(e.target.value) || 0.1})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Daily Buys</Label>
                      <Input 
                        type="number"
                        value={config.max_daily_buys}
                        onChange={(e) => setConfig({...config, max_daily_buys: parseInt(e.target.value) || 10})}
                      />
                      <p className="text-xs text-muted-foreground">
                        Used today: {config.buys_today}
                      </p>
                    </div>
                  </div>

                  {/* Smart Auto-Buy Settings */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      Smart Buyability Settings
                    </h4>
                    <p className="text-xs text-muted-foreground mb-4">
                      Configure market conditions required before auto-buying. Prevents buying failed launches or test tokens.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Min Market Cap ($)</Label>
                        <Input 
                          type="number"
                          step="500"
                          value={config.auto_buy_min_market_cap || 9500}
                          onChange={(e) => setConfig({...config, auto_buy_min_market_cap: parseFloat(e.target.value) || 9500})}
                        />
                        <p className="text-xs text-muted-foreground">
                          Wait until MC reaches this (default: $9,500)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Max Market Cap ($)</Label>
                        <Input 
                          type="number"
                          step="5000"
                          value={config.auto_buy_max_market_cap || 50000}
                          onChange={(e) => setConfig({...config, auto_buy_max_market_cap: parseFloat(e.target.value) || 50000})}
                        />
                        <p className="text-xs text-muted-foreground">
                          Don't buy if MC exceeds this (too late)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label>Min Unique Holders</Label>
                        <Input 
                          type="number"
                          value={config.auto_buy_min_holders || 5}
                          onChange={(e) => setConfig({...config, auto_buy_min_holders: parseInt(e.target.value) || 5})}
                        />
                        <p className="text-xs text-muted-foreground">
                          Require at least this many buyers
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Min Age (minutes)</Label>
                        <Input 
                          type="number"
                          value={config.auto_buy_min_age_minutes || 3}
                          onChange={(e) => setConfig({...config, auto_buy_min_age_minutes: parseInt(e.target.value) || 3})}
                        />
                        <p className="text-xs text-muted-foreground">
                          Wait this long after mint
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label>Require Dev Buy-In</Label>
                        <p className="text-xs text-muted-foreground">
                          Only buy if dev wallet has also bought (not a test launch)
                        </p>
                      </div>
                      <Switch 
                        checked={config.auto_buy_require_dev_buy ?? true}
                        onCheckedChange={(checked) => setConfig({...config, auto_buy_require_dev_buy: checked})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Min Launcher Score</Label>
                      <span className="text-sm font-medium">{config.min_launcher_score}</span>
                    </div>
                    <Slider 
                      value={[config.min_launcher_score]}
                      onValueChange={([value]) => setConfig({...config, min_launcher_score: value})}
                      min={0}
                      max={100}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Only auto-buy from launchers with score ≥ {config.min_launcher_score}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Slippage Tolerance</Label>
                      <span className="text-sm font-medium">{(config.slippage_bps / 100).toFixed(1)}%</span>
                    </div>
                    <Slider 
                      value={[config.slippage_bps]}
                      onValueChange={([value]) => setConfig({...config, slippage_bps: value})}
                      min={100}
                      max={5000}
                      step={100}
                    />
                  </div>

                  {/* Profit Distribution Settings */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                      Profit Distribution
                    </h4>
                    <p className="text-xs text-muted-foreground mb-4">
                      Automatically split {(config.distribution_percent_wallet_1 || 10) + (config.distribution_percent_wallet_2 || 10) + (config.distribution_percent_wallet_3 || 10)}% of profits after each sell to 3 wallets.
                    </p>
                    
                    <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label>Enable Auto-Distribution</Label>
                        <p className="text-xs text-muted-foreground">
                          Send profits to your configured wallets
                        </p>
                      </div>
                      <Switch 
                        checked={config.distribution_enabled ?? false}
                        onCheckedChange={(checked) => setConfig({...config, distribution_enabled: checked})}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2 p-3 border rounded-lg">
                        <Label className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">1</span>
                          Distribution Wallet #1
                        </Label>
                        <Input 
                          placeholder="Enter Solana wallet address..."
                          value={config.distribution_wallet_1 || ''}
                          onChange={(e) => setConfig({...config, distribution_wallet_1: e.target.value})}
                          className="font-mono text-sm"
                        />
                        <div className="flex items-center gap-3 mt-2">
                          <Slider
                            value={[config.distribution_percent_wallet_1 || 10]}
                            onValueChange={(value) => setConfig({...config, distribution_percent_wallet_1: value[0]})}
                            min={0}
                            max={50}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-sm font-medium w-12 text-right">{config.distribution_percent_wallet_1 || 10}%</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 p-3 border rounded-lg">
                        <Label className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">2</span>
                          Distribution Wallet #2
                        </Label>
                        <Input 
                          placeholder="Enter Solana wallet address..."
                          value={config.distribution_wallet_2 || ''}
                          onChange={(e) => setConfig({...config, distribution_wallet_2: e.target.value})}
                          className="font-mono text-sm"
                        />
                        <div className="flex items-center gap-3 mt-2">
                          <Slider
                            value={[config.distribution_percent_wallet_2 || 10]}
                            onValueChange={(value) => setConfig({...config, distribution_percent_wallet_2: value[0]})}
                            min={0}
                            max={50}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-sm font-medium w-12 text-right">{config.distribution_percent_wallet_2 || 10}%</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 p-3 border rounded-lg">
                        <Label className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center">3</span>
                          Distribution Wallet #3
                        </Label>
                        <Input 
                          placeholder="Enter Solana wallet address..."
                          value={config.distribution_wallet_3 || ''}
                          onChange={(e) => setConfig({...config, distribution_wallet_3: e.target.value})}
                          className="font-mono text-sm"
                        />
                        <div className="flex items-center gap-3 mt-2">
                          <Slider
                            value={[config.distribution_percent_wallet_3 || 10]}
                            onValueChange={(value) => setConfig({...config, distribution_percent_wallet_3: value[0]})}
                            min={0}
                            max={50}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-sm font-medium w-12 text-right">{config.distribution_percent_wallet_3 || 10}%</span>
                        </div>
                      </div>
                    </div>

                    {config.distribution_enabled && (!config.distribution_wallet_1 || !config.distribution_wallet_2 || !config.distribution_wallet_3) && (
                      <p className="text-xs text-yellow-600 mt-3 p-2 bg-yellow-500/10 rounded">
                        ⚠️ Distribution is enabled but not all wallets are configured. Please add all 3 wallet addresses.
                      </p>
                    )}
                  </div>

                  <Button onClick={saveConfig} disabled={savingConfig} className="w-full">
                    {savingConfig ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Settings'
                    )}
                  </Button>
                </>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Config not loaded. Generate a wallet first.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send {transferType === 'sol' ? 'SOL' : transferToken?.symbol || 'Token'}
            </DialogTitle>
            <DialogDescription>
              Transfer to any Solana address
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Recipient Address</Label>
              <Input 
                placeholder="Enter Solana address..."
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
              />
            </div>
            <div>
              <Label>Amount</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number"
                  step="0.0001"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">
                  {transferType === 'sol' ? 'SOL' : transferToken?.symbol}
                </span>
              </div>
              {transferType === 'sol' && wallet && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available: {wallet.sol_balance.toFixed(4)} SOL
                </p>
              )}
              {transferType === 'token' && transferToken && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available: {transferToken.balance.toLocaleString()} {transferToken.symbol}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleTransfer} disabled={transferring}>
              {transferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
