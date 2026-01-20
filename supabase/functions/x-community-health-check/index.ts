/**
 * X Community Health Check
 * Scheduled function to validate all tracked communities for deletion
 * Run via cron (e.g., daily) to detect deleted communities
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { quickCommunityCheck } from "../_shared/x-community-validator.ts";
import { alertAndLogCommunityDeletion, CommunityAlertInfo } from "../_shared/x-community-alerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheckResult {
  communityId: string;
  status: 'active' | 'deleted' | 'error';
  alertSent?: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { limit = 50, force = false } = await req.json().catch(() => ({}));

    console.log(`[Health Check] Starting X Community health check (limit: ${limit}, force: ${force})`);

    // Fetch active communities that haven't been checked recently
    const checkThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    
    let query = supabase
      .from('x_communities')
      .select('*')
      .eq('is_deleted', false)
      .order('last_existence_check_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (!force) {
      query = query.or(`last_existence_check_at.is.null,last_existence_check_at.lt.${checkThreshold}`);
    }

    const { data: communities, error: fetchError } = await query;

    if (fetchError) {
      console.error('[Health Check] Failed to fetch communities:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch communities', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!communities || communities.length === 0) {
      console.log('[Health Check] No communities to check');
      return new Response(
        JSON.stringify({ success: true, message: 'No communities need checking', checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Health Check] Checking ${communities.length} communities`);

    const results: HealthCheckResult[] = [];
    let deletedCount = 0;
    let alertsSent = 0;

    for (const community of communities) {
      try {
        // Add delay between checks to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        const checkResult = await quickCommunityCheck(community.community_id);
        
        // Update last check timestamp
        await supabase.from('x_communities').update({
          last_existence_check_at: new Date().toISOString(),
        }).eq('community_id', community.community_id);

        if (checkResult.isDeleted) {
          console.warn(`[Health Check] Community ${community.community_id} is DELETED!`);
          deletedCount++;

          // Update deletion status
          const newFailCount = (community.failed_scrape_count || 0) + 1;
          
          // Only mark as deleted after 2+ consecutive failures OR confirmed 404
          const shouldMarkDeleted = checkResult.httpStatus === 404 || newFailCount >= 2;
          
          if (shouldMarkDeleted) {
            await supabase.from('x_communities').update({
              is_deleted: true,
              deleted_detected_at: new Date().toISOString(),
              scrape_status: 'deleted',
              failed_scrape_count: newFailCount,
            }).eq('community_id', community.community_id);

            // Send alert if not already sent
            if (!community.deletion_alert_sent) {
              const alertInfo: CommunityAlertInfo = {
                communityId: community.community_id,
                communityUrl: community.community_url || `https://x.com/i/communities/${community.community_id}`,
                communityName: community.name,
                linkedTokens: community.linked_token_mints || [],
                adminUsernames: community.admin_usernames || [],
                moderatorUsernames: community.moderator_usernames || [],
                memberCount: community.member_count,
                detectedAt: new Date().toISOString(),
              };

              const { alerted } = await alertAndLogCommunityDeletion(supabase, alertInfo);
              
              if (alerted) {
                alertsSent++;
                await supabase.from('x_communities').update({
                  deletion_alert_sent: true,
                }).eq('community_id', community.community_id);
              }

              results.push({
                communityId: community.community_id,
                status: 'deleted',
                alertSent: alerted,
              });
            } else {
              results.push({
                communityId: community.community_id,
                status: 'deleted',
                alertSent: false,
              });
            }
          } else {
            // Increment fail count but don't mark deleted yet
            await supabase.from('x_communities').update({
              failed_scrape_count: newFailCount,
            }).eq('community_id', community.community_id);

            results.push({
              communityId: community.community_id,
              status: 'error',
              error: `Potential deletion (fail count: ${newFailCount})`,
            });
          }
        } else {
          // Community is active - reset fail count
          if (community.failed_scrape_count > 0) {
            await supabase.from('x_communities').update({
              failed_scrape_count: 0,
            }).eq('community_id', community.community_id);
          }

          results.push({
            communityId: community.community_id,
            status: 'active',
          });
        }
      } catch (error) {
        console.error(`[Health Check] Error checking ${community.community_id}:`, error);
        results.push({
          communityId: community.community_id,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`[Health Check] Complete. Checked: ${results.length}, Deleted: ${deletedCount}, Alerts: ${alertsSent}`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: results.length,
        deleted: deletedCount,
        alertsSent,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('[Health Check] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
