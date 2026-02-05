/**
 * X Community Alert System
 * Sends notifications when X Communities are deleted
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { broadcastToBlackBox } from "./telegram-broadcast.ts";

export interface CommunityAlertInfo {
  communityId: string;
  communityUrl: string;
  communityName?: string;
  linkedTokens: string[];
  adminUsernames: string[];
  moderatorUsernames?: string[];
  memberCount?: number;
  detectedAt: string;
}

/**
 * Format deletion alert message for Telegram
 */
function formatDeletionAlert(info: CommunityAlertInfo): string {
  const tokenList = info.linkedTokens.length > 0
    ? info.linkedTokens.slice(0, 5).map(t => `\`${t.slice(0, 8)}...${t.slice(-4)}\``).join('\n  ')
    : 'None tracked';

  const adminList = info.adminUsernames.length > 0
    ? info.adminUsernames.slice(0, 5).map(u => `@${u}`).join(', ')
    : 'Unknown';

  const modList = info.moderatorUsernames && info.moderatorUsernames.length > 0
    ? info.moderatorUsernames.slice(0, 3).map(u => `@${u}`).join(', ')
    : 'None';

  const communityDisplay = info.communityName 
    ? `${info.communityName} (${info.communityId})`
    : info.communityId;

  return `🚨 *X COMMUNITY DELETED* 🚨

*Community:* ${communityDisplay}
*URL:* ${info.communityUrl}
*Last Known Members:* ${info.memberCount || 'Unknown'}

*Admins:* ${adminList}
*Mods:* ${modList}

*Linked Tokens:*
  ${tokenList}

*Detected:* ${new Date(info.detectedAt).toUTCString()}

⚠️ This community was deleted by its owners. Linked tokens may be abandoned or rugging.`;
}

/**
 * Send community deletion alert to BLACKBOX Telegram group
 */
export async function sendCommunityDeletionAlert(
  supabase: SupabaseClient,
  info: CommunityAlertInfo
): Promise<boolean> {
  try {
    const message = formatDeletionAlert(info);
    console.log(`[X Community Alert] Sending deletion alert for community ${info.communityId}`);

    const results = await broadcastToBlackBox(supabase, message);
    const success = results.some(r => r.success);
    
    if (success) {
      console.log('[X Community Alert] ✓ Alert sent to BLACKBOX');
    } else {
      console.error('[X Community Alert] All delivery methods failed');
    }
    
    return success;
  } catch (error) {
    console.error('[X Community Alert] Error sending alert:', error);
    return false;
  }
}

/**
 * Record alert in database and send notification
 */
export async function alertAndLogCommunityDeletion(
  supabase: SupabaseClient,
  info: CommunityAlertInfo
): Promise<{ alerted: boolean; logged: boolean }> {
  let alerted = false;
  let logged = false;

  // Send Telegram alert
  alerted = await sendCommunityDeletionAlert(supabase, info);

  // Log to activity or a dedicated table if needed
  try {
    await supabase.from('activity_logs').insert({
      log_level: 'warn',
      message: `X Community deleted: ${info.communityId}`,
      metadata: {
        type: 'x_community_deletion',
        communityId: info.communityId,
        communityUrl: info.communityUrl,
        adminUsernames: info.adminUsernames,
        linkedTokens: info.linkedTokens,
        memberCount: info.memberCount,
        alertSent: alerted,
      },
    });
    logged = true;
  } catch (e) {
    console.warn('[X Community Alert] Failed to log activity:', e);
  }

  return { alerted, logged };
}
