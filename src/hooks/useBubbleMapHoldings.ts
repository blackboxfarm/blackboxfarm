import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { MeshNode } from './useMeshGraph';
import { supabase } from '@/integrations/supabase/client';

interface HoldingInfo {
  walletAddress: string;
  balance: number;
  percentage: number;
}

interface HoldingsState {
  isLoading: boolean;
  holdings: Map<string, HoldingInfo>;
  showOverlay: boolean;
  totalSupply: number;
  tokenMint: string | null;
}

/**
 * Fetches token holdings for wallet nodes in the bubble map
 * Uses Helius DAS API to get balances for each wallet against a specific token
 */
export function useBubbleMapHoldings() {
  const [state, setState] = useState<HoldingsState>({
    isLoading: false,
    holdings: new Map(),
    showOverlay: false,
    totalSupply: 0,
    tokenMint: null,
  });
  const holdingsRef = useRef<Map<string, HoldingInfo>>(new Map());

  const fetchHoldings = useCallback(async (nodes: MeshNode[], tokenMint: string) => {
    const walletNodes = nodes.filter(n => n.type === 'wallet');
    if (walletNodes.length === 0) {
      toast.error('No wallet nodes found to check holdings');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, tokenMint }));
    toast.info(`📊 Fetching holdings for ${walletNodes.length} wallets...`);

    try {
      // First get total supply from DexScreener
      const dexRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`);
      let totalSupply = 1_000_000_000; // Default 1B for pump.fun tokens
      if (dexRes.ok) {
        const pairs = await dexRes.json();
        if (Array.isArray(pairs) && pairs[0]?.fdv && pairs[0]?.priceUsd) {
          totalSupply = pairs[0].fdv / parseFloat(pairs[0].priceUsd);
        }
      }

      const newHoldings = new Map<string, HoldingInfo>();

      // Fetch balances via Helius DAS getAssetsByOwner for each wallet
      // Batch in groups of 5 to avoid rate limiting
      for (let i = 0; i < walletNodes.length; i += 5) {
        const batch = walletNodes.slice(i, i + 5);
        const promises = batch.map(async (node) => {
          const walletAddress = node.fullId || node.id.split(':').slice(1).join(':');
          try {
            // Use Helius DAS to get token accounts
            const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=';
            // Try using the Supabase edge function for Helius calls
            const response = await fetch(`https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/helius-rpc-proxy`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU`,
              },
              body: JSON.stringify({
                method: 'getAssetsByOwner',
                params: {
                  ownerAddress: walletAddress,
                  displayOptions: { showFungible: true },
                },
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const assets = data?.result?.items || [];
              const tokenAsset = assets.find((a: any) => a.id === tokenMint);
              const balance = tokenAsset?.token_info?.balance
                ? tokenAsset.token_info.balance / Math.pow(10, tokenAsset.token_info.decimals || 6)
                : 0;

              if (balance > 0) {
                const percentage = (balance / totalSupply) * 100;
                newHoldings.set(node.id, {
                  walletAddress,
                  balance,
                  percentage,
                });
              }
            }
          } catch (err) {
            console.warn(`[Holdings] Failed for ${walletAddress.slice(0, 8)}:`, err);
          }
        });

        await Promise.allSettled(promises);
        // Small delay between batches
        if (i + 5 < walletNodes.length) await new Promise(r => setTimeout(r, 200));
      }

      holdingsRef.current = newHoldings;
      setState({
        isLoading: false,
        holdings: newHoldings,
        showOverlay: true,
        totalSupply,
        tokenMint,
      });

      const holdersWithBalance = newHoldings.size;
      const totalPct = Array.from(newHoldings.values()).reduce((sum, h) => sum + h.percentage, 0);
      toast.success(`📊 Found ${holdersWithBalance} wallets holding token (${totalPct.toFixed(2)}% total supply)`);
    } catch (err: any) {
      toast.error(`Holdings fetch failed: ${err.message}`);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const toggleOverlay = useCallback(() => {
    setState(prev => ({ ...prev, showOverlay: !prev.showOverlay }));
  }, []);

  const clearHoldings = useCallback(() => {
    holdingsRef.current = new Map();
    setState({
      isLoading: false,
      holdings: new Map(),
      showOverlay: false,
      totalSupply: 0,
      tokenMint: null,
    });
  }, []);

  return {
    ...state,
    fetchHoldings,
    toggleOverlay,
    clearHoldings,
  };
}
