import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RedFlag } from './useMeshGraph';

export interface CTOChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface CTODetectionResult {
  isCTO: boolean;
  changes: CTOChange[];
  detectedAt?: string;
  previousSnapshot?: string;
}

/**
 * Detects Community Takeover (CTO) events by comparing
 * current DexScreener socials against historical snapshots
 * in the token_socials_history table.
 */
export function useCTODetection() {
  const detectCTO = useCallback(async (tokenMint: string): Promise<CTODetectionResult> => {
    try {
      // 1. Get historical snapshots (ordered oldest first)
      const { data: history } = await supabase
        .from('token_socials_history')
        .select('*')
        .eq('token_mint', tokenMint)
        .order('captured_at', { ascending: true });

      if (!history || history.length < 2) {
        return { isCTO: false, changes: [] };
      }

      // 2. Compare earliest snapshot to latest
      const earliest = history[0];
      const latest = history[history.length - 1];
      const changes: CTOChange[] = [];

      // Check each social field for REPLACEMENT (not just deletion)
      const fields = ['twitter', 'telegram', 'website', 'discord'] as const;
      for (const field of fields) {
        const before = earliest[field];
        const after = latest[field];
        
        // A CTO change = the field existed before AND now has a DIFFERENT value
        // OR field was null before and now exists (new community added socials)
        if (before && after && before !== after) {
          changes.push({ field, before, after });
        } else if (!before && after && history.length > 1) {
          // New social added after initial snapshot — could be CTO adding their links
          changes.push({ field, before: '(none)', after });
        }
      }

      const isCTO = changes.length >= 2; // 2+ social changes = likely CTO

      return {
        isCTO,
        changes,
        detectedAt: latest.captured_at,
        previousSnapshot: earliest.captured_at,
      };
    } catch (err) {
      console.warn('[CTO Detection] Error:', err);
      return { isCTO: false, changes: [] };
    }
  }, []);

  const buildCTORedFlag = useCallback((result: CTODetectionResult): RedFlag | null => {
    if (!result.isCTO || result.changes.length === 0) return null;

    const changeLines = result.changes.map(c => {
      const label = c.field.charAt(0).toUpperCase() + c.field.slice(1);
      return `• ${label}: "${c.before || '(none)'}" → "${c.after}"`;
    }).join('\n');

    return {
      type: 'recycled_identity', // reuse existing type for CTO
      severity: result.changes.length >= 3 ? 'critical' : 'high',
      shortLabel: `🔄 Community Takeover (${result.changes.length} changes)`,
      explanation: `This token's social links have been REPLACED — a strong indicator of a Community Takeover (CTO).\n\nWhat changed:\n${changeLines}\n\nWhat this means:\n• The original developer likely abandoned or rugged the project\n• A new group has claimed ownership and updated all social profiles\n• While CTOs can be legitimate community rescues, they are also used by insider groups who buy the dip after a dev abandons, rebrand the socials, and pump the token to create exit liquidity\n• CRITICAL: Check if the new social accounts (Twitter, Telegram) have histories of promoting other failed tokens — this exposes "professional CTO groups" who repeatedly extract value from abandoned projects\n\nFirst snapshot: ${result.previousSnapshot ? new Date(result.previousSnapshot).toLocaleDateString() : 'Unknown'}\nChange detected: ${result.detectedAt ? new Date(result.detectedAt).toLocaleDateString() : 'Unknown'}`,
    };
  }, []);

  return { detectCTO, buildCTORedFlag };
}
