import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { tokenMint, creatorWallet, riskLevel, developerProfile } = await req.json();

    console.log(`Processing high-risk token alert for ${tokenMint}`);

    // Only send alerts for high and critical risk tokens
    if (!['high', 'critical'].includes(riskLevel)) {
      console.log(`Risk level ${riskLevel} does not warrant alert`);
      return new Response(
        JSON.stringify({ message: 'Risk level does not warrant alert' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all super admins to notify
    const { data: superAdmins, error: adminError } = await supabase.rpc('get_super_admin_ids');
    
    if (adminError) {
      console.error('Error fetching super admins:', adminError);
      throw adminError;
    }

    if (!superAdmins || superAdmins.length === 0) {
      console.log('No super admins found to notify');
      return new Response(
        JSON.stringify({ message: 'No super admins to notify' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create notifications for all super admins
    const notifications = superAdmins.map((adminId: string) => ({
      user_id: adminId,
      type: riskLevel === 'critical' ? 'alert' : 'warning',
      title: riskLevel === 'critical' 
        ? '🚨 CRITICAL: Blacklisted Developer Active' 
        : '⚠️ High-Risk Developer Token Detected',
      message: `Token ${tokenMint.slice(0, 8)}... created by ${developerProfile?.displayName || 'known developer'} (${creatorWallet.slice(0, 8)}...). Risk: ${riskLevel.toUpperCase()}. ${developerProfile?.stats?.rugPulls || 0} rug pulls detected.`,
      metadata: {
        tokenMint,
        creatorWallet,
        riskLevel,
        developerName: developerProfile?.displayName,
        reputationScore: developerProfile?.risk?.score,
        trustLevel: developerProfile?.risk?.trustLevel,
        rugPulls: developerProfile?.stats?.rugPulls,
        timestamp: new Date().toISOString()
      }
    }));

    const { error: notifyError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (notifyError) {
      console.error('Error creating notifications:', notifyError);
      throw notifyError;
    }

    console.log(`Created ${notifications.length} alert notifications for high-risk token`);

    // Log the alert to a separate table for tracking
    const { error: logError } = await supabase
      .from('developer_alerts')
      .insert({
        token_mint: tokenMint,
        creator_wallet: creatorWallet,
        risk_level: riskLevel,
        developer_id: developerProfile?.profile?.id,
        alert_type: riskLevel === 'critical' ? 'blacklisted_developer' : 'high_risk_developer',
        metadata: {
          reputationScore: developerProfile?.risk?.score,
          trustLevel: developerProfile?.risk?.trustLevel,
          stats: developerProfile?.stats
        }
      });

    if (logError && logError.code !== '42P01') { // Ignore if table doesn't exist yet
      console.error('Error logging alert:', logError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        notificationsSent: notifications.length,
        riskLevel,
        tokenMint 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in alert-high-risk-token function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
