/**
 * X Community Alert System
 * Sends notifications when X Communities are deleted
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLACKBOX_TG_GROUP_ID = -5274739643;

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

    // Try MTProto first (more reliable)
    try {
      const { error: mtprotoError } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: {
          action: 'send_message',
          chatId: BLACKBOX_TG_GROUP_ID,
          message: message,
        },
      });

      if (!mtprotoError) {
        console.log('[X Community Alert] Sent via MTProto');
        return true;
      }
      console.warn('[X Community Alert] MTProto failed:', mtprotoError);
    } catch (e) {
      console.warn('[X Community Alert] MTProto exception:', e);
    }

    // Fallback to bot webhook
    try {
      const { error: botError } = await supabase.functions.invoke('telegram-bot-webhook', {
        body: {
          action: 'send_message',
          chat_id: BLACKBOX_TG_GROUP_ID,
          text: message,
          parse_mode: 'Markdown',
        },
      });

      if (!botError) {
        console.log('[X Community Alert] Sent via bot webhook');
        return true;
      }
      console.warn('[X Community Alert] Bot webhook failed:', botError);
    } catch (e) {
      console.warn('[X Community Alert] Bot webhook exception:', e);
    }

    console.error('[X Community Alert] All delivery methods failed');
    return false;
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
