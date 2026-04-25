export type MarketingSection = 'positioning' | 'persona' | 'playbook' | 'competitor' | 'message';

export interface MarketingProfile {
  id: string;
  section: MarketingSection;
  slug: string;
  title: string;
  data: Record<string, any>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const SECTION_LABELS: Record<MarketingSection, string> = {
  positioning: 'Positioning',
  persona: 'Persona',
  playbook: 'Playbook',
  competitor: 'Competitor Matrix',
  message: 'Message Snippet',
};