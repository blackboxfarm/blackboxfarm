// Tokens that get a curated, optimistic presentation on /holders:
//  - Banner #1 and Banner #2 (AdBanner positions 1 & 2) hidden
//  - BadActorAlert / security alert hidden
//  - Holder Healthscore forced to "A" green styling
// Add a mint here to apply the treatment. Manage via Super Admin curation in the future.
export const CURATED_OPTIMISTIC_TOKENS: ReadonlySet<string> = new Set<string>([
  "FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump",
]);

export function isCuratedOptimistic(mint?: string | null): boolean {
  if (!mint) return false;
  return CURATED_OPTIMISTIC_TOKENS.has(mint.trim());
}