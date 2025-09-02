import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PricePoint {
  timestamp: number;
  price: number;
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
            price: point.price,
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

  const formatPrice = (value: number) => `$${value.toFixed(6)}`;
  
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
    ((priceData[priceData.length - 1].price - priceData[0].price) / priceData[0].price) * 100 : 0;

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
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  tickFormatter={formatPrice}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                  domain={['dataMin * 0.995', 'dataMax * 1.005']}
                />
                <Tooltip 
                  labelFormatter={(value) => formatTime(Number(value))}
                  formatter={(value: number, name: string) => [
                    name === 'price' ? formatPrice(value) : formatVolume(value),
                    name === 'price' ? 'Price' : 'Volume'
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {/* Chart Statistics */}
        {priceData.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">High</p>
              <p className="font-semibold">
                {formatPrice(Math.max(...priceData.map(p => p.price)))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Low</p>
              <p className="font-semibold">
                {formatPrice(Math.min(...priceData.map(p => p.price)))}
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