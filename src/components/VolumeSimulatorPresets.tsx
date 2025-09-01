import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Bookmark, Trash2 } from 'lucide-react';

interface SimulatorPreset {
  id: string;
  name: string;
  description: string;
  params: {
    bankrollSol: number;
    tradeSizeUsd: number;
    solPriceUsd: number;
    intervalSec: number;
    ammFeeBps: number;
    networkFeePreset: 'low' | 'typical' | 'busy';
    pairMode: boolean;
    useBatchPricing: boolean;
  };
  riskLevel: 'low' | 'medium' | 'high';
}

const defaultPresets: SimulatorPreset[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Low risk, steady volume build',
    riskLevel: 'low',
    params: {
      bankrollSol: 1,
      tradeSizeUsd: 0.05,
      solPriceUsd: 175,
      intervalSec: 45,
      ammFeeBps: 25,
      networkFeePreset: 'low',
      pairMode: true,
      useBatchPricing: true
    }
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Medium risk, good efficiency',
    riskLevel: 'medium',
    params: {
      bankrollSol: 2,
      tradeSizeUsd: 0.1,
      solPriceUsd: 175,
      intervalSec: 20,
      ammFeeBps: 25,
      networkFeePreset: 'typical',
      pairMode: true,
      useBatchPricing: true
    }
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'High frequency, maximum impact',
    riskLevel: 'high',
    params: {
      bankrollSol: 5,
      tradeSizeUsd: 0.25,
      solPriceUsd: 175,
      intervalSec: 10,
      ammFeeBps: 30,
      networkFeePreset: 'busy',
      pairMode: true,
      useBatchPricing: false
    }
  }
];

interface VolumeSimulatorPresetsProps {
  onLoadPreset: (preset: SimulatorPreset) => void;
  currentParams: any;
  onSavePreset: (name: string, description: string) => void;
}

export function VolumeSimulatorPresets({ 
  onLoadPreset, 
  currentParams, 
  onSavePreset 
}: VolumeSimulatorPresetsProps) {
  const [savedPresets, setSavedPresets] = React.useState<SimulatorPreset[]>([]);
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');
  const [presetDescription, setPresetDescription] = React.useState('');

  React.useEffect(() => {
    // Load saved presets from localStorage
    const saved = localStorage.getItem('volume-simulator-presets');
    if (saved) {
      setSavedPresets(JSON.parse(saved));
    }
  }, []);

  const savePreset = () => {
    if (!presetName.trim()) return;

    const newPreset: SimulatorPreset = {
      id: Date.now().toString(),
      name: presetName,
      description: presetDescription,
      riskLevel: 'medium',
      params: currentParams
    };

    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    localStorage.setItem('volume-simulator-presets', JSON.stringify(updated));
    
    setShowSaveDialog(false);
    setPresetName('');
    setPresetDescription('');
    onSavePreset(presetName, presetDescription);
  };

  const deletePreset = (id: string) => {
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem('volume-simulator-presets', JSON.stringify(updated));
  };

  const getRiskBadgeVariant = (risk: string) => {
    switch (risk) {
      case 'low': return 'default';
      case 'medium': return 'secondary';
      case 'high': return 'destructive';
      default: return 'outline';
    }
  };

  const calculateRiskNotes = (params: any) => {
    const notes = [];
    
    if (params.intervalSec < 15) {
      notes.push('High frequency trading - may trigger rate limits');
    }
    if (params.tradeSizeUsd > 0.2) {
      notes.push('Large trade size - higher market impact');
    }
    if (params.ammFeeBps > 30) {
      notes.push('High AMM fees - consider DEX alternatives');
    }
    if (!params.useBatchPricing && params.bankrollSol > 2) {
      notes.push('Consider batch pricing for better efficiency');
    }
    
    return notes;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Simulation Presets</h3>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowSaveDialog(true)}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Current
        </Button>
      </div>

      {/* Default Presets */}
      <div>
        <h4 className="text-sm font-medium mb-3 text-muted-foreground">Default Presets</h4>
        <div className="grid gap-3 md:grid-cols-3">
          {defaultPresets.map((preset) => (
            <Card key={preset.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{preset.name}</CardTitle>
                  <Badge variant={getRiskBadgeVariant(preset.riskLevel)}>
                    {preset.riskLevel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {preset.description}
                </p>
                
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>Bankroll: {preset.params.bankrollSol} SOL</div>
                  <div>Trade: ${preset.params.tradeSizeUsd}</div>
                  <div>Interval: {preset.params.intervalSec}s</div>
                  <div>Fees: {preset.params.ammFeeBps} bps</div>
                </div>

                {/* Risk Assessment */}
                <div className="space-y-1">
                  {calculateRiskNotes(preset.params).slice(0, 2).map((note, idx) => (
                    <div key={idx} className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      {note}
                    </div>
                  ))}
                </div>
                
                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={() => onLoadPreset(preset)}
                >
                  <Bookmark className="h-3 w-3 mr-2" />
                  Load
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Saved Presets */}
      {savedPresets.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 text-muted-foreground">Your Saved Presets</h4>
          <div className="space-y-2">
            {savedPresets.map((preset) => (
              <Card key={preset.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{preset.name}</div>
                      <div className="text-xs text-muted-foreground">{preset.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onLoadPreset(preset)}
                      >
                        Load
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => deletePreset(preset.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Save Current Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Preset Name</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., My Custom Strategy"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder="Brief description of the strategy"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={savePreset} disabled={!presetName.trim()}>
                Save
              </Button>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}