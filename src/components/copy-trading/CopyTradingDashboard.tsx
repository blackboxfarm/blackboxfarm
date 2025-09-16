import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdminAuth } from '@/hooks/useSuperAdminAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { Loader2, TrendingUp, TrendingDown, Copy, Clock, DollarSign } from 'lucide-react'

interface CopyTrade {
  id: string
  trade_type: string
  token_symbol?: string
  token_name?: string
  amount_usd: number
  amount_sol: number
  price_per_token: number
  sell_percentage?: number
  is_fantasy: boolean
  status: string
  executed_at: string
  created_at: string
  profit_loss_usd?: number
  original_wallet_address: string
  transaction_signature?: string
}

interface FantasyPosition {
  id: string
  token_mint: string
  token_symbol: string
  token_name: string
  balance: number
  average_buy_price: number
  total_invested_usd: number
  current_value_usd: number
  profit_loss_usd: number
  profit_loss_percentage: number
}

export function CopyTradingDashboard() {
  const { user } = useAuth()
  const { authReady } = useSuperAdminAuth()
  const { toast } = useToast()
  const [copyTrades, setCopyTrades] = useState<CopyTrade[]>([])
  const [fantasyPositions, setFantasyPositions] = useState<FantasyPosition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('CopyTradingDashboard useEffect - user:', user, 'authReady:', authReady)
    if (user && authReady) {
      loadData()
      
      // Set up real-time subscriptions
      const tradesSubscription = supabase
        .channel('copy-trades-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'copy_trades',
            filter: `user_id=eq.${user.id}`
          },
          () => loadData()
        )
        .subscribe()

      return () => {
        tradesSubscription.unsubscribe()
      }
    } else if (!user || !authReady) {
      setLoading(false)
    }
  }, [user, authReady])

  // Listen for preview data claim events to reload data
  useEffect(() => {
    const handlePreviewDataClaimed = () => {
      console.log('Dashboard: Preview data claimed event received, reloading data...')
      if (user && authReady) {
        loadData()
      }
    }

    window.addEventListener('preview-data-claimed', handlePreviewDataClaimed)
    return () => window.removeEventListener('preview-data-claimed', handlePreviewDataClaimed)
  }, [user, authReady])

  const loadData = async () => {
    try {
      console.log('CopyTradingDashboard loadData starting')
      setLoading(true)
      
      // Load copy trades
      console.log('Loading copy trades for user:', user?.id)
      const { data: trades, error: tradesError } = await supabase
        .from('copy_trades')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (tradesError) {
        console.error('Trades error:', tradesError)
        throw tradesError
      }
      console.log('Loaded trades:', trades)
      setCopyTrades(trades || [])

      // Load fantasy positions
      const { data: positions, error: positionsError } = await supabase
        .from('fantasy_positions')
        .select(`
          *,
          fantasy_wallets!inner(user_id)
        `)
        .eq('fantasy_wallets.user_id', user?.id)
        .gt('balance', 0)

      if (positionsError && positionsError.code !== 'PGRST116') {
        console.error('Error loading fantasy positions:', positionsError)
      } else {
        setFantasyPositions(positions || [])
      }

    } catch (error) {
      console.error('Error loading copy trading data:', error)
      toast({
        title: "Error",
        description: "Failed to load copy trading data",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const getTradeTypeColor = (type: string) => {
    switch (type) {
      case 'new_buy': return 'bg-green-500'
      case 'rebuy': return 'bg-blue-500'
      case 'sell': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getTradeTypeLabel = (type: string) => {
    switch (type) {
      case 'new_buy': return 'New Buy'
      case 'rebuy': return 'Re-buy'
      case 'sell': return 'Sell'
      default: return type
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const totalTrades = copyTrades.length
  const fantasyTrades = copyTrades.filter(t => t.is_fantasy)
  const realTrades = copyTrades.filter(t => !t.is_fantasy)
  const totalProfitLoss = copyTrades.reduce((sum, trade) => sum + (trade.profit_loss_usd || 0), 0)

  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-2xl font-bold">Copy Trading Dashboard</h2>
        <p className="text-muted-foreground">
          Track your copy trading performance and positions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-lg font-semibold">{user ? totalTrades : 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Fantasy Trades</p>
                <p className="text-lg font-semibold">{user ? fantasyTrades.length : 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Real Trades</p>
                <p className="text-lg font-semibold">{user ? realTrades.length : 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {totalProfitLoss >= 0 ? 
                <TrendingUp className="h-4 w-4 text-green-600" /> : 
                <TrendingDown className="h-4 w-4 text-red-600" />
              }
              <div>
                <p className="text-sm text-muted-foreground">Total P&L</p>
                <p className={`text-lg font-semibold ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {user ? formatCurrency(totalProfitLoss) : '$0.00'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trades" className="w-full">
        <TabsList>
          <TabsTrigger value="trades">Recent Trades</TabsTrigger>
          <TabsTrigger value="positions">Fantasy Positions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trades">
          <Card>
            <CardHeader>
              <CardTitle>Recent Copy Trades</CardTitle>
              <CardDescription>
                Your latest copy trading activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {user && copyTrades.map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${getTradeTypeColor(trade.trade_type)}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {trade.token_symbol || trade.token_name || 'Unknown Token'}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getTradeTypeLabel(trade.trade_type)}
                            </Badge>
                            {trade.is_fantasy && (
                              <Badge variant="secondary" className="text-xs">Fantasy</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatCurrency(trade.amount_usd)}
                            {trade.sell_percentage && ` (${trade.sell_percentage.toFixed(1)}%)`}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <Badge variant={trade.status === 'executed' ? 'default' : 'destructive'}>
                            {trade.status}
                          </Badge>
                          {trade.profit_loss_usd !== undefined && (
                            <span className={`text-sm font-medium ${
                              trade.profit_loss_usd >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {trade.profit_loss_usd >= 0 ? '+' : ''}{formatCurrency(trade.profit_loss_usd)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(trade.executed_at)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!user || copyTrades.length === 0) && (
                    <div className="text-center p-8 text-muted-foreground">
                      <Copy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{!user ? "Sign in to view your copy trades" : "No copy trades found."}</p>
                      <p className="text-sm">{!user ? "Authentication required to load your data." : "Configure copy trading to start automatically copying trades."}</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Fantasy Positions</CardTitle>
              <CardDescription>
                Your current fantasy trading positions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {user && fantasyPositions.map((position) => (
                  <div key={position.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">
                        {position.token_symbol || position.token_name || 'Unknown Token'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Balance: {position.balance.toLocaleString()} tokens
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Avg Price: {formatCurrency(position.average_buy_price)}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-medium">
                        {formatCurrency(position.current_value_usd || position.total_invested_usd)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Invested: {formatCurrency(position.total_invested_usd)}
                      </div>
                      <div className={`text-sm font-medium ${
                        position.profit_loss_usd >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {position.profit_loss_usd >= 0 ? '+' : ''}{formatCurrency(position.profit_loss_usd)}
                        {position.profit_loss_percentage !== 0 && 
                          ` (${position.profit_loss_percentage.toFixed(1)}%)`
                        }
                      </div>
                    </div>
                  </div>
                ))}

                {(!user || fantasyPositions.length === 0) && (
                  <div className="text-center p-8 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{!user ? "Sign in to view your fantasy positions" : "No fantasy positions found."}</p>
                    <p className="text-sm">{!user ? "Authentication required to load your data." : "Start copy trading in fantasy mode to build positions."}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}