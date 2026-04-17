/**
 * FlipIt Pre-Sell Reconciliation
 *
 * Single source of truth for "what does the wallet ACTUALLY hold right now?"
 * Called before any sell executes (manual / linked-group / auto-TP) to:
 *   1. Fetch real on-chain balance via Helius DAS
 *   2. Detect SPL vs Token-2022 program
 *   3. Patch the DB row if quantity drifted (>1%)
 *   4. Mark position as ghost if on-chain balance is 0
 *
 * Returns the reconciled raw amount + token program so the swap builder
 * uses the truth, not stale DB data.
 */
import { getHeliusRpcUrl } from './helius-client.ts';

export type ReconcileResult =
  | {
      ok: true;
      onChainRaw: string;
      onChainUi: number;
      tokenProgram: 'spl-token' | 'spl-token-2022' | 'unknown';
      driftDetected: boolean;
      patched: boolean;
    }
  | { ok: false; reason: 'GHOST_POSITION' | 'DAS_FAILED'; details?: string };

interface ReconcileArgs {
  walletPubkey: string;
  tokenMint: string;
  positionId: string;
  storedRaw: string | null;
  storedUi: number | null;
  supabase: any;
  /** Tolerance for drift before we patch the DB (default 1%) */
  driftTolerancePct?: number;
}

const HELIUS_TIMEOUT_MS = 12_000;

export async function reconcilePositionBalance(args: ReconcileArgs): Promise<ReconcileResult> {
  const { walletPubkey, tokenMint, positionId, storedRaw, storedUi, supabase } = args;
  const tolerance = args.driftTolerancePct ?? 1;

  let assets: any[] = [];
  let page = 1;
  try {
    const rpcUrl = getHeliusRpcUrl();
    while (true) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'reconcile',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletPubkey,
            page,
            limit: 1000,
            displayOptions: { showFungible: true },
          },
        }),
        signal: AbortSignal.timeout(HELIUS_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { ok: false, reason: 'DAS_FAILED', details: `HTTP ${res.status}` };
      }
      const json = await res.json();
      const items = json?.result?.items || [];
      assets = assets.concat(items);
      if (items.length < 1000) break;
      page++;
      if (page > 5) break; // hard cap — 5000 tokens is more than enough
    }
  } catch (e: any) {
    return { ok: false, reason: 'DAS_FAILED', details: String(e?.message || e) };
  }

  // Find the asset for this mint
  const asset = assets.find((a) => a?.id === tokenMint);

  if (!asset) {
    // Position thinks we hold it, chain says no → ghost
    await supabase
      .from('flip_positions')
      .update({
        ghost_position: true,
        needs_reconciliation: true,
        last_chain_sync_at: new Date().toISOString(),
        error_code: 'insufficient_balance',
      })
      .eq('id', positionId);
    return { ok: false, reason: 'GHOST_POSITION' };
  }

  const tokenInfo = asset.token_info || {};
  const balance = String(tokenInfo.balance || '0');
  const decimals = Number(tokenInfo.decimals || 0);
  const onChainUi = decimals > 0 ? Number(balance) / Math.pow(10, decimals) : Number(balance);

  // Detect token program
  let tokenProgram: 'spl-token' | 'spl-token-2022' | 'unknown' = 'unknown';
  const tokenProgramId = String(tokenInfo.token_program || asset.token_info?.token_program || '');
  if (tokenProgramId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
    tokenProgram = 'spl-token-2022';
  } else if (tokenProgramId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
    tokenProgram = 'spl-token';
  }

  if (onChainUi <= 0 || balance === '0') {
    await supabase
      .from('flip_positions')
      .update({
        ghost_position: true,
        needs_reconciliation: true,
        last_chain_sync_at: new Date().toISOString(),
        token_program: tokenProgram,
        error_code: 'insufficient_balance',
      })
      .eq('id', positionId);
    return { ok: false, reason: 'GHOST_POSITION' };
  }

  // Compare drift
  let driftDetected = false;
  let patched = false;
  const storedNum = Number(storedUi || 0);
  if (storedNum > 0) {
    const driftPct = Math.abs((onChainUi - storedNum) / storedNum) * 100;
    if (driftPct > tolerance) driftDetected = true;
  } else {
    driftDetected = true; // No stored quantity → always patch
  }

  // Always patch raw if it doesn't look like atomic units (sniffs the $coin.ai-style decimal bug)
  const rawLooksAtomic = typeof storedRaw === 'string' && /^\d+$/.test(storedRaw) && storedRaw === String(BigInt(storedRaw));
  if (!rawLooksAtomic) driftDetected = true;

  const updateFields: Record<string, any> = {
    last_chain_sync_at: new Date().toISOString(),
    token_program: tokenProgram,
    ghost_position: false,
    needs_reconciliation: false,
  };

  if (driftDetected) {
    updateFields.quantity_tokens_raw = balance;
    updateFields.quantity_tokens = onChainUi;
    if (decimals > 0) updateFields.token_decimals = decimals;
    patched = true;
  }

  await supabase.from('flip_positions').update(updateFields).eq('id', positionId);

  return {
    ok: true,
    onChainRaw: balance,
    onChainUi,
    tokenProgram,
    driftDetected,
    patched,
  };
}

/**
 * Map raw swap error strings → structured error_code enum
 * so the dashboard can show the right hint and auto-retry can decide.
 */
export function classifySwapError(errMsg: string): {
  code: 'slippage' | 'no_route' | 'insufficient_balance' | 'program_mismatch' | 'quote_unavailable' | 'unknown';
  retryable: boolean;
  suggestHigherSlippage: boolean;
  suggestSmallerSize: boolean;
} {
  const m = (errMsg || '').toLowerCase();

  if (m.includes('6024') || m.includes('slippage') || m.includes('slippagetolerance')) {
    return { code: 'slippage', retryable: true, suggestHigherSlippage: true, suggestSmallerSize: false };
  }
  if (m.includes('route_not_found') || m.includes('no route') || m.includes('no_route')) {
    return { code: 'no_route', retryable: true, suggestHigherSlippage: false, suggestSmallerSize: true };
  }
  if (m.includes('insufficient') || m.includes('no balance') || m.includes('no token balance')) {
    return { code: 'insufficient_balance', retryable: false, suggestHigherSlippage: false, suggestSmallerSize: false };
  }
  if (m.includes('token-2022') || m.includes('token2022') || m.includes('program mismatch') || m.includes('invalidprogram')) {
    return { code: 'program_mismatch', retryable: false, suggestHigherSlippage: false, suggestSmallerSize: false };
  }
  if (m.includes('quote_unavailable') || m.includes('no quote')) {
    return { code: 'quote_unavailable', retryable: true, suggestHigherSlippage: true, suggestSmallerSize: true };
  }
  return { code: 'unknown', retryable: false, suggestHigherSlippage: false, suggestSmallerSize: false };
}
