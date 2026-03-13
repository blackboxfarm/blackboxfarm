// Bubble Map feature tiers — defines what each access level gets
export interface BubbleMapFeature {
  label: string;
  description: string;
  tiers: Record<string, boolean | string>;
}

export const BUBBLE_MAP_TIERS = [
  { key: 'free', label: 'Free', color: 'text-muted-foreground' },
  { key: 'auth', label: 'Logged In', color: 'text-blue-400' },
  { key: 'x_subscriber', label: 'X Sub', color: 'text-cyan-400' },
  { key: 'pro', label: 'Pro $9.99', color: 'text-primary' },
] as const;

export const BUBBLE_MAP_FEATURES: BubbleMapFeature[] = [
  {
    label: 'Daily Lookups',
    description: 'Number of entity searches per day',
    tiers: { free: '2', auth: '2', x_subscriber: '10', pro: '∞' },
  },
  {
    label: 'Graph Visualization',
    description: 'Interactive bubble/tree network view',
    tiers: { free: true, auth: true, x_subscriber: true, pro: true },
  },
  {
    label: 'Auto-Spider',
    description: 'Automatic deep spidering on search',
    tiers: { free: false, auth: false, x_subscriber: true, pro: true },
  },
  {
    label: 'Find KYC Root',
    description: 'Trace funding chain to KYC exchange origin',
    tiers: { free: false, auth: false, x_subscriber: false, pro: true },
  },
  {
    label: 'Find All Tokens',
    description: 'Discover all tokens created by connected wallets',
    tiers: { free: false, auth: false, x_subscriber: '3/day', pro: true },
  },
  {
    label: 'Deep Spider',
    description: 'Manual deep spider with full genealogy tracing',
    tiers: { free: false, auth: false, x_subscriber: false, pro: true },
  },
  {
    label: 'Node Cap',
    description: 'Maximum entities displayed in one graph',
    tiers: { free: '20', auth: '40', x_subscriber: '80', pro: '∞' },
  },
  {
    label: 'Dev Wallet Alerts',
    description: 'Notifications when known creators launch new tokens',
    tiers: { free: false, auth: false, x_subscriber: true, pro: true },
  },
  {
    label: 'Export Graph Data',
    description: 'Download mesh data as CSV/JSON',
    tiers: { free: false, auth: false, x_subscriber: false, pro: true },
  },
];
