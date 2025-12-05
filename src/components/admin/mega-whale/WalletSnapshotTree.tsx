import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronRight, ChevronDown, Wallet, Coins, 
  TrendingUp, AlertTriangle, ExternalLink, Copy
} from 'lucide-react';
import { toast } from 'sonner';

interface TreeWallet {
  id: string;
  wallet_address: string;
  depth_level: number;
  parent_offspring_id: string | null;
  total_sol_received: number;
  is_pump_fun_dev: boolean;
  is_active_trader: boolean;
  has_minted: boolean;
  minted_token: string | null;
  tokens_minted: any;
  children?: TreeWallet[];
}

interface Props {
  wallets: TreeWallet[];
  totalCount: number;
  displayLimit: number;
}

export function WalletSnapshotTree({ wallets, totalCount, displayLimit }: Props) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Build tree structure from flat list
  const buildTree = (wallets: TreeWallet[]): TreeWallet[] => {
    const walletMap = new Map<string, TreeWallet>();
    const roots: TreeWallet[] = [];

    // First pass: create all nodes
    wallets.forEach(w => {
      walletMap.set(w.id, { ...w, children: [] });
    });

    // Second pass: build hierarchy
    wallets.forEach(w => {
      const node = walletMap.get(w.id)!;
      if (w.parent_offspring_id && walletMap.has(w.parent_offspring_id)) {
        walletMap.get(w.parent_offspring_id)!.children!.push(node);
      } else if (w.depth_level === 1) {
        roots.push(node);
      }
    });

    return roots;
  };

  const tree = buildTree(wallets);

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Copied to clipboard');
  };

  const getDepthColor = (depth: number) => {
    const colors = [
      'border-l-primary',
      'border-l-blue-500',
      'border-l-green-500',
      'border-l-yellow-500',
      'border-l-orange-500',
    ];
    return colors[Math.min(depth - 1, colors.length - 1)];
  };

  const getWalletIcon = (wallet: TreeWallet) => {
    if (wallet.has_minted || wallet.is_pump_fun_dev) {
      return <Coins className="h-4 w-4 text-yellow-500" />;
    }
    if (wallet.is_active_trader) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    }
    if (wallet.total_sol_received < 0.5) {
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
    return <Wallet className="h-4 w-4" />;
  };

  const renderNode = (wallet: TreeWallet, level: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(wallet.id);
    const hasChildren = wallet.children && wallet.children.length > 0;

    return (
      <div key={wallet.id} className="select-none">
        <div 
          className={`flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer border-l-2 ${getDepthColor(wallet.depth_level)}`}
          style={{ marginLeft: level * 20 }}
          onClick={() => hasChildren && toggleExpand(wallet.id)}
        >
          {/* Expand/Collapse */}
          <div className="w-5">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            ) : (
              <div className="w-4" />
            )}
          </div>

          {/* Icon */}
          {getWalletIcon(wallet)}

          {/* Address */}
          <span className="font-mono text-sm">
            {wallet.wallet_address.slice(0, 6)}...{wallet.wallet_address.slice(-4)}
          </span>

          {/* Badges */}
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              L{wallet.depth_level}
            </Badge>
            {wallet.has_minted && (
              <Badge variant="default" className="text-xs bg-yellow-500">
                🔨 MINTER
              </Badge>
            )}
            {wallet.is_active_trader && !wallet.has_minted && (
              <Badge variant="secondary" className="text-xs">
                📈 Trader
              </Badge>
            )}
            {wallet.total_sol_received < 0.5 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Low SOL
              </Badge>
            )}
          </div>

          {/* SOL Balance */}
          <span className="text-xs text-muted-foreground ml-auto">
            {wallet.total_sol_received?.toFixed(3)} SOL
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => copyAddress(wallet.wallet_address)}
            >
              <Copy className="h-3 w-3" />
            </Button>
            <a
              href={`https://solscan.io/account/${wallet.wallet_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {wallet.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header with count */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Wallet Family Tree</span>
          <Badge variant="outline">
            Showing {wallets.length} of {totalCount.toLocaleString()}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-yellow-500" /> Minter
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" /> Trader
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Low SOL
          </span>
        </div>
      </div>

      {/* Tree */}
      <div className="border rounded-lg p-2 bg-card max-h-[400px] overflow-y-auto">
        {tree.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No wallet hierarchy data available
          </div>
        ) : (
          tree.map(root => renderNode(root))
        )}
      </div>

      {/* Depth Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-2">
        <span>Depth levels:</span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 border-l-2 border-l-primary" /> L1
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 border-l-2 border-l-blue-500" /> L2
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 border-l-2 border-l-green-500" /> L3
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 border-l-2 border-l-yellow-500" /> L4
        </span>
      </div>
    </div>
  );
}
