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
    speed: 'economy' | 'standard' | 'priority';
    successProbability: number;
    batchAvailable: boolean;
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
  batch: {
    costPer100Operations: number;
    minimumOperations: number;
    effectiveCostPerOperation: number;
    recommendedForVolume: number;
  };
  competitive: {
    trojanFast: number;
    trojanTurbo: number;
    maestroFree: number;
    mevx: number;
    bananagun: number;
    ourAdvantage: string;
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
  const [selectedSpeed, setSelectedSpeed] = useState<'economy' | 'standard' | 'priority'>('standard');
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

  const getSpeedConfig = (speed: 'economy' | 'standard' | 'priority') => {
    if (!estimation) return null;
    
    // Use smart fee selection based on amount
    const isSmallTrade = (amount || 0) < 0.05;
    const baseMultiplier = speed === 'economy' ? 0.1 : speed === 'priority' ? 2 : 1;
    
    let fee: number;
    if (isSmallTrade && speed === 'economy') {
      fee = 0.0005; // Micro-trade optimized fee
    } else {
      fee = estimation.basic.estimatedCostSOL * baseMultiplier;
    }
    
    return {
      fee,
      feeUSD: fee * (estimation.basic.estimatedCostUSD / estimation.basic.estimatedCostSOL),
      time: speed === 'economy' ? '60-120s' : speed === 'priority' ? '5-15s' : '15-30s',
      success: speed === 'economy' ? 
        Math.max(estimation.basic.successProbability - 15, 60) :
        speed === 'priority' ? 
        Math.min(estimation.basic.successProbability + 15, 99) :
        estimation.basic.successProbability,
      batchRecommended: estimation.batch && estimation.batch.recommendedForVolume <= (amount || 0) * 100
    };
  };

  const handleSpeedSelect = (speed: 'economy' | 'standard' | 'priority') => {
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Smart Fees</TabsTrigger>
          <TabsTrigger value="batch">Batch Pricing</TabsTrigger>
          <TabsTrigger value="pro">Advanced</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4" />
            <span className="font-medium">Smart Fee Selection</span>
          </div>
          
          <div className="grid gap-2">
            {(['economy', 'standard', 'priority'] as const).map((speed) => {
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
                      speed === 'economy' ? 'secondary' : 
                      speed === 'priority' ? 'destructive' : 'default'
                    }>
                      {speed.charAt(0).toUpperCase() + speed.slice(1)}
                    </Badge>
                    <span>{config.time}</span>
                    {config.batchRecommended && (
                      <Badge variant="outline" className="text-xs">Batch Available</Badge>
                    )}
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

        <TabsContent value="batch" className="space-y-4">
          {estimation.batch && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-primary">Batch Pricing</Badge>
                <span className="text-sm">Smithii Model</span>
              </div>
              
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <span>Cost per 100 operations:</span>
                  <span className="font-medium">{estimation.batch.costPer100Operations} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>Minimum operations:</span>
                  <span>{estimation.batch.minimumOperations}</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective cost per operation:</span>
                  <span className="text-green-600">{estimation.batch.effectiveCostPerOperation.toFixed(6)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>Recommended for volume ≥:</span>
                  <span>{estimation.batch.recommendedForVolume} operations</span>
                </div>
              </div>
              
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>90%+ savings</strong> on large volume operations vs traditional per-transaction pricing
                </p>
              </div>
            </div>
          )}
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