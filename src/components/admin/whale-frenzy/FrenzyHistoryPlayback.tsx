import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { History, Play, Eye } from 'lucide-react';
import { WhaleBubbleMap } from './WhaleBubbleMap';

interface FrenzyEvent {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  detected_at: string;
  whale_count: number;
  participating_wallets: string[];
  buy_timeline: Array<{
    wallet_address: string;
    nickname?: string;
    timestamp: string;
    amount_sol?: number;
  }>;
  auto_buy_executed: boolean;
  auto_buy_amount_sol: number | null;
  entry_token_price: number | null;
}

interface FrenzyHistoryPlaybackProps {
  userId: string;
}

export function FrenzyHistoryPlayback({ userId }: FrenzyHistoryPlaybackProps) {
  const [events, setEvents] = useState<FrenzyEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<FrenzyEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [userId]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('whale_frenzy_events')
        .select('*')
        .eq('user_id', userId)
        .order('detected_at', { ascending: false })
        .limit(50);

      const formattedEvents: FrenzyEvent[] = (data || []).map(e => ({
        id: e.id,
        token_mint: e.token_mint,
        token_symbol: e.token_symbol,
        detected_at: e.detected_at,
        whale_count: e.whale_count,
        participating_wallets: Array.isArray(e.participating_wallets) 
          ? (e.participating_wallets as unknown as string[])
          : [],
        buy_timeline: Array.isArray(e.buy_timeline) 
          ? (e.buy_timeline as unknown as FrenzyEvent['buy_timeline'])
          : [],
        auto_buy_executed: e.auto_buy_executed,
        auto_buy_amount_sol: e.auto_buy_amount_sol,
        entry_token_price: e.entry_token_price
      }));

      setEvents(formattedEvents);
      if (formattedEvents.length > 0) {
        setSelectedEvent(formattedEvents[0]);
      }
    } catch (error) {
      console.error('Error loading frenzy events:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardContent className="py-12 text-center">
          <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No Frenzy History</h3>
          <p className="text-sm text-muted-foreground">
            Once frenzies are detected, you can replay them here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Event Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Historical Frenzy Playback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select
                value={selectedEvent?.id}
                onValueChange={(id) => {
                  const event = events.find(e => e.id === id);
                  setSelectedEvent(event || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a frenzy to replay" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {event.token_symbol || event.token_mint.slice(0, 8)}...
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {event.whale_count} whales
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {format(new Date(event.detected_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Event Details */}
      {selectedEvent && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bubble Map Playback */}
          <WhaleBubbleMap
            tokenMint={selectedEvent.token_mint}
            tokenSymbol={selectedEvent.token_symbol || undefined}
            buyTimeline={selectedEvent.buy_timeline.length > 0 
              ? selectedEvent.buy_timeline 
              : selectedEvent.participating_wallets.map((w, i) => ({
                  wallet_address: w,
                  timestamp: new Date(
                    new Date(selectedEvent.detected_at).getTime() - 
                    (selectedEvent.participating_wallets.length - i) * 10000
                  ).toISOString()
                }))
            }
            frenzyDetectedAt={selectedEvent.detected_at}
            whaleCount={selectedEvent.whale_count}
          />

          {/* Event Details */}
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Frenzy Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Token</p>
                  <p className="font-medium">
                    {selectedEvent.token_symbol || selectedEvent.token_mint.slice(0, 12)}...
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Detected At</p>
                  <p className="font-medium">
                    {format(new Date(selectedEvent.detected_at), 'MMM d, yyyy HH:mm:ss')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Whale Count</p>
                  <p className="font-medium text-2xl">{selectedEvent.whale_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entry Price</p>
                  <p className="font-mono">
                    {selectedEvent.entry_token_price 
                      ? `${selectedEvent.entry_token_price.toFixed(8)} SOL`
                      : 'N/A'
                    }
                  </p>
                </div>
              </div>

              {/* Auto-buy info */}
              {selectedEvent.auto_buy_executed && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-green-500 font-medium">
                    <Play className="h-4 w-4" />
                    Auto-Buy Executed
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bought {selectedEvent.auto_buy_amount_sol} SOL worth at detection
                  </p>
                </div>
              )}

              {/* Participating wallets */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Participating Whales</p>
                <div className="space-y-1 max-h-[200px] overflow-auto">
                  {selectedEvent.participating_wallets.map((wallet, i) => (
                    <div 
                      key={wallet} 
                      className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded"
                    >
                      <span className="text-lg">🐋</span>
                      <span className="font-mono text-xs">
                        {wallet.slice(0, 8)}...{wallet.slice(-6)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
