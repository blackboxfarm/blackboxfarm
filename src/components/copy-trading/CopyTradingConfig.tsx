import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Copy, DollarSign, Settings, TrendingUp } from 'lucide-react'

interface MonitoredWallet {
  id: string
  wallet_address: string
  label: string
  is_active: boolean
}

interface CopyConfig {
  id: string
  monitored_wallet_id: string
  is_enabled: boolean
  is_fantasy_mode: boolean
  new_buy_amount_usd: number
  rebuy_amount_usd: number
  copy_sell_percentage: boolean
  max_daily_trades: number
  max_position_size_usd: number
  monitored_wallets: {
    wallet_address: string
    label: string
  }
}

interface FantasyWallet {
  id: string
  balance_usd: number
  total_invested: number
  total_profit_loss: number
  total_trades: number
  win_rate: number
}

export function CopyTradingConfig() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [monitoredWallets, setMonitoredWallets] = useState<MonitoredWallet[]>([])
  const [copyConfigs, setCopyConfigs] = useState<CopyConfig[]>([])
  const [fantasyWallet, setFantasyWallet] = useState<FantasyWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [walletLabel, setWalletLabel] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    console.log('CopyTradingConfig useEffect - user:', user)
    loadData()
  }, [user])

  const loadData = async () => {
    try {
      console.log('CopyTradingConfig loadData starting')
      setLoading(true)
      
      // Load monitored wallets (supports preview mode)
      if (!user) {
        console.log('Loading monitored wallets via edge function (preview mode)')
        const { data, error } = await supabase.functions.invoke('get-monitored-wallets')
        if (error) {
          console.error('get-monitored-wallets error:', error)
        }
        setMonitoredWallets(data?.wallets || [])
        setCopyConfigs([])
        setFantasyWallet(null)
      } else {
        console.log('Loading monitored wallets for user:', user?.id)
        const { data: wallets, error: walletsError } = await supabase
          .from('monitored_wallets')
          .select('*')
          .eq('user_id', user?.id)
          .eq('is_active', true)

        if (walletsError) {
          console.error('Wallets error:', walletsError)
          throw walletsError
        }
        console.log('Loaded wallets:', wallets)
        setMonitoredWallets(wallets || [])

        // Load copy configs
        const { data: configs, error: configsError } = await supabase
          .from('wallet_copy_configs')
          .select(`
            *,
            monitored_wallets!inner(wallet_address, label)
          `)
          .eq('user_id', user?.id)

        if (configsError) throw configsError
        setCopyConfigs(configs || [])

        // Load fantasy wallet
        const { data: fantasy, error: fantasyError } = await supabase
          .from('fantasy_wallets')
          .select('*')
          .eq('user_id', user?.id)
          .single()

        if (fantasyError && fantasyError.code !== 'PGRST116') {
          console.error('Error loading fantasy wallet:', fantasyError)
        } else {
          setFantasyWallet(fantasy)
        }
      }

    } catch (error) {
      console.error('Error loading copy trading data:', error)
      toast({
        title: "Error",
        description: "Failed to load copy trading configuration",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const createOrUpdateConfig = async (walletId: string, config: Partial<CopyConfig>) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to modify copy trading settings.",
        variant: "destructive",
      })
      return
    }
    
    try {
      setSaving(true)
      
      const existingConfig = copyConfigs.find(c => c.monitored_wallet_id === walletId)
      
      if (existingConfig) {
        const { error } = await supabase
          .from('wallet_copy_configs')
          .update(config)
          .eq('id', existingConfig.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('wallet_copy_configs')
          .insert({
            user_id: user?.id,
            monitored_wallet_id: walletId,
            ...config
          })

        if (error) throw error
      }

      await loadData()
      toast({
        title: "Success",
        description: "Copy configuration updated successfully"
      })

    } catch (error) {
      console.error('Error updating copy config:', error)
      toast({
        title: "Error",
        description: "Failed to update copy configuration",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const createFantasyWallet = async () => {
    if (!user) {
      toast({
        title: "Authentication Required", 
        description: "Please sign in to create fantasy wallets.",
        variant: "destructive",
      })
      return
    }
    
    try {
      setSaving(true)
      
      const { data, error } = await supabase
        .from('fantasy_wallets')
        .insert({
          user_id: user?.id,
          balance_usd: 10000
        })
        .select()
        .single()

      if (error) throw error
      setFantasyWallet(data)
      
      toast({
        title: "Fantasy Wallet Created",
        description: "Your fantasy wallet has been created with $10,000 starting balance"
      })

    } catch (error) {
      console.error('Error creating fantasy wallet:', error)
      toast({
        title: "Error",
        description: "Failed to create fantasy wallet",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const runBackfillAnalysis = async (walletAddress: string) => {
    try {
      setSaving(true)
      
      const { data, error } = await supabase.functions.invoke('backfill-wallet-transactions', {
        body: {
          wallet_address: walletAddress,
          hours: 24
        }
      })

      if (error) throw error

      toast({
        title: "Analysis Complete",
        description: `Found ${data.transactions_processed} transactions in last 24 hours. Copy trades have been simulated.`
      })

    } catch (error) {
      console.error('Error running backfill analysis:', error)
      toast({
        title: "Error",
        description: "Failed to run 24-hour analysis",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }
  const addWalletAndAnalyze = async () => {
    if (!walletAddress || walletAddress.trim().length < 8) {
      toast({ title: 'Invalid address', description: 'Enter a valid wallet address', variant: 'destructive' })
      return
    }
    try {
      setAdding(true)
      // 1) Add monitored wallet via Edge Function (works in preview mode too)
      const { data: addResp, error: addErr } = await supabase.functions.invoke('add-monitored-wallet', {
        body: {
          wallet_address: walletAddress.trim(),
          label: walletLabel?.trim() || 'Monitored Wallet',
          is_active: true,
        }
      })
      if (addErr) throw addErr

      // 2) Backfill last 24h to initialize transactions and trigger copy logic
      await supabase.functions.invoke('backfill-wallet-transactions', {
        body: { wallet_address: walletAddress.trim(), hours: 24 }
      })

      setWalletAddress('')
      setWalletLabel('')
      await loadData()
      toast({ title: 'Wallet added', description: 'Backfilled last 24h and loaded config.' })
    } catch (e) {
      console.error('addWalletAndAnalyze error:', e)
      toast({ title: 'Failed to add wallet', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Copy Trading Configuration</h2>
          <p className="text-muted-foreground">
            Configure automatic copying of monitored wallet trades
          </p>
        </div>
        
        {!fantasyWallet && (
          <Button onClick={createFantasyWallet} disabled={saving || !user}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <DollarSign className="mr-2 h-4 w-4" />
            Create Fantasy Wallet
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add Wallet to Mirror</CardTitle>
          <CardDescription>
            Enter a wallet to monitor. We'll backfill the last 24h and start tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-4">
              <Label htmlFor="walletAddress">Wallet Address</Label>
              <Input
                id="walletAddress"
                placeholder="Enter wallet address to copy"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="walletLabel">Label (optional)</Label>
              <Input
                id="walletLabel"
                placeholder="e.g., Whale #1"
                value={walletLabel}
                onChange={(e) => setWalletLabel(e.target.value)}
              />
            </div>
            <div className="md:col-span-6 flex justify-end">
              <Button onClick={addWalletAndAnalyze} disabled={adding}>
                {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add & Analyze 24h
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {fantasyWallet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Fantasy Wallet Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className="text-lg font-semibold">${fantasyWallet.balance_usd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Invested</p>
                <p className="text-lg font-semibold">${fantasyWallet.total_invested.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">P&L</p>
                <p className={`text-lg font-semibold ${fantasyWallet.total_profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${fantasyWallet.total_profit_loss.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-lg font-semibold">{fantasyWallet.total_trades}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-lg font-semibold">{fantasyWallet.win_rate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Monitored Wallets Copy Configuration</CardTitle>
          <CardDescription>
            Configure how to copy trades from each monitored wallet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {monitoredWallets.map((wallet) => {
              const config = copyConfigs.find(c => c.monitored_wallet_id === wallet.id)
              
              return (
                <div key={wallet.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <h4 className="font-medium">{wallet.label}</h4>
                        <p className="text-sm text-muted-foreground font-mono">
                          {wallet.wallet_address.slice(0, 8)}...{wallet.wallet_address.slice(-8)}
                        </p>
                      </div>
                      <Badge variant={config?.is_enabled ? 'default' : 'secondary'}>
                        {config?.is_enabled ? 'Active' : 'Inactive'}
                      </Badge>
                      {config?.is_fantasy_mode && (
                        <Badge variant="outline">Fantasy Mode</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runBackfillAnalysis(wallet.wallet_address)}
                        disabled={saving || !user}
                      >
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run 24h Analysis
                      </Button>
                    </div>
                  </div>

                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList>
                      <TabsTrigger value="basic">Basic Settings</TabsTrigger>
                      <TabsTrigger value="advanced">Advanced</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="basic" className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`enabled-${wallet.id}`}>Enable Copying</Label>
                           <Switch
                            id={`enabled-${wallet.id}`}
                            checked={config?.is_enabled || false}
                            disabled={!user}
                            onCheckedChange={(checked) => 
                              createOrUpdateConfig(wallet.id, { is_enabled: checked })
                            }
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`fantasy-${wallet.id}`}>Fantasy Mode</Label>
                           <Switch
                            id={`fantasy-${wallet.id}`}
                            checked={config?.is_fantasy_mode || false}
                            disabled={!user}
                            onCheckedChange={(checked) => 
                              createOrUpdateConfig(wallet.id, { is_fantasy_mode: checked })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`new-buy-${wallet.id}`}>New Buy Amount (USD)</Label>
                           <Input
                            id={`new-buy-${wallet.id}`}
                            type="number"
                            disabled={!user}
                            value={config?.new_buy_amount_usd || 100}
                            onChange={(e) => 
                              createOrUpdateConfig(wallet.id, { 
                                new_buy_amount_usd: parseFloat(e.target.value) || 100 
                              })
                            }
                            min="1"
                            step="10"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`rebuy-${wallet.id}`}>Re-buy Amount (USD)</Label>
                           <Input
                            id={`rebuy-${wallet.id}`}
                            type="number"
                            disabled={!user}
                            value={config?.rebuy_amount_usd || 10}
                            onChange={(e) => 
                              createOrUpdateConfig(wallet.id, { 
                                rebuy_amount_usd: parseFloat(e.target.value) || 10 
                              })
                            }
                            min="1"
                            step="5"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor={`copy-sells-${wallet.id}`}>Copy Sells (Same %)</Label>
                         <Switch
                          id={`copy-sells-${wallet.id}`}
                          checked={config?.copy_sell_percentage !== false}
                          disabled={!user}
                          onCheckedChange={(checked) => 
                            createOrUpdateConfig(wallet.id, { copy_sell_percentage: checked })
                          }
                        />
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="advanced" className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`max-trades-${wallet.id}`}>Max Daily Trades</Label>
                           <Input
                            id={`max-trades-${wallet.id}`}
                            type="number"
                            disabled={!user}
                            value={config?.max_daily_trades || 50}
                            onChange={(e) => 
                              createOrUpdateConfig(wallet.id, { 
                                max_daily_trades: parseInt(e.target.value) || 50 
                              })
                            }
                            min="1"
                            max="100"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`max-position-${wallet.id}`}>Max Position Size (USD)</Label>
                           <Input
                            id={`max-position-${wallet.id}`}
                            type="number"
                            disabled={!user}
                            value={config?.max_position_size_usd || 1000}
                            onChange={(e) => 
                              createOrUpdateConfig(wallet.id, { 
                                max_position_size_usd: parseFloat(e.target.value) || 1000 
                              })
                            }
                            min="100"
                            step="100"
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )
            })}

            {monitoredWallets.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                <Copy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No monitored wallets found.</p>
                <p className="text-sm">Add wallets to the Wallet Monitor first to enable copy trading.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}