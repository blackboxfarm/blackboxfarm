import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Clock, TrendingUp, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FeeEstimation {
  basic: {
    estimatedCostSOL: number;
    estimatedCostUSD: number;
    speed: 'slow' | 'medium' | 'fast';
    successProbability: number;
  };
  pro: {
    baseFee: number;
    priorityFee: number;
    computeUnits: number;
    computeUnitPrice: number;
    maxRetries: number;
    slippageTolerance: number;
    historicalAverage: number;
    networkCongestion: 'low' | 'medium' | 'high';
  };
}

interface GasFeeEstimatorProps {
  transactionType: 'swap' | 'transfer' | 'other';
  amount?: number;
  tokenMint?: string;
  onFeeSelect?: (fee: number, speed: string) => void;
}

export function GasFeeEstimator({ 
  transactionType, 
  amount, 
  tokenMint, 
  onFeeSelect 
}: GasFeeEstimatorProps) {
  const [estimation, setEstimation] = useState<FeeEstimation | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const { toast } = useToast();

  const fetchEstimation = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gas-fee-estimation', {
        body: { transactionType, amount, tokenMint }
      });

      if (error) throw error;
      setEstimation(data);
    } catch (error) {
      console.error('Gas fee estimation error:', error);
      toast({
        title: "Error",
        description: "Failed to estimate gas fees",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstimation();
  }, [transactionType, amount, tokenMint]);

  const getSpeedConfig = (speed: 'slow' | 'medium' | 'fast') => {
    if (!estimation) return null;
    
    const multiplier = speed === 'slow' ? 0.5 : speed === 'fast' ? 2 : 1;
    const fee = estimation.basic.estimatedCostSOL * multiplier;
    
    return {
      fee,
      feeUSD: fee * (estimation.basic.estimatedCostUSD / estimation.basic.estimatedCostSOL),
      time: speed === 'slow' ? '30-60s' : speed === 'fast' ? '5-15s' : '15-30s',
      success: speed === 'slow' ? 
        Math.max(estimation.basic.successProbability - 10, 60) :
        speed === 'fast' ? 
        Math.min(estimation.basic.successProbability + 10, 99) :
        estimation.basic.successProbability
    };
  };

  const handleSpeedSelect = (speed: 'slow' | 'medium' | 'fast') => {
    setSelectedSpeed(speed);
    const config = getSpeedConfig(speed);
    if (config && onFeeSelect) {
      onFeeSelect(config.fee, speed);
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 animate-pulse" />
          <span>Estimating gas fees...</span>
        </div>
      </Card>
    );
  }

  if (!estimation) return null;

  return (
    <Card className="p-4">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Quick</TabsTrigger>
          <TabsTrigger value="pro">Advanced</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4" />
            <span className="font-medium">Transaction Speed</span>
          </div>
          
          <div className="grid gap-2">
            {(['slow', 'medium', 'fast'] as const).map((speed) => {
              const config = getSpeedConfig(speed);
              if (!config) return null;
              
              return (
                <Button
                  key={speed}
                  variant={selectedSpeed === speed ? "default" : "outline"}
                  className="justify-between h-auto p-3"
                  onClick={() => handleSpeedSelect(speed)}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      speed === 'slow' ? 'secondary' : 
                      speed === 'fast' ? 'destructive' : 'default'
                    }>
                      {speed.charAt(0).toUpperCase() + speed.slice(1)}
                    </Badge>
                    <span>{config.time}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {config.fee.toFixed(6)} SOL
                    </div>
                    <div className="text-sm opacity-60">
                      ${config.feeUSD.toFixed(4)}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
          
          <div className="flex items-center gap-2 text-sm opacity-70">
            <TrendingUp className="w-3 h-3" />
            <span>
              {getSpeedConfig(selectedSpeed)?.success}% success probability
            </span>
          </div>
        </TabsContent>
        
        <TabsContent value="pro" className="space-y-4">
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span>Base Fee:</span>
              <span>{estimation.pro.baseFee.toFixed(6)} SOL</span>
            </div>
            <div className="flex justify-between">
              <span>Priority Fee:</span>
              <span>{estimation.pro.priorityFee.toFixed(6)} SOL</span>
            </div>
            <div className="flex justify-between">
              <span>Compute Units:</span>
              <span>{estimation.pro.computeUnits.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Compute Unit Price:</span>
              <span>{estimation.pro.computeUnitPrice} micro-lamports</span>
            </div>
            <div className="flex justify-between">
              <span>Max Retries:</span>
              <span>{estimation.pro.maxRetries}</span>
            </div>
            {estimation.pro.slippageTolerance > 0 && (
              <div className="flex justify-between">
                <span>Slippage Tolerance:</span>
                <span>{estimation.pro.slippageTolerance}%</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm">Network Congestion:</span>
            <Badge variant={
              estimation.pro.networkCongestion === 'low' ? 'default' :
              estimation.pro.networkCongestion === 'medium' ? 'secondary' : 'destructive'
            }>
              {estimation.pro.networkCongestion}
            </Badge>
          </div>
          
          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <Info className="w-4 h-4 mt-0.5 opacity-60" />
            <div className="text-sm opacity-70">
              Historical average: {estimation.pro.historicalAverage.toFixed(6)} SOL
              <br />
              Current fees are {
                estimation.pro.priorityFee > estimation.pro.historicalAverage ? 'higher' : 'lower'
              } than average
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}