import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PricePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TokenPriceChartProps {
  tokenAddress: string;
  className?: string;
}

export function TokenPriceChart({ tokenAddress, className }: TokenPriceChartProps) {
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [timeRange, setTimeRange] = useState<'1h' | '4h' | '12h' | '24h'>('4h');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (tokenAddress) {
      fetchRealPriceData();
    }
  }, [tokenAddress, timeRange]);

  const fetchRealPriceData = async () => {
    setIsLoading(true);
    
    try {
      console.log('Fetching real price data for token:', tokenAddress);
      
      const { data, error } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMint: tokenAddress }
      });
      
      if (error) throw error;
      
      if (data.success && data.historicalPrices) {
        console.log('Received real historical prices:', data.historicalPrices.length, 'data points');
        
        // Filter data based on time range
        const now = Date.now();
        const timeRangeMs = {
          '1h': 60 * 60 * 1000,
          '4h': 4 * 60 * 60 * 1000,
          '12h': 12 * 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000
        }[timeRange];
        
        const filteredData = data.historicalPrices
          .filter((point: any) => point.timestamp >= (now - timeRangeMs))
          .map((point: any) => ({
            timestamp: point.timestamp,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close,
            volume: point.volume
          }));
        
        setPriceData(filteredData);
        console.log('Set real price data:', filteredData.length, 'points for', timeRange);
      } else {
        console.error('No historical price data received from token-metadata function');
        setPriceData([]);
      }
    } catch (error: any) {
      console.error('Error fetching real price data:', error);
      setPriceData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (value: number) => `$${value.toFixed(8)}`;
  
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatVolume = (value: number) => {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(0);
  };

  const priceChange = priceData.length > 1 ? 
    ((priceData[priceData.length - 1].close - priceData[0].open) / priceData[0].open) * 100 : 0;

  const timeRangeOptions = [
    { value: '1h' as const, label: '1H' },
    { value: '4h' as const, label: '4H' },
    { value: '12h' as const, label: '12H' },
    { value: '24h' as const, label: '24H' }
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>Price Chart</CardTitle>
            {priceData.length > 0 && (
              <div className={`flex items-center gap-1 text-sm ${
                priceChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {timeRangeOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={timeRange === option.value ? "default" : "outline"}
                onClick={() => setTimeRange(option.value)}
                className="px-3 py-1 h-8"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="animate-pulse bg-muted h-4 w-32 rounded mb-2 mx-auto"></div>
              <p>Loading chart data...</p>
            </div>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={priceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis 
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  yAxisId="price"
                  orientation="right"
                  tickFormatter={formatPrice}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  domain={['dataMin * 0.995', 'dataMax * 1.005']}
                />
                <YAxis 
                  yAxisId="volume"
                  orientation="left"
                  tickFormatter={formatVolume}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  domain={[0, 'dataMax * 1.2']}
                />
                <Tooltip 
                  labelFormatter={(value) => formatTime(Number(value))}
                  formatter={(value: number, name: string) => [
                    name === 'close' ? formatPrice(value) : formatVolume(value),
                    name === 'close' ? 'Price' : 'Volume'
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                
                {/* Volume bars at bottom */}
                <Bar 
                  yAxisId="volume"
                  dataKey="volume" 
                  fill="hsl(var(--muted-foreground))"
                  opacity={0.3}
                  name="Volume"
                />
                
                {/* Price line */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  dot={false}
                  name="Price"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {/* Chart Statistics */}
        {priceData.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">High</p>
              <p className="font-semibold">
                {formatPrice(Math.max(...priceData.map(p => p.high)))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Low</p>
              <p className="font-semibold">
                {formatPrice(Math.min(...priceData.map(p => p.low)))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Avg Volume</p>
              <p className="font-semibold">
                {formatVolume(priceData.reduce((sum, p) => sum + p.volume, 0) / priceData.length)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}