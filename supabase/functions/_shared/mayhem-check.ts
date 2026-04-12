/**
 * Shared Mayhem Mode Check
 * 
 * Detects Mayhem Mode tokens based on program ID and supply.
 * Can use pre-fetched data to avoid redundant API calls.
 */

import { fetchPumpFunCoin } from './pumpfun-fetch.ts';

const MAYHEM_PROGRAM_ID = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e';
const MAYHEM_SUPPLY = 2000000000000000;

/**
 * Check if token data indicates Mayhem Mode.
 * Use this when you already have the coin data (avoids API call).
 */
export function isMayhemFromData(data: { total_supply?: number; program?: string | null }): boolean {
  const totalSupply = data.total_supply || 0;
  const program = data.program || null;
  return program === MAYHEM_PROGRAM_ID || totalSupply >= MAYHEM_SUPPLY;
}

/**
 * Check Mayhem Mode by fetching from pump.fun API.
 * Use this when you DON'T already have the coin data.
 */
export async function checkMayhemMode(tokenMint: string, caller: string): Promise<boolean> {
  try {
    const data = await fetchPumpFunCoin(tokenMint, caller);
    if (!data) return false;
    return isMayhemFromData(data);
  } catch {
    return false;
  }
}
