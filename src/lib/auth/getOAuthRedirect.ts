/**
 * Returns the canonical redirect URL for OAuth flows.
 * Uses blackbox.farm when running on production, otherwise uses current origin.
 */
export function getOAuthRedirectUrl(): string {
  const host = window.location.hostname;
  const isProduction = host === 'blackbox.farm' || host === 'www.blackbox.farm';
  const origin = isProduction ? 'https://blackbox.farm' : window.location.origin;
  return `${origin}/`;
}
