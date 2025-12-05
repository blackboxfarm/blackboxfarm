import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Shield, Cpu, Clock, Wallet, Coins, 
  Users, Save, RefreshCw, AlertTriangle
} from 'lucide-react';

interface ScanConfig {
  minSolForMintCheck: number;
  maxWalletsToDisplay: number;
  maxWalletsPerScanCycle: number;
  maxDepthLevel: number;
  enableBundleDetection: boolean;
  bundleSensitivity: number;
  prioritizeMinters: boolean;
  skipLowBalanceWallets: boolean;
  scanIntervalMinutes: number;
}

interface Props {
  userId: string;
}

const DEFAULT_CONFIG: ScanConfig = {
  minSolForMintCheck: 0.5,
  maxWalletsToDisplay: 50,
  maxWalletsPerScanCycle: 100,
  maxDepthLevel: 4,
  enableBundleDetection: true,
  bundleSensitivity: 3,
  prioritizeMinters: true,
  skipLowBalanceWallets: true,
  scanIntervalMinutes: 5,
};

export function ScanGuardrails({ userId }: Props) {
  const [config, setConfig] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [userId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      // Try to load from local storage for now (can be migrated to DB later)
      const saved = localStorage.getItem(`mega_whale_scan_config_${userId}`);
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load scan config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      // Save to local storage
      localStorage.setItem(`mega_whale_scan_config_${userId}`, JSON.stringify(config));
      toast.success('Scan guardrails saved');
    } catch (error) {
      toast.error('Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    toast.info('Reset to default values');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          Scan Guardrails
        </CardTitle>
        <CardDescription>
          Configure limits to prevent CPU/cron overload
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Display Limits */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Display Limits
          </h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Wallets to Display</Label>
              <Input
                type="number"
                value={config.maxWalletsToDisplay}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  maxWalletsToDisplay: parseInt(e.target.value) || 50 
                }))}
                min={10}
                max={500}
              />
              <p className="text-xs text-muted-foreground">Shown in UI (10-500)</p>
            </div>
            
            <div className="space-y-2">
              <Label>Max Wallets Per Scan Cycle</Label>
              <Input
                type="number"
                value={config.maxWalletsPerScanCycle}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  maxWalletsPerScanCycle: parseInt(e.target.value) || 100 
                }))}
                min={10}
                max={1000}
              />
              <p className="text-xs text-muted-foreground">Per cron run (10-1000)</p>
            </div>
          </div>
        </div>

        {/* Depth & SOL Limits */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Coins className="h-4 w-4" /> Filtering Rules
          </h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min SOL for MINT Check</Label>
              <Input
                type="number"
                step="0.1"
                value={config.minSolForMintCheck}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  minSolForMintCheck: parseFloat(e.target.value) || 0.5 
                }))}
                min={0}
                max={10}
              />
              <p className="text-xs text-muted-foreground">Skip MINT checks below this SOL</p>
            </div>
            
            <div className="space-y-2">
              <Label>Max Depth Level</Label>
              <Input
                type="number"
                value={config.maxDepthLevel}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  maxDepthLevel: parseInt(e.target.value) || 4 
                }))}
                min={1}
                max={6}
              />
              <p className="text-xs text-muted-foreground">How deep to scan (1-6)</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label>Skip Low Balance Wallets</Label>
              <p className="text-xs text-muted-foreground">Don't scan wallets below min SOL</p>
            </div>
            <Switch
              checked={config.skipLowBalanceWallets}
              onCheckedChange={(v) => setConfig(prev => ({ ...prev, skipLowBalanceWallets: v }))}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label>Prioritize Minters</Label>
              <p className="text-xs text-muted-foreground">Check minting wallets first</p>
            </div>
            <Switch
              checked={config.prioritizeMinters}
              onCheckedChange={(v) => setConfig(prev => ({ ...prev, prioritizeMinters: v }))}
            />
          </div>
        </div>

        {/* Bundle Detection */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Bundle Detection
          </h4>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label>Enable Bundle Detection</Label>
              <p className="text-xs text-muted-foreground">Flag coordinated wallet activity</p>
            </div>
            <Switch
              checked={config.enableBundleDetection}
              onCheckedChange={(v) => setConfig(prev => ({ ...prev, enableBundleDetection: v }))}
            />
          </div>

          {config.enableBundleDetection && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bundle Sensitivity</Label>
                <Badge variant="outline">{config.bundleSensitivity} wallets</Badge>
              </div>
              <Slider
                value={[config.bundleSensitivity]}
                onValueChange={([v]) => setConfig(prev => ({ ...prev, bundleSensitivity: v }))}
                min={2}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Min wallets buying same token = bundle
              </p>
            </div>
          )}
        </div>

        {/* Timing */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" /> Scan Timing
          </h4>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Scan Interval</Label>
              <Badge variant="outline">{config.scanIntervalMinutes} min</Badge>
            </div>
            <Slider
              value={[config.scanIntervalMinutes]}
              onValueChange={([v]) => setConfig(prev => ({ ...prev, scanIntervalMinutes: v }))}
              min={1}
              max={60}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Time between background scans
            </p>
          </div>
        </div>

        {/* Current Estimates */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4" /> Estimated Load
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Scans/hour:</span>
              <span className="ml-1 font-mono">{Math.round(60 / config.scanIntervalMinutes)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Wallets/hour:</span>
              <span className="ml-1 font-mono">
                {Math.round((60 / config.scanIntervalMinutes) * config.maxWalletsPerScanCycle)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">API calls/hour:</span>
              <span className="ml-1 font-mono">
                ~{Math.round((60 / config.scanIntervalMinutes) * config.maxWalletsPerScanCycle * 2)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Guardrails
          </Button>
          <Button variant="outline" onClick={resetToDefaults}>
            Reset Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
