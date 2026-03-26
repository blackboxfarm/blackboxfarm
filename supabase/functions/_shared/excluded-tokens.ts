/**
 * Infrastructure / Blockchain Native tokens that should NEVER be posted about.
 * These are core protocol coins, not meme tokens.
 * Add mint addresses here to globally exclude from all posting pipelines.
 */

export const EXCLUDED_INFRASTRUCTURE_MINTS = new Set([
  // Jupiter (JUP)
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  // Raydium (RAY)
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  // Solana (wSOL)
  'So11111111111111111111111111111111111111112',
  // USDC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // USDT
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  // Marinade (MNDE)
  'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
  // Orca (ORCA)
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  // Meteora (MET)
  'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m',
  // Jito (JTO)
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  // Pyth (PYTH)
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  // Bonk (BONK) - established chain token
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
]);

/** Quick check — is this mint an infrastructure/chain-native token? */
export function isInfrastructureToken(mint: string): boolean {
  return EXCLUDED_INFRASTRUCTURE_MINTS.has(mint);
}
