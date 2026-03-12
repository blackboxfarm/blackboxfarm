import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { solscanDiscoverFunders, solscanCheckAccountLabel } from '../_shared/solscan-intelligence.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Deep KYC root search: traces funding chain upward (depth 5) to find CEX/KYC roots
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { walletAddress, maxDepth } = await req.json();
    if (!walletAddress) throw new Error('walletAddress required');

    const depth = Math.min(maxDepth || 5, 8);
    console.log(`[KYCDeep] Starting depth-${depth} trace for ${walletAddress}`);

    const visited = new Set<string>();
    const chain: Array<{ wallet: string; funder: string; amountSol: number; depth: number }> = [];
    const errors: string[] = [];
    let kycRoot: string | null = null;
    let meshLinksAdded = 0;

    // Known CEX deposit/withdrawal patterns
    const CEX_WALLETS = new Set([
      // Binance hot wallets
      '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
      '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
      // Coinbase
      'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS',
      // FTX (historical)
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    ]);

    const queue: Array<{ wallet: string; depth: number }> = [{ wallet: walletAddress, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.wallet) || current.depth >= depth) continue;
      visited.add(current.wallet);

      console.log(`[KYCDeep] Tracing depth ${current.depth}: ${current.wallet.slice(0, 12)}...`);

      // Find who funded this wallet
      const funders = await solscanDiscoverFunders(current.wallet, errors);

      if (funders.length === 0 && current.depth > 0) {
        // No more funders found — this might be the KYC root
        kycRoot = current.wallet;
        console.log(`[KYCDeep] Potential KYC root found at depth ${current.depth}: ${current.wallet.slice(0, 12)}`);
      }

      for (const f of funders) {
        chain.push({
          wallet: current.wallet,
          funder: f.wallet,
          amountSol: f.amountSol,
          depth: current.depth + 1,
        });

        // Check if funder is a known CEX
        if (CEX_WALLETS.has(f.wallet)) {
          kycRoot = current.wallet; // The wallet funded by CEX is the KYC root
          console.log(`[KYCDeep] CEX-funded KYC root: ${current.wallet.slice(0, 12)} (funded by CEX ${f.wallet.slice(0, 8)})`);
        }

        // Write mesh link
        const { error } = await supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'wallet',
            source_id: f.wallet,
            linked_type: 'wallet',
            linked_id: current.wallet,
            relationship: 'funded_by',
            confidence: Math.min(95, 60 + f.amountSol * 5),
            discovered_via: 'mesh-kyc-deep-search',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });

        if (!error) meshLinksAdded++;

        // Continue tracing upward
        if (!visited.has(f.wallet) && !CEX_WALLETS.has(f.wallet)) {
          queue.push({ wallet: f.wallet, depth: current.depth + 1 });
        }
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 250));
    }

    // If we found a KYC root, mark it in the mesh
    if (kycRoot && kycRoot !== walletAddress) {
      await supabase
        .from('reputation_mesh')
        .upsert({
          source_type: 'kyc_root',
          source_id: kycRoot,
          linked_type: 'wallet',
          linked_id: walletAddress,
          relationship: 'same_kyc_root',
          confidence: 85,
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });

      meshLinksAdded++;
      
      // Also mark intermediate wallets
      for (const link of chain) {
        if (link.funder === kycRoot || link.wallet === kycRoot) continue;
        await supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'kyc_root',
            source_id: kycRoot,
            linked_type: 'wallet',
            linked_id: link.wallet,
            relationship: 'same_kyc_root',
            confidence: 70,
            discovered_via: 'mesh-kyc-deep-search',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
        meshLinksAdded++;
      }
    }

    console.log(`[KYCDeep] Done: ${chain.length} links, KYC root: ${kycRoot?.slice(0, 12) || 'not found'}`);

    return new Response(
      JSON.stringify({
        walletAddress,
        kycRoot,
        chainDepth: chain.length,
        walletsTraced: visited.size,
        meshLinksAdded,
        chain: chain.map(c => ({
          wallet: c.wallet,
          funder: c.funder,
          amountSol: c.amountSol,
          depth: c.depth,
        })),
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[KYCDeep] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
