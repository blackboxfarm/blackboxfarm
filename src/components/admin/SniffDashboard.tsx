import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Copy, Check, ChevronDown, ChevronRight, Wallet, Coins, Calendar, DollarSign, Users, Target, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// Hardcoded scan results from the investigation
const SCAN_REPORT = {
  parentWallet: 'G2YxRa6wt1qePMwfJzdXZG62ej4qaTC7YURzuh2Lwd3t',
  scanDate: 'January 23, 2026',
  scanDepth: 4,
  fundingSource: {
    wallet: '5tzFkiKscUWMhwBpSdj7epyZ4XKGjUaoFAPVzuKuwGP1',
    label: 'Binance Hot Wallet',
    amount: '~50 SOL'
  },
  summary: {
    totalOffspring: 58,
    totalMinters: 3,
    totalTokensMinted: 12,
    scanDuration: '45 seconds'
  },
  minters: [
    {
      wallet: 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
      depth: 2,
      tokenCount: 10,
      label: 'Primary Token Factory',
      tokens: [
        { mint: 'ArhBNpJMURmkU5DbjDrcqUoPtDSXXM6vnnBiW4oppump', name: 'skipper', symbol: '$skipper', date: 'Jan 23, 2026', marketCap: '$13,469', isNew: true },
        { mint: 'DJgNBsutYzRF2cZ8J2HqxZ6CdbpbB2VBJHPR3Ntxpump', name: 'GOODSHIT', symbol: '$GOODSHIT', date: 'Jan 23, 2026', marketCap: '$4,234' },
        { mint: 'Dy9Lu6viKwvKnZCyxtBLdnHdBqncHprJzazLPdpppump', name: 'Coyote', symbol: '$Coyote', date: 'Jan 23, 2026', marketCap: '$2,891' },
        { mint: 'FpnRqosU8pWPt3xUZceNLpSxXmkfn9MYMrmFEDospump', name: 'Monocryl', symbol: '$Monocryl', date: 'Jan 23, 2026', marketCap: '$1,567' },
        { mint: '4o4yTzPBPEqPnEN3VcG4vuH6Wr6cLBfGhTPoFBdgpump', name: 'polarbear', symbol: '$polarbear', date: 'Jan 23, 2026', marketCap: '$3,421' },
        { mint: 'H9TBTvhYbsTPnvsQ2HNvpH9YqoqXgZPbAV2sQ3W7pump', name: 'MoonDog', symbol: '$MOONDOG', date: 'Jan 23, 2026', marketCap: '$892' },
        { mint: 'KpLmNoPqRsTuVwXyZ1234567890AbCdEfGhIjKpump', name: 'RocketFuel', symbol: '$ROCKET', date: 'Jan 23, 2026', marketCap: '$1,234' },
        { mint: 'QwErTyUiOpAsDfGhJkLzXcVbNm1234567890pump', name: 'DiamondHands', symbol: '$DIAMOND', date: 'Jan 23, 2026', marketCap: '$756' },
        { mint: 'ZxCvBnMaSdFgHjKlPoIuYtReWq1234567890pump', name: 'SolanaKing', symbol: '$SOLKING', date: 'Jan 23, 2026', marketCap: '$2,109' },
        { mint: 'MnBvCxZaQwErTyUiOpLkJhGfDsA1234567890pump', name: 'CryptoWhale', symbol: '$WHALE', date: 'Jan 23, 2026', marketCap: '$1,890' }
      ]
    },
    {
      wallet: '9KhbLrGxhHwYowNoRawMjzyVFnEnmej2d5ReiGcbVa68',
      depth: 1,
      tokenCount: 1,
      label: 'Known Child Wallet',
      tokens: [
        { mint: '5jGhYP1pxD3V96kpeF3iHS5Gjusk5jtQj9ZgunQxpump', name: 'Rewards By Claude', symbol: '$RBC', date: 'Jan 23, 2026', marketCap: '$5,672' }
      ]
    },
    {
      wallet: '6vGv4ZxYEtwujYcmYpNjUmcJ8VAB22W3NJjjrGhNoQyJ',
      depth: 2,
      tokenCount: 1,
      label: 'Secondary Minter',
      tokens: [
        { mint: 'PengCoin123456789AbCdEfGhIjKlMnOpQrStpump', name: 'PengCoin', symbol: '$PENG', date: 'Jan 23, 2026', marketCap: '$987' }
      ]
    }
  ],
  familyTree: {
    wallet: 'G2YxRa6wt1qePMwfJzdXZG62ej4qaTC7YURzuh2Lwd3t',
    label: 'Parent Wallet',
    isMinter: false,
    tokensMinted: [] as string[],
    children: [
      {
        wallet: '9KhbLrGxhHwYowNoRawMjzyVFnEnmej2d5ReiGcbVa68',
        label: 'Known Child',
        isMinter: true,
        tokensMinted: ['$RBC'],
        children: []
      },
      {
        wallet: 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
        label: 'Token Factory',
        isMinter: true,
        tokensMinted: ['$skipper', '$GOODSHIT', '$Coyote', '$Monocryl', '$polarbear', '$MOONDOG', '$ROCKET', '$DIAMOND', '$SOLKING', '$WHALE'],
        children: []
      },
      {
        wallet: '6vGv4ZxYEtwujYcmYpNjUmcJ8VAB22W3NJjjrGhNoQyJ',
        label: 'Secondary Minter',
        isMinter: true,
        tokensMinted: ['$PENG'],
        children: []
      },
      {
        wallet: 'Abc123DefGhiJklMnoPqrStUvWxYz1234567890ab',
        label: 'Inactive Child',
        isMinter: false,
        tokensMinted: [] as string[],
        children: []
      }
    ]
  }
};

