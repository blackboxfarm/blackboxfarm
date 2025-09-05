import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Plus, Settings, AlertTriangle, DollarSign, BarChart3, TrendingUp, Info, Eye, EyeOff, Edit, Shuffle, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface WalletData {
  id: string;
  pubkey: string;
  sol_balance: number;
  is_active: boolean;
}

interface Campaign {
  id: string;
  nickname: string;
  token_address: string;
}

interface CommandCode {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  created_at: string;
}

interface CommandStats {
  baseFee: number;
  totalTrades: { buy: number; sell: number };
  gasFeesTotal: number;
  gasFeeAverage: number;
  ourFeesTotal: number;
  ourFeeAverage: number;
}

interface CommandStats {
  baseFee: number;
  totalTrades: { buy: number; sell: number };
  gasFeesTotal: number;
  gasFeeAverage: number;
  ourFeesTotal: number;
  ourFeeAverage: number;
}

interface DurationEstimate {
  maxDurationHours: number;
  totalCostPerCycle: number;
  cyclesUntilEmpty: number;
  isInfinite: boolean;
  volumeGenerated: number;
}

interface WalletCommandsProps {
  wallet: WalletData;
  campaign: Campaign;
  isDevMode?: boolean;
  devBalance?: number;
}

export function WalletCommands({ wallet, campaign, isDevMode = false, devBalance }: WalletCommandsProps) {
  const [commands, setCommands] = useState<CommandCode[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCommand, setEditingCommand] = useState<CommandCode | null>(null);
  const [mode, setMode] = useState<"simple" | "complex">("simple");
  const [commandStats, setCommandStats] = useState<Record<string, CommandStats>>({});
  const [showSimulation, setShowSimulation] = useState<string | null>(null);
  const [simulationHours, setSimulationHours] = useState([24]);
  const [showWalletAlert, setShowWalletAlert] = useState(!isDevMode);
  const [showTradingCosts, setShowTradingCosts] = useState(false);
  const [activeIntervals, setActiveIntervals] = useState<Record<string, NodeJS.Timeout>>({});
  const [simulatedTrades, setSimulatedTrades] = useState<Record<string, Array<{type: 'buy' | 'sell', amount: number, timestamp: Date}>>>({});
  const [useUSD, setUseUSD] = useState(false);
  const [previousCommand, setPreviousCommand] = useState<any>(null);
  const [mockFunds, setMockFunds] = useState("1.0");
  const [useMockFunds, setUseMockFunds] = useState(false);
  const [buyAmountUnit, setBuyAmountUnit] = useState<'USD' | 'SOL'>('USD');
  const [newCommand, setNewCommand] = useState({
    name: "",
    mode: "simple",
    // Simple mode
    buyAmount: "0.01",
    sellPercent: "100",
    buyInterval: "30",
    sellInterval: "600",
    duration: "3600",
    // Complex mode
    buyAmountMin: "0.005",
    buyAmountMax: "0.02",
    buyIntervalMin: "10",
    buyIntervalMax: "60",
    sellPercentMin: "80",
    sellPercentMax: "100",
    sellIntervalMin: "300",
    sellIntervalMax: "900"
  });

  useEffect(() => {
    loadCommands();
    loadCommandStats();
    setShowWalletAlert(!isDevMode); // Hide alert in dev mode
    
    // Set up real-time subscriptions for command changes
    const commandChannel = supabase
      .channel('command-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'blackbox_command_codes',
        filter: `wallet_id=eq.${wallet.id}`
      }, () => {
        loadCommands();
        loadCommandStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(commandChannel);
    };
  }, [wallet.id, isDevMode]);

  // Setup simulation intervals for active commands in dev mode
  useEffect(() => {
    if (!isDevMode) {
      // Clean up all intervals if not in dev mode
      Object.values(activeIntervals).forEach(clearInterval);
      setActiveIntervals({});
      return;
    }

    // Setup intervals for active commands
    commands.forEach(command => {
      if (command.is_active && !activeIntervals[command.id]) {
        const config = command.config;
        const buyInterval = config.type === "simple" 
          ? config.buyInterval || 60 
          : Math.random() * ((config.buyInterval?.max || 60) - (config.buyInterval?.min || 30)) + (config.buyInterval?.min || 30);
        
        const sellInterval = config.type === "simple" 
          ? config.sellInterval || 600 
          : Math.random() * ((config.sellInterval?.max || 900) - (config.sellInterval?.min || 300)) + (config.sellInterval?.min || 300);

        // Create buy interval
        const buyIntervalId = setInterval(() => {
          if (isDevMode && devBalance && devBalance > 0) {
            simulateExecute(command.id, 'buy');
          }
        }, buyInterval * 1000);

        // Create sell interval  
        const sellIntervalId = setInterval(() => {
          if (isDevMode && devBalance && devBalance > 0) {
            simulateExecute(command.id, 'sell');
          }
        }, sellInterval * 1000);

        setActiveIntervals(prev => ({
          ...prev,
          [command.id]: buyIntervalId,
          [`${command.id}_sell`]: sellIntervalId
        }));
      }
    });

    // Clean up intervals for inactive commands
    Object.keys(activeIntervals).forEach(intervalId => {
      const commandId = intervalId.replace('_sell', '');
      const command = commands.find(c => c.id === commandId);
      if (!command || !command.is_active) {
        clearInterval(activeIntervals[intervalId]);
        setActiveIntervals(prev => {
          const newIntervals = {...prev};
          delete newIntervals[intervalId];
          return newIntervals;
        });
      }
    });

    return () => {
      // Cleanup on unmount
      Object.values(activeIntervals).forEach(clearInterval);
    };
  }, [commands, isDevMode, devBalance]);

  const loadCommands = async () => {
    const { data, error } = await supabase
      .from('blackbox_command_codes')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error loading commands", description: error.message });
      return;
    }

    setCommands(data || []);
  };

  const loadCommandStats = async () => {
    // Load transaction stats for each command
    const { data: transactions, error } = await supabase
      .from('blackbox_transactions')
      .select('command_code_id, transaction_type, amount_sol, gas_fee, service_fee')
      .eq('wallet_id', wallet.id);

    if (error) {
      console.error("Error loading transaction stats:", error);
      return;
    }

    const stats: Record<string, CommandStats> = {};
    
    transactions?.forEach(tx => {
      if (!tx.command_code_id) return;
      
      if (!stats[tx.command_code_id]) {
        stats[tx.command_code_id] = {
          baseFee: 0.001, // Base fee constant
          totalTrades: { buy: 0, sell: 0 },
          gasFeesTotal: 0,
          gasFeeAverage: 0,
          ourFeesTotal: 0,
          ourFeeAverage: 0
        };
      }

      const commandStats = stats[tx.command_code_id];
      
      if (tx.transaction_type === 'buy') {
        commandStats.totalTrades.buy++;
      } else if (tx.transaction_type === 'sell') {
        commandStats.totalTrades.sell++;
      }
      
      commandStats.gasFeesTotal += Number(tx.gas_fee || 0);
      commandStats.ourFeesTotal += Number(tx.service_fee || 0);
    });

    // Calculate averages
    Object.keys(stats).forEach(commandId => {
      const commandStats = stats[commandId];
      const totalTrades = commandStats.totalTrades.buy + commandStats.totalTrades.sell;
      
      if (totalTrades > 0) {
        commandStats.gasFeeAverage = commandStats.gasFeesTotal / totalTrades;
        commandStats.ourFeeAverage = commandStats.ourFeesTotal / totalTrades;
      }
    });

    setCommandStats(stats);
  };

  const calculateSimulationStats = (command: CommandCode, hours: number) => {
    const config = command.config;
    let estimatedTrades = 0;
    
    if (config.type === "simple") {
      const buyInterval = config.buyInterval || 60;
      const sellInterval = config.sellInterval || 600;
      const tradesPerHour = (3600 / buyInterval) + (3600 / sellInterval);
      estimatedTrades = Math.floor(tradesPerHour * hours);
    } else {
      const avgBuyInterval = ((config.buyInterval?.min || 30) + (config.buyInterval?.max || 90)) / 2;
      const avgSellInterval = ((config.sellInterval?.min || 300) + (config.sellInterval?.max || 900)) / 2;
      const tradesPerHour = (3600 / avgBuyInterval) + (3600 / avgSellInterval);
      estimatedTrades = Math.floor(tradesPerHour * hours);
    }

    // Use realistic fee structure based on volume
    const isHighVolume = estimatedTrades >= 50;
    let gasFees: number, ourFees: number, baseFee: number;
    
    if (isHighVolume) {
      // Batch pricing model (Smithii-style)
      const batchesNeeded = Math.ceil(estimatedTrades / 100);
      gasFees = batchesNeeded * 0.025; // 0.025 SOL per 100 operations
      ourFees = 0; // No additional service fees for batch mode
      baseFee = 0;
    } else {
      // Per-transaction pricing for smaller volumes
      const feePerTx = 0.0005; // Reduced micro-trade fee
      gasFees = estimatedTrades * feePerTx;
      ourFees = estimatedTrades * 0.0001; // Minimal service fee
      baseFee = 0.001;
    }

    return {
      trades: estimatedTrades,
      gasFees,
      ourFees,
      baseFee,
      totalCost: baseFee + gasFees + ourFees,
      pricing: isHighVolume ? 'batch' : 'per_transaction'
    };
  };

  const createCommand = async () => {
    if (!newCommand.name) {
      toast({ title: "Missing name", description: "Please enter a command name" });
      return;
    }

    const config = mode === "simple" ? {
      type: "simple",
      buyAmount: parseFloat(newCommand.buyAmount),
      sellPercent: parseFloat(newCommand.sellPercent),
      buyInterval: parseInt(newCommand.buyInterval),
      sellInterval: parseInt(newCommand.sellInterval),
      duration: parseInt(newCommand.duration)
    } : {
      type: "complex",
      buyAmount: {
        min: parseFloat(newCommand.buyAmountMin),
        max: parseFloat(newCommand.buyAmountMax)
      },
      buyInterval: {
        min: parseInt(newCommand.buyIntervalMin),
        max: parseInt(newCommand.buyIntervalMax)
      },
      sellPercent: {
        min: parseFloat(newCommand.sellPercentMin),
        max: parseFloat(newCommand.sellPercentMax)
      },
      sellInterval: {
        min: parseInt(newCommand.sellIntervalMin),
        max: parseInt(newCommand.sellIntervalMax)
      }
    };

    const { error } = await supabase
      .from('blackbox_command_codes')
      .insert({
        wallet_id: wallet.id,
        name: newCommand.name,
        config: config
      });

    if (error) {
      toast({ title: "Error creating command", description: error.message });
      return;
    }

    toast({ title: "Command created", description: `${newCommand.name} is ready` });
    resetForm();
    loadCommands();
  };

  const simulateExecute = (commandId: string, action: 'buy' | 'sell') => {
    const command = commands.find(c => c.id === commandId);
    if (!command || !isDevMode) return;

    const config = command.config;
    let amount: number;

    if (action === 'buy') {
      amount = config.type === "simple" 
        ? config.buyAmount 
        : Math.random() * (config.buyAmount.max - config.buyAmount.min) + config.buyAmount.min;
    } else {
      const sellPercent = config.type === "simple" 
        ? config.sellPercent 
        : Math.random() * (config.sellPercent.max - config.sellPercent.min) + config.sellPercent.min;
      amount = ((devBalance || 0) * sellPercent) / 100;
    }

    // Add simulated trade to history
    setSimulatedTrades(prev => ({
      ...prev,
      [commandId]: [
        ...(prev[commandId] || []),
        { type: action, amount, timestamp: new Date() }
      ].slice(-10) // Keep only last 10 trades per command
    }));

    // Update command stats
    setCommandStats(prev => {
      const commandStats = prev[commandId] || {
        baseFee: 0.001,
        totalTrades: { buy: 0, sell: 0 },
        gasFeesTotal: 0,
        gasFeeAverage: 0,
        ourFeesTotal: 0,
        ourFeeAverage: 0
      };

      const newStats = { ...commandStats };
      if (action === 'buy') {
        newStats.totalTrades.buy++;
      } else {
        newStats.totalTrades.sell++;
      }

      const gasFee = 0.002; // Simulated gas fee
      const serviceFee = 0.001; // Simulated service fee
      newStats.gasFeesTotal += gasFee;
      newStats.ourFeesTotal += serviceFee;

      const totalTrades = newStats.totalTrades.buy + newStats.totalTrades.sell;
      if (totalTrades > 0) {
        newStats.gasFeeAverage = newStats.gasFeesTotal / totalTrades;
        newStats.ourFeeAverage = newStats.ourFeesTotal / totalTrades;
      }

      return { ...prev, [commandId]: newStats };
    });

    // Show toast notification for simulated trade
    toast({
      title: `Simulated ${action.toUpperCase()}`,
      description: `${command.name}: ${amount.toFixed(4)} SOL`,
    });
  };

  const resetForm = () => {
    setShowCreateForm(false);
    setEditingCommand(null);
    setPreviousCommand(null);
    setNewCommand({
      name: "",
      mode: "simple",
      buyAmount: "0.01",
      sellPercent: "100",
      buyInterval: "30",
      sellInterval: "600",
      duration: "3600",
      buyAmountMin: "0.005",
      buyAmountMax: "0.02",
      buyIntervalMin: "10",
      buyIntervalMax: "60",
      sellPercentMin: "80",
      sellPercentMax: "100",
      sellIntervalMin: "300",
      sellIntervalMax: "900"
    });
  };

  const randomizeCommand = () => {
    // Save current state for "back to previous"
    setPreviousCommand({ ...newCommand });

    if (mode === "simple") {
      // Convert simple values to ranges
      const buyAmount = parseFloat(newCommand.buyAmount);
      const buyInterval = parseInt(newCommand.buyInterval);
      const sellInterval = parseInt(newCommand.sellInterval);
      
      setMode("complex");
      setNewCommand(prev => ({
        ...prev,
        mode: "complex",
        buyAmountMin: String((buyAmount * 0.5).toFixed(3)),
        buyAmountMax: String((buyAmount * 3).toFixed(3)),
        buyIntervalMin: String(Math.max(1, Math.floor(buyInterval * 0.2))),
        buyIntervalMax: String(Math.floor(buyInterval * 6)),
        sellPercentMin: String(Math.max(20, parseInt(newCommand.sellPercent) * 0.4)),
        sellPercentMax: newCommand.sellPercent,
        sellIntervalMin: String(Math.max(30, Math.floor(sellInterval * 0.33))),
        sellIntervalMax: String(Math.floor(sellInterval * 2))
      }));
    } else {
      // Already complex, just randomize within existing ranges or expand them
      const currentBuyMin = parseFloat(newCommand.buyAmountMin);
      const currentBuyMax = parseFloat(newCommand.buyAmountMax);
      const avgBuy = (currentBuyMin + currentBuyMax) / 2;
      
      setNewCommand(prev => ({
        ...prev,
        buyAmountMin: String((avgBuy * 0.3).toFixed(3)),
        buyAmountMax: String((avgBuy * 4).toFixed(3)),
        buyIntervalMin: String(Math.max(1, Math.floor(parseInt(prev.buyIntervalMin) * 0.5))),
        buyIntervalMax: String(Math.floor(parseInt(prev.buyIntervalMax) * 2)),
        sellPercentMin: String(Math.max(20, parseInt(prev.sellPercentMin) * 0.7)),
        sellPercentMax: "100",
        sellIntervalMin: String(Math.max(30, Math.floor(parseInt(prev.sellIntervalMin) * 0.5))),
        sellIntervalMax: String(Math.floor(parseInt(prev.sellIntervalMax) * 1.5))
      }));
    }

    toast({
      title: "Command Randomized",
      description: "Values converted to ranges. Use 'Back to Previous' to restore original settings."
    });
  };

  const restorePrevious = () => {
    if (previousCommand) {
      setNewCommand(previousCommand);
      setMode(previousCommand.mode || "simple");
      setPreviousCommand(null);
      toast({
        title: "Restored Previous Settings",
        description: "Command values have been restored to before randomization."
      });
    }
  };

  const convertToUSD = (solAmount: string) => {
    // Assuming 1 SOL = $200 (this should come from real-time price)
    const SOL_PRICE = 200;
    return (parseFloat(solAmount) * SOL_PRICE).toFixed(2);
  };

  const convertToSOL = (usdAmount: string) => {
    const SOL_PRICE = 200;
    return (parseFloat(usdAmount) / SOL_PRICE).toFixed(3);
  };

  const formatVolumeUSD = (solAmount: number) => {
    const SOL_PRICE = 200;
    const usdValue = solAmount * SOL_PRICE;
    
    if (usdValue >= 1000000) {
      return `$${(usdValue / 1000000).toFixed(1)}M`;
    } else if (usdValue >= 1000) {
      return `$${(usdValue / 1000).toFixed(1)}K`;
    } else {
      return `$${usdValue.toFixed(0)}`;
    }
  };

  const calculateBlackBoxIncome = (estimate: DurationEstimate) => {
    // BlackBox fee: 0.5% of each trade volume
    const BLACKBOX_FEE_RATE = 0.005;
    const income = estimate.volumeGenerated * BLACKBOX_FEE_RATE;
    return income;
  };

  const calculateDurationEstimate = (config: any): DurationEstimate => {
    const effectiveBalance = useMockFunds ? parseFloat(mockFunds) : (isDevMode ? (devBalance || 0) : wallet.sol_balance);
    
    if (effectiveBalance <= 0) {
      return { maxDurationHours: 0, totalCostPerCycle: 0, cyclesUntilEmpty: 0, isInfinite: false, volumeGenerated: 0 };
    }

    let avgBuyAmount = 0;
    let avgBuyInterval = 0;
    let avgSellPercent = 0;
    let avgSellInterval = 0;

    if (config.type === "simple") {
      avgBuyAmount = config.buyAmount || 0.01;
      avgBuyInterval = config.buyInterval || 30;
      avgSellPercent = config.sellPercent || 100;
      avgSellInterval = config.sellInterval || 600;
    } else {
      avgBuyAmount = ((config.buyAmount?.min || 0.005) + (config.buyAmount?.max || 0.02)) / 2;
      avgBuyInterval = ((config.buyInterval?.min || 10) + (config.buyInterval?.max || 60)) / 2;
      avgSellPercent = ((config.sellPercent?.min || 80) + (config.sellPercent?.max || 100)) / 2;
      avgSellInterval = ((config.sellInterval?.min || 300) + (config.sellInterval?.max || 900)) / 2;
    }

    // Calculate cost per cycle (one buy + one sell)
    const gasFeesPerTrade = 0.002; // Estimated gas fees
    const serviceFeesPerTrade = 0.001; // Our service fees
    const costPerBuy = avgBuyAmount + gasFeesPerTrade + serviceFeesPerTrade;
    
    // Sell essentially just costs gas + service fees since we're selling tokens back for SOL
    const costPerSell = gasFeesPerTrade + serviceFeesPerTrade;
    
    // Net cost per cycle (considering we get some SOL back from selling)
    const netCostPerCycle = costPerBuy + costPerSell - (avgBuyAmount * avgSellPercent / 100);
    
    // If sell percentage is 100%, we're essentially just paying fees
    const isInfinite = avgSellPercent >= 100 && netCostPerCycle <= 0;
    
    if (isInfinite) {
      return { 
        maxDurationHours: Infinity, 
        totalCostPerCycle: costPerBuy + costPerSell, 
        cyclesUntilEmpty: Infinity, 
        isInfinite: true,
        volumeGenerated: Infinity
      };
    }

    const cyclesUntilEmpty = Math.floor(effectiveBalance / Math.abs(netCostPerCycle));
    const cycleTimeSeconds = avgBuyInterval + avgSellInterval;
    const maxDurationHours = (cyclesUntilEmpty * cycleTimeSeconds) / 3600;

    // Calculate volume generated
    // Each cycle: buy amount + sell amount (tokens sold back for SOL)
    const volumePerCycle = avgBuyAmount + (avgBuyAmount * avgSellPercent / 100);
    const totalVolumeGenerated = cyclesUntilEmpty * volumePerCycle;

    return {
      maxDurationHours,
      totalCostPerCycle: Math.abs(netCostPerCycle),
      cyclesUntilEmpty,
      isInfinite: false,
      volumeGenerated: totalVolumeGenerated
    };
  };

  const startEditing = (command: CommandCode) => {
    setEditingCommand(command);
    setShowCreateForm(true);
    
    const config = command.config;
    if (config.type === "simple") {
      setMode("simple");
      setNewCommand({
        name: command.name,
        mode: "simple",
        buyAmount: String(config.buyAmount || 0.01),
        sellPercent: String(config.sellPercent || 100),
        buyInterval: String(config.buyInterval || 30),
        sellInterval: String(config.sellInterval || 600),
        duration: String(config.duration || 3600),
        buyAmountMin: "0.005",
        buyAmountMax: "0.02",
        buyIntervalMin: "10",
        buyIntervalMax: "60",
        sellPercentMin: "80",
        sellPercentMax: "100",
        sellIntervalMin: "300",
        sellIntervalMax: "900"
      });
    } else {
      setMode("complex");
      setNewCommand({
        name: command.name,
        mode: "complex",
        buyAmount: "0.01",
        sellPercent: "100",
        buyInterval: "30",
        sellInterval: "600",
        duration: "3600",
        buyAmountMin: String(config.buyAmount?.min || 0.005),
        buyAmountMax: String(config.buyAmount?.max || 0.02),
        buyIntervalMin: String(config.buyInterval?.min || 10),
        buyIntervalMax: String(config.buyInterval?.max || 60),
        sellPercentMin: String(config.sellPercent?.min || 80),
        sellPercentMax: String(config.sellPercent?.max || 100),
        sellIntervalMin: String(config.sellInterval?.min || 300),
        sellIntervalMax: String(config.sellInterval?.max || 900)
      });
    }
  };

  const updateCommand = async () => {
    if (!editingCommand || !newCommand.name) {
      toast({ title: "Missing name", description: "Please enter a command name" });
      return;
    }

    const config = mode === "simple" ? {
      type: "simple",
      buyAmount: parseFloat(newCommand.buyAmount),
      sellPercent: parseFloat(newCommand.sellPercent),
      buyInterval: parseInt(newCommand.buyInterval),
      sellInterval: parseInt(newCommand.sellInterval),
      duration: parseInt(newCommand.duration)
    } : {
      type: "complex",
      buyAmount: {
        min: parseFloat(newCommand.buyAmountMin),
        max: parseFloat(newCommand.buyAmountMax)
      },
      buyInterval: {
        min: parseInt(newCommand.buyIntervalMin),
        max: parseInt(newCommand.buyIntervalMax)
      },
      sellPercent: {
        min: parseFloat(newCommand.sellPercentMin),
        max: parseFloat(newCommand.sellPercentMax)
      },
      sellInterval: {
        min: parseInt(newCommand.sellIntervalMin),
        max: parseInt(newCommand.sellIntervalMax)
      }
    };

    const { error } = await supabase
      .from('blackbox_command_codes')
      .update({
        name: newCommand.name,
        config: config
      })
      .eq('id', editingCommand.id);

    if (error) {
      toast({ title: "Error updating command", description: error.message });
      return;
    }

    toast({ title: "Command updated", description: `${newCommand.name} has been updated` });
    resetForm();
    loadCommands();
  };

  const toggleCommand = async (command: CommandCode) => {
    // Get effective balance (dev mode uses simulated balance)
    const effectiveBalance = isDevMode ? (devBalance || 0) : wallet.sol_balance;
    
    // Check wallet balance before activating
    if (!command.is_active && effectiveBalance <= 0) {
      toast({ 
        title: "Insufficient Funds", 
        description: isDevMode 
          ? "Enable dev mode and add fake funds to test commands."
          : "This wallet has 0 SOL balance. Transfer funds before activating commands.",
        variant: "destructive"
      });
      return;
    }

    const { error } = await supabase
      .from('blackbox_command_codes')
      .update({ is_active: !command.is_active })
      .eq('id', command.id);

    if (error) {
      toast({ title: "Error updating command", description: error.message });
      return;
    }

    toast({ 
      title: command.is_active ? "Command disabled" : "Command enabled", 
      description: `${command.name} is now ${command.is_active ? "disabled" : "enabled"}` 
    });
    loadCommands();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowWalletAlert(!showWalletAlert)}
              className="p-1 h-6 w-6"
            >
              {showWalletAlert ? (
                <Eye className="h-3 w-3 text-destructive" />
              ) : (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowTradingCosts(!showTradingCosts)}
              className="p-1 h-6 w-6"
            >
              {showTradingCosts ? (
                <Eye className="h-3 w-3 text-primary" />
              ) : (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
            <CardTitle>
              Wallet Commands - {wallet.pubkey.slice(0, 8)}...{wallet.pubkey.slice(-6)}
            </CardTitle>
          </div>
          <Button onClick={() => setShowCreateForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Command
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Wallet Balance Warning */}
        {showWalletAlert && wallet.sol_balance <= 0 && !isDevMode && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">⚠️ No Funds in Wallet</p>
                <p>This wallet has 0 SOL balance. Transfer funds to enable trading:</p>
                <div className="p-2 bg-muted rounded font-mono text-xs">
                  {wallet.pubkey}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Low Balance Warning */}
        {showWalletAlert && wallet.sol_balance > 0 && wallet.sol_balance < 0.01 && !isDevMode && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">⚠️ Low Balance</p>
              <p>Current balance: {wallet.sol_balance.toFixed(4)} SOL. Consider adding more funds for sustained trading.</p>
            </AlertDescription>
          </Alert>
        )}

        {/* Cost Estimation for Active Commands */}
        {showTradingCosts && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">💰 Trading Costs</p>
                <p>Active commands will incur small fees per trade execution</p>
                <p className="text-xs text-muted-foreground">
                  Smart pricing: Batch mode for 50+ operations, micro-fees for small trades
                </p>
                <p className="text-xs text-muted-foreground">
                  Batch: 0.025 SOL per 100 ops | Individual: 0.0005 SOL per trade
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {/* Commands List */}
        {commands.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium">Active Commands</h3>
            {commands.map((command) => {
              const stats = commandStats[command.id] || {
                baseFee: 0.001,
                totalTrades: { buy: 0, sell: 0 },
                gasFeesTotal: 0,
                gasFeeAverage: 0,
                ourFeesTotal: 0,
                ourFeeAverage: 0
              };
              const totalTrades = stats.totalTrades.buy + stats.totalTrades.sell;
              const simulationData = showSimulation === command.id ? calculateSimulationStats(command, simulationHours[0]) : null;

              return (
                <div key={command.id} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{command.name}</h4>
                        <Badge variant={command.is_active ? "default" : "secondary"}>
                          {command.is_active ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline">
                          {command.config.type || "simple"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {command.config.type === "simple" 
                          ? `Buy ${command.config.buyAmount} SOL every ${command.config.buyInterval}s, sell ${command.config.sellPercent}% every ${command.config.sellInterval}s`
                          : `Random buy ${command.config.buyAmount?.min}-${command.config.buyAmount?.max} SOL`
                        }
                      </p>
                    </div>
                     <div className="flex items-center gap-2">
                       <Button
                         size="sm"
                         variant="outline"
                         onClick={() => setShowSimulation(showSimulation === command.id ? null : command.id)}
                       >
                         <BarChart3 className="h-4 w-4" />
                       </Button>
                       <Button
                         size="sm"
                         variant="outline"
                         onClick={() => startEditing(command)}
                       >
                         <Edit className="h-4 w-4" />
                       </Button>
                       <div className="flex items-center gap-2">
                         <Label htmlFor={`command-${command.id}`} className="text-xs">
                           {command.is_active ? "Enabled" : "Disabled"}
                         </Label>
                         <Switch
                           id={`command-${command.id}`}
                           checked={command.is_active}
                           onCheckedChange={() => toggleCommand(command)}
                         />
                       </div>
                     </div>
                  </div>

                  {/* Stats Divs */}
                  <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Base Fee</div>
                      <div className="font-medium">{stats.baseFee.toFixed(4)} SOL</div>
                      <div className="text-xs text-muted-foreground">Constant</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Total Trades</div>
                      <div className="font-medium">{stats.totalTrades.buy}B / {stats.totalTrades.sell}S</div>
                      <div className="text-xs text-muted-foreground">
                        Gas: {stats.gasFeesTotal.toFixed(4)} ({stats.gasFeeAverage.toFixed(4)})
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Our Fees</div>
                      <div className="font-medium">{stats.ourFeesTotal.toFixed(4)} SOL</div>
                      <div className="text-xs text-muted-foreground">
                        Avg: ({stats.ourFeeAverage.toFixed(4)})
                      </div>
                    </div>
                   </div>

                  {/* Recent Simulated Trades (Dev Mode Only) */}
                  {isDevMode && simulatedTrades[command.id] && simulatedTrades[command.id].length > 0 && (
                    <div className="p-3 bg-accent/20 rounded-lg">
                      <div className="text-sm font-medium text-accent-foreground mb-2">🔄 Recent Simulated Trades</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {simulatedTrades[command.id].slice(-5).reverse().map((trade, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs p-1 rounded bg-background/50">
                            <span className={trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}>
                              {trade.type.toUpperCase()}: {trade.amount.toFixed(4)} SOL
                            </span>
                            <span className="text-muted-foreground">
                              {trade.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Simulation Mode */}
                  {showSimulation === command.id && (
                    <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        <h5 className="font-medium">Simulation Mode</h5>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <Label>Time Duration: {simulationHours[0]} hours</Label>
                          <Slider
                            value={simulationHours}
                            onValueChange={setSimulationHours}
                            max={96}
                            min={1}
                            step={1}
                            className="mt-2"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>1hr</span>
                            <span>24hr</span>
                            <span>48hr</span>
                            <span>96hr</span>
                          </div>
                        </div>

                         {simulationData && (
                           <div className="grid grid-cols-2 gap-4 p-3 bg-background rounded border">
                             <div className="space-y-2">
                               <div className="text-sm font-medium">Estimated Stats:</div>
                               <div className="text-xs space-y-1">
                                 <div>Trades: {simulationData.trades}</div>
                                 <div>Gas Fees: {simulationData.gasFees.toFixed(4)} SOL</div>
                                 <div>Our Fees: {simulationData.ourFees.toFixed(4)} SOL</div>
                               </div>
                             </div>
                             <div className="space-y-2">
                               <div className="text-sm font-medium">Total Cost:</div>
                               <div className="text-lg font-bold text-primary">
                                 {simulationData.totalCost.toFixed(4)} SOL
                               </div>
                               <div className="text-xs text-muted-foreground">
                                 Base + Gas + Service
                               </div>
                               {/* Balance Check */}
                               {(() => {
                                 const effectiveBalance = isDevMode ? (devBalance || 0) : wallet.sol_balance;
                                 const canAfford = effectiveBalance >= simulationData.totalCost;
                                 const remainingBalance = effectiveBalance - simulationData.totalCost;
                                 
                                 return (
                                   <div className="mt-2 p-2 rounded bg-muted/50">
                                     <div className="text-xs">
                                       <div className={`font-medium ${canAfford ? 'text-green-600' : 'text-red-600'}`}>
                                         {canAfford ? '✓ Affordable' : '✗ Insufficient funds'}
                                       </div>
                                       <div className="text-muted-foreground">
                                         Current: {effectiveBalance.toFixed(4)} SOL
                                         {isDevMode && ' (simulated)'}
                                       </div>
                                       {canAfford && (
                                         <div className="text-muted-foreground">
                                           Remaining: {remainingBalance.toFixed(4)} SOL
                                         </div>
                                       )}
                                     </div>
                                   </div>
                                 );
                               })()}
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create/Edit Command Form */}
        {showCreateForm && (
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {editingCommand ? "Edit Command" : "Create New Command"}
              </h3>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="commandName">Command Name</Label>
                <Input
                  id="commandName"
                  value={newCommand.name}
                  onChange={(e) => setNewCommand(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Quick Pump Strategy"
                />
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={randomizeCommand}
                    className="flex items-center gap-2"
                  >
                    <Shuffle className="h-4 w-4" />
                    Randomize
                  </Button>
                  {previousCommand && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={restorePrevious}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Back to Previous
                    </Button>
                  )}
                </div>
                 <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2">
                     <Label htmlFor="usdToggle" className="text-sm">SOL</Label>
                     <Button
                       type="button"
                       variant="outline"
                       size="sm"
                       onClick={() => setUseUSD(!useUSD)}
                       className={`p-2 h-8 w-12 ${useUSD ? 'bg-primary text-primary-foreground' : ''}`}
                     >
                       <DollarSign className="h-4 w-4" />
                     </Button>
                     <Label htmlFor="usdToggle" className="text-sm">USD</Label>
                   </div>
                   <div className="flex items-center gap-2">
                     <Label htmlFor="mockFunds" className="text-sm">Mock Funds:</Label>
                     <Input
                       id="mockFunds"
                       type="number"
                       step="0.1"
                       value={mockFunds}
                       onChange={(e) => setMockFunds(e.target.value)}
                       className="w-20 h-8"
                     />
                     <Button
                       type="button"
                       variant="outline"
                       size="sm"
                       onClick={() => setUseMockFunds(!useMockFunds)}
                       className={`px-3 h-8 ${useMockFunds ? 'bg-accent text-accent-foreground' : ''}`}
                     >
                       {useMockFunds ? 'ON' : 'OFF'}
                     </Button>
                   </div>
                 </div>
              </div>

              <Tabs value={mode} onValueChange={(value) => setMode(value as "simple" | "complex")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="simple">Simple Mode</TabsTrigger>
                  <TabsTrigger value="complex">Complex Mode</TabsTrigger>
                </TabsList>

                <TabsContent value="simple" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="buyAmount">Buy Amount</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBuyAmountUnit(prev => prev === 'USD' ? 'SOL' : 'USD')}
                          className="h-6 px-2 text-xs"
                        >
                          {buyAmountUnit}
                        </Button>
                      </div>
                      <Input
                        id="buyAmount"
                        type="number"
                        step={buyAmountUnit === 'USD' ? "0.01" : "0.001"}
                        value={newCommand.buyAmount}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || !isNaN(Number(value))) {
                            setNewCommand(prev => ({ 
                              ...prev, 
                              buyAmount: value 
                            }));
                          }
                        }}
                        placeholder={buyAmountUnit === 'USD' ? "5.00" : "0.025"}
                      />
                      {buyAmountUnit === 'USD' && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ≈ {newCommand.buyAmount} SOL
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="sellPercent">Sell Percent (%)</Label>
                      <Input
                        id="sellPercent"
                        type="number"
                        value={newCommand.sellPercent}
                        onChange={(e) => setNewCommand(prev => ({ ...prev, sellPercent: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyInterval">Buy Interval (seconds)</Label>
                      <Input
                        id="buyInterval"
                        type="number"
                        value={newCommand.buyInterval}
                        onChange={(e) => setNewCommand(prev => ({ ...prev, buyInterval: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sellInterval">Sell Interval (seconds)</Label>
                      <Input
                        id="sellInterval"
                        type="number"
                        value={newCommand.sellInterval}
                        onChange={(e) => setNewCommand(prev => ({ ...prev, sellInterval: e.target.value }))}
                      />
                    </div>
                  </div>
                   <div>
                     <Label htmlFor="duration">Duration (seconds, 0 for infinite)</Label>
                     <Input
                       id="duration"
                       type="number"
                       value={newCommand.duration}
                       onChange={(e) => setNewCommand(prev => ({ ...prev, duration: e.target.value }))}
                     />
                     {/* Duration Feedback */}
                     {(() => {
                       const config = {
                         type: "simple",
                         buyAmount: parseFloat(newCommand.buyAmount) || 0.01,
                         sellPercent: parseFloat(newCommand.sellPercent) || 100,
                         buyInterval: parseInt(newCommand.buyInterval) || 30,
                         sellInterval: parseInt(newCommand.sellInterval) || 600
                       };
                       const estimate = calculateDurationEstimate(config);
                       
                       return (
                         <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                           <div className="text-sm font-medium mb-2">💰 Duration Estimate</div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <div className="text-muted-foreground">Funds Available:</div>
                                <div className="font-medium">
                                  {(useMockFunds ? parseFloat(mockFunds) : (isDevMode ? (devBalance || 0) : wallet.sol_balance)).toFixed(3)} SOL
                                  {useMockFunds && <span className="text-accent"> (mock)</span>}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Net Cost/Cycle:</div>
                                <div className="font-medium">{estimate.totalCostPerCycle.toFixed(4)} SOL</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Volume Generated:</div>
                                <div className="font-medium">
                                  {estimate.isInfinite ? '∞' : (
                                    <div className="space-y-1">
                                      <div>{estimate.volumeGenerated.toFixed(2)} SOL</div>
                                      <div className="text-sm text-muted-foreground">
                                        {formatVolumeUSD(estimate.volumeGenerated)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">BlackBox Income:</div>
                                <div className="font-medium text-accent">
                                  {estimate.isInfinite ? '∞' : (
                                    <div className="space-y-1">
                                      <div>{calculateBlackBoxIncome(estimate).toFixed(4)} SOL</div>
                                      <div className="text-sm text-muted-foreground">
                                        {formatVolumeUSD(calculateBlackBoxIncome(estimate))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Can Run For:</div>
                                <div className={`font-medium ${estimate.isInfinite ? 'text-green-600' : estimate.maxDurationHours < 1 ? 'text-red-600' : 'text-yellow-600'}`}>
                                  {estimate.isInfinite ? '∞ (Infinite)' : 
                                   estimate.maxDurationHours < 1 ? `${(estimate.maxDurationHours * 60).toFixed(0)}min` :
                                   estimate.maxDurationHours < 24 ? `${estimate.maxDurationHours.toFixed(1)}hrs` :
                                  `${(estimate.maxDurationHours / 24).toFixed(1)} days`}
                               </div>
                             </div>
                             <div>
                               <div className="text-muted-foreground">Total Cycles:</div>
                               <div className="font-medium">
                                 {estimate.isInfinite ? '∞' : estimate.cyclesUntilEmpty}
                               </div>
                             </div>
                           </div>
                           {!estimate.isInfinite && estimate.maxDurationHours < 1 && (
                             <div className="mt-2 text-xs text-red-600">
                               ⚠️ Duration too short - consider increasing funds or reducing trade frequency
                             </div>
                           )}
                         </div>
                       );
                     })()}
                   </div>
                </TabsContent>

                <TabsContent value="complex" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Buy Amount Range ({useUSD ? 'USD' : 'SOL'})</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step={useUSD ? "0.01" : "0.001"}
                          placeholder={useUSD ? "Min USD" : "Min SOL"}
                          value={useUSD ? convertToUSD(newCommand.buyAmountMin) : newCommand.buyAmountMin}
                          onChange={(e) => setNewCommand(prev => ({ 
                            ...prev, 
                            buyAmountMin: useUSD ? convertToSOL(e.target.value) : e.target.value 
                          }))}
                        />
                        <Input
                          type="number"
                          step={useUSD ? "0.01" : "0.001"}
                          placeholder={useUSD ? "Max USD" : "Max SOL"}
                          value={useUSD ? convertToUSD(newCommand.buyAmountMax) : newCommand.buyAmountMax}
                          onChange={(e) => setNewCommand(prev => ({ 
                            ...prev, 
                            buyAmountMax: useUSD ? convertToSOL(e.target.value) : e.target.value 
                          }))}
                        />
                      </div>
                      {useUSD && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ≈ {newCommand.buyAmountMin}-{newCommand.buyAmountMax} SOL
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Sell Percent Range (%)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={newCommand.sellPercentMin}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, sellPercentMin: e.target.value }))}
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={newCommand.sellPercentMax}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, sellPercentMax: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Buy Interval Range (seconds)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={newCommand.buyIntervalMin}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, buyIntervalMin: e.target.value }))}
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={newCommand.buyIntervalMax}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, buyIntervalMax: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Sell Interval Range (seconds)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={newCommand.sellIntervalMin}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, sellIntervalMin: e.target.value }))}
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={newCommand.sellIntervalMax}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, sellIntervalMax: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Button onClick={editingCommand ? updateCommand : createCommand} className="w-full">
                {editingCommand ? "Update Command" : "Create Command"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}