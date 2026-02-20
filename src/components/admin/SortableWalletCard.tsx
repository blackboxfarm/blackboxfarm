import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { 
  RefreshCw, Copy, ExternalLink, ChevronDown, ChevronUp, Key, GripVertical, Pencil, Check, X
} from 'lucide-react';
import { WalletTokenManager } from '@/components/blackbox/WalletTokenManager';

interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  logoUri?: string;
  usdValue?: number;
}

interface MasterWallet {
  id: string;
  pubkey: string;
  source: 'wallet_pool' | 'blackbox' | 'super_admin' | 'airdrop' | 'custom';
  sourceTable: string;
  sourceEmoji: string;
  sourceLabel: string;
  purpose?: string;
  purposeEmoji?: string;
  label?: string;
  isActive: boolean;
  solBalance: number;
  tokens: TokenBalance[];
  isLoading: boolean;
  lastUpdated?: Date;
  linkedCampaigns?: string[];
  hasTransactionHistory?: boolean;
}

interface SortableWalletCardProps {
  wallet: MasterWallet;
  solPrice: number | null;
  isExpanded: boolean;
  isExporting: boolean;
  sourceConfig: Record<string, { emoji: string; label: string; color: string; table: string }>;
  purposeEmojis: Record<string, { emoji: string; label: string }>;
  onToggleActive: (wallet: MasterWallet) => void;
  onToggleExpanded: (id: string) => void;
  onRefreshBalance: (pubkey: string) => void;
  onExportKey: (wallet: MasterWallet) => void;
  onCopy: (text: string) => void;
  onOpenSolscan: (pubkey: string) => void;
  onEditLabel?: (wallet: MasterWallet, newLabel: string) => void;
}

export function SortableWalletCard({
  wallet,
  solPrice,
  isExpanded,
  isExporting,
  sourceConfig,
  purposeEmojis,
  onToggleActive,
  onToggleExpanded,
  onRefreshBalance,
  onExportKey,
  onCopy,
  onOpenSolscan,
  onEditLabel,
}: SortableWalletCardProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState(wallet.label || '');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: wallet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style}
      className={`transition-all ${!wallet.isActive ? 'opacity-60' : ''} ${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Drag Handle */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Source Badge */}
            <Badge className={sourceConfig[wallet.source].color}>
              <span className="mr-1">{wallet.sourceEmoji}</span>
              {wallet.sourceLabel}
            </Badge>
            
            {/* Purpose Badge */}
            {wallet.purpose && (
              <Badge variant="outline">
                <span className="mr-1">{wallet.purposeEmoji}</span>
                {purposeEmojis[wallet.purpose]?.label || wallet.purpose}
              </Badge>
            )}
            
            {/* Active Status Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={wallet.isActive}
                onCheckedChange={() => onToggleActive(wallet)}
                className="data-[state=checked]:bg-green-600"
              />
              <span className="text-sm text-muted-foreground">
                {wallet.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            {/* Editable Label */}
            {isEditingLabel ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editLabelValue}
                  onChange={(e) => setEditLabelValue(e.target.value)}
                  className="h-7 w-40 text-sm"
                  placeholder="Enter label..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onEditLabel?.(wallet, editLabelValue);
                      setIsEditingLabel(false);
                    } else if (e.key === 'Escape') {
                      setEditLabelValue(wallet.label || '');
                      setIsEditingLabel(false);
                    }
                  }}
                />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                  onEditLabel?.(wallet, editLabelValue);
                  setIsEditingLabel(false);
                }}>
                  <Check className="h-3 w-3 text-green-600" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                  setEditLabelValue(wallet.label || '');
                  setIsEditingLabel(false);
                }}>
                  <X className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {wallet.label && (
                  <span className="text-sm font-medium">{wallet.label}</span>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                  setEditLabelValue(wallet.label || '');
                  setIsEditingLabel(true);
                }}>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            )}
            
            {/* Linked campaigns */}
            {wallet.linkedCampaigns && wallet.linkedCampaigns.length > 0 && (
              <Badge variant="outline" className="bg-primary/10">
                🎯 {wallet.linkedCampaigns.length} campaign{wallet.linkedCampaigns.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Balance display */}
            <div className="text-right">
              <div className="font-mono font-bold">
                {wallet.isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin inline" />
                ) : (
                  <>
                    {wallet.solBalance.toFixed(4)} SOL
                    <span className="text-xs text-muted-foreground ml-1">
                      (${(wallet.solBalance * (solPrice || 0)).toFixed(2)})
                    </span>
                  </>
                )}
              </div>
              {wallet.tokens.length > 1 && (
                <div className="text-xs text-muted-foreground">
                  +{wallet.tokens.length - 1} tokens
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Token summary row - show tokens inline */}
        {wallet.tokens.length > 1 && !wallet.isLoading && (
          <div className="flex flex-wrap gap-1 mt-2">
            {wallet.tokens.slice(1).map(t => (
              <Badge key={t.mint} variant="outline" className="text-xs font-mono bg-accent/50">
                {t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {t.symbol}
              </Badge>
            ))}
          </div>
        )}
        
        {/* Wallet address row */}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
            {wallet.pubkey}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onCopy(wallet.pubkey)}>
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenSolscan(wallet.pubkey)}>
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onRefreshBalance(wallet.pubkey)}
            disabled={wallet.isLoading}
          >
            <RefreshCw className={`h-3 w-3 ${wallet.isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExportKey(wallet)}
            disabled={isExporting}
            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
          >
            {isExporting ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Key className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleExpanded(wallet.id)}
          >
            {isExpanded ? (
              <><ChevronUp className="h-3 w-3 mr-1" /> Hide</>
            ) : (
              <><ChevronDown className="h-3 w-3 mr-1" /> Manage</>
            )}
          </Button>
        </div>
        
        {/* Last updated */}
        {wallet.lastUpdated && (
          <div className="text-xs text-muted-foreground mt-1">
            Last updated: {wallet.lastUpdated.toLocaleString()}
          </div>
        )}
      </CardHeader>
      
      {/* Expandable Token Manager */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <WalletTokenManager
                walletId={wallet.id}
                walletPubkey={wallet.pubkey}
                initialTokens={wallet.tokens}
                onTokensSold={() => onRefreshBalance(wallet.pubkey)}
                useDirectSwap={true}
                walletSource={wallet.sourceTable}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