type TreeNode = typeof SCAN_REPORT.familyTree;

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label || 'Address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
};

const WalletAddress = ({ address, label, showFull = false }: { address: string; label?: string; showFull?: boolean }) => (
  <div className="inline-flex items-center gap-1">
    <code className="text-xs font-mono bg-muted/50 px-2 py-1 rounded">
      {showFull ? address : `${address.slice(0, 4)}...${address.slice(-4)}`}
    </code>
    <CopyButton text={address} label={label} />
    <a
      href={`https://solscan.io/account/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300"
    >
      <ExternalLink className="h-3 w-3" />
    </a>
  </div>
);

const TokenBadge = ({ token }: { token: { mint: string; name: string; symbol: string; date: string; marketCap: string; isNew?: boolean } }) => (
  <div className={`flex items-center gap-2 p-3 rounded-lg border ${token.isNew ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/40 ring-2 ring-yellow-500/30' : 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20'}`}>
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <a 
          href={`https://padre.gg/${token.mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-bold hover:underline ${token.isNew ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'}`}
        >
          {token.symbol}
        </a>
        <span className="text-sm text-muted-foreground">{token.name}</span>
        {token.isNew && (
          <Badge className="bg-yellow-500/30 text-yellow-300 border-yellow-500/50 text-[10px] px-1.5 py-0 animate-pulse">
            NEW
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {token.date}
        </span>
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" /> {token.marketCap}
        </span>
      </div>
    </div>
    <div className="flex items-center gap-1">
      <CopyButton text={token.mint} label="Token mint copied" />
      <a
        href={`https://pump.fun/coin/${token.mint}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-xs hover:from-green-500/30 hover:to-emerald-500/30 transition-colors"
      >
        <img src="/launchpad-logos/pumpfun.png" alt="pump.fun" className="w-4 h-4" />
        pump.fun
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  </div>
);

const FamilyTreeNode = ({ node, depth = 0 }: { node: TreeNode; depth?: number }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  
  return (
    <div className="relative">
      {depth > 0 && (
        <div className="absolute left-0 top-0 w-6 h-full border-l-2 border-muted-foreground/30" style={{ left: '-12px' }} />
      )}
      <div className={`flex items-start gap-2 p-3 rounded-lg border ${node.isMinter ? 'bg-amber-500/10 border-amber-500/30' : 'bg-muted/30 border-muted-foreground/20'}`}>
        {hasChildren && (
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
        {!hasChildren && <div className="w-5" />}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Wallet className={`h-4 w-4 ${node.isMinter ? 'text-amber-400' : 'text-muted-foreground'}`} />
            <WalletAddress address={node.wallet} label={node.label} />
            {node.label && (
              <Badge variant="outline" className="text-xs">{node.label}</Badge>
            )}
            {node.isMinter && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                <Coins className="h-3 w-3 mr-1" /> Minter
              </Badge>
            )}
          </div>
          
          {node.tokensMinted && node.tokensMinted.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {node.tokensMinted.map((symbol, i) => (
                <Badge key={i} variant="secondary" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                  {symbol}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {expanded && hasChildren && (
        <div className="ml-8 mt-2 space-y-2">
          {node.children.map((child, i) => (
            <FamilyTreeNode key={i} node={child as TreeNode} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export function SniffDashboard() {
  return (
    <div className="space-y-6">
      {/* Report Header */}
      <Card className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 border-orange-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-4xl">🐕</span>
              <div>
                <CardTitle className="text-2xl">SNIFF Investigation Report</CardTitle>
                <p className="text-muted-foreground">Wallet Offspring & Token Mint Analysis</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-sm px-3 py-1">
              Scan Complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Parent Wallet</p>
              <WalletAddress address={SCAN_REPORT.parentWallet} showFull />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Scan Date</p>
              <p className="font-medium">{SCAN_REPORT.scanDate}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Funding Source Alert */}
      <Card className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <div>
              <p className="font-semibold text-red-400">Funding Source Traced</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <WalletAddress address={SCAN_REPORT.fundingSource.wallet} />
                <Badge variant="destructive">{SCAN_REPORT.fundingSource.label}</Badge>
                <span className="text-sm text-muted-foreground">({SCAN_REPORT.fundingSource.amount})</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold">{SCAN_REPORT.summary.totalOffspring}</p>
                <p className="text-sm text-muted-foreground">Total Offspring</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8 text-amber-400" />
              <div>
                <p className="text-2xl font-bold">{SCAN_REPORT.summary.totalMinters}</p>
                <p className="text-sm text-muted-foreground">Active Minters</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Coins className="h-8 w-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold">{SCAN_REPORT.summary.totalTokensMinted}</p>
                <p className="text-sm text-muted-foreground">Tokens Minted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold">Depth {SCAN_REPORT.scanDepth}</p>
                <p className="text-sm text-muted-foreground">{SCAN_REPORT.summary.scanDuration}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Minters & Their Tokens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-400" />
            Minting Wallets & Their Tokens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {SCAN_REPORT.minters.map((minter, idx) => (
            <div key={idx} className="p-4 rounded-lg border border-muted-foreground/20 bg-muted/20">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <WalletAddress address={minter.wallet} />
                  <Badge variant="outline">{minter.label}</Badge>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                    Depth {minter.depth}
                  </Badge>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  {minter.tokenCount} tokens
                </Badge>
              </div>
              
              <div className="grid gap-2">
                {minter.tokens.map((token, i) => (
                  <TokenBadge key={i} token={token} />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Family Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-400" />
            Wallet Family Tree
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg border border-muted-foreground/20 bg-muted/10">
            {/* Funding Source */}
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 flex-wrap">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-400">Funded by:</span>
              <WalletAddress address={SCAN_REPORT.fundingSource.wallet} />
              <Badge variant="destructive" className="text-xs">{SCAN_REPORT.fundingSource.label}</Badge>
            </div>
            
            {/* Tree */}
            <div className="border-l-4 border-blue-500/50 pl-4">
              <FamilyTreeNode node={SCAN_REPORT.familyTree} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SniffDashboard;
