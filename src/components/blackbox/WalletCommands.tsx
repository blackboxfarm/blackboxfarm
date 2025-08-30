import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Plus, Play, Pause, Settings, AlertTriangle, DollarSign, BarChart3, TrendingUp, Info, Eye, EyeOff } from "lucide-react";
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

interface WalletCommandsProps {
  wallet: WalletData;
  campaign: Campaign;
  isDevMode?: boolean;
  devBalance?: number;
}

export function WalletCommands({ wallet, campaign, isDevMode = false, devBalance }: WalletCommandsProps) {
  const [commands, setCommands] = useState<CommandCode[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [mode, setMode] = useState<"simple" | "complex">("simple");
  const [commandStats, setCommandStats] = useState<Record<string, CommandStats>>({});
  const [showSimulation, setShowSimulation] = useState<string | null>(null);
  const [simulationHours, setSimulationHours] = useState([24]);
  const [showWalletAlert, setShowWalletAlert] = useState(!isDevMode);
  const [showTradingCosts, setShowTradingCosts] = useState(false);
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
  }, [wallet.id, isDevMode]);

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

    const estimatedGasFees = estimatedTrades * 0.002; // Estimated gas fee per trade
    const estimatedOurFees = estimatedTrades * 0.001; // Our service fee per trade
    const baseFee = 0.001;

    return {
      trades: estimatedTrades,
      gasFees: estimatedGasFees,
      ourFees: estimatedOurFees,
      baseFee,
      totalCost: baseFee + estimatedGasFees + estimatedOurFees
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
    setShowCreateForm(false);
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
      title: command.is_active ? "Command stopped" : "Command started", 
      description: `${command.name} is now ${command.is_active ? "inactive" : "active"}` 
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
                  Estimated cost: ~0.001-0.005 SOL per trade + gas fees
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
                          {command.is_active ? "Running" : "Stopped"}
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
                    <div className="flex gap-2">
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
                        onClick={() => toggleCommand(command)}
                      >
                        {command.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
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

        {/* Create Command Form */}
        {showCreateForm && (
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Create New Command</h3>
              <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)}>
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

              <Tabs value={mode} onValueChange={(value) => setMode(value as "simple" | "complex")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="simple">Simple Mode</TabsTrigger>
                  <TabsTrigger value="complex">Complex Mode</TabsTrigger>
                </TabsList>

                <TabsContent value="simple" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="buyAmount">Buy Amount (SOL)</Label>
                      <Input
                        id="buyAmount"
                        type="number"
                        step="0.001"
                        value={newCommand.buyAmount}
                        onChange={(e) => setNewCommand(prev => ({ ...prev, buyAmount: e.target.value }))}
                      />
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
                  </div>
                </TabsContent>

                <TabsContent value="complex" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Buy Amount Range (SOL)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.001"
                          placeholder="Min"
                          value={newCommand.buyAmountMin}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, buyAmountMin: e.target.value }))}
                        />
                        <Input
                          type="number"
                          step="0.001"
                          placeholder="Max"
                          value={newCommand.buyAmountMax}
                          onChange={(e) => setNewCommand(prev => ({ ...prev, buyAmountMax: e.target.value }))}
                        />
                      </div>
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

              <Button onClick={createCommand} className="w-full">
                Create Command
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}