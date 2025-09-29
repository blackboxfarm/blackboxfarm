import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CampaignNotificationRequest {
  campaignId: string;
  campaignType: 'blackbox' | 'community';
  notificationType: 'manual_start' | 'manual_restart' | 'auto_pause' | 'auto_end';
  campaignTitle?: string;
  tokenAddress?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      campaignId, 
      campaignType, 
      notificationType, 
      campaignTitle, 
      tokenAddress 
    }: CampaignNotificationRequest = await req.json();

    console.log('Processing campaign notification:', { 
      campaignId, 
      campaignType, 
      notificationType 
    });

    // Get campaign contributors/donors based on campaign type
    let recipients: any[] = [];
    let campaignDetails: any = null;

    if (campaignType === 'community') {
      // Get all contributors for this community campaign
      const { data: contributions, error: contribError } = await supabase
        .from('community_contributions')
        .select(`
          contributor_id,
          amount_sol,
          profiles!inner(display_name, user_id)
        `)
        .eq('campaign_id', campaignId)
        .eq('refunded', false);

      if (contribError) {
        console.error('Error fetching contributors:', contribError);
        throw contribError;
      }

      // Get campaign details
      const { data: campaign, error: campaignError } = await supabase
        .from('community_campaigns')
        .select('title, token_address, creator_id')
        .eq('id', campaignId)
        .single();

      if (campaignError) {
        console.error('Error fetching campaign:', campaignError);
        throw campaignError;
      }

      recipients = contributions || [];
      campaignDetails = campaign;
    } else if (campaignType === 'blackbox') {
      // For blackbox campaigns, we would need a different approach
      // since there might not be direct contributors
      // For now, we'll skip this implementation
      console.log('Blackbox campaign notifications not yet implemented');
      return new Response(
        JSON.stringify({ message: 'Blackbox campaign notifications not yet implemented' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (recipients.length === 0) {
      console.log('No recipients found for campaign:', campaignId);
      return new Response(
        JSON.stringify({ message: 'No recipients found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if manual notification is on cooldown
    if (notificationType.startsWith('manual_')) {
      const { data: cooldownCheck, error: cooldownError } = await supabase
        .rpc('check_notification_cooldown', {
          p_campaign_id: campaignId,
          p_campaign_type: campaignType,
          p_hours: 1
        });

      if (cooldownError) {
        console.error('Error checking cooldown:', cooldownError);
        throw cooldownError;
      }

      if (!cooldownCheck) {
        return new Response(
          JSON.stringify({ 
            error: 'Notification on cooldown', 
            message: 'Please wait before sending another notification' 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Prepare email content based on notification type
    const getEmailContent = (type: string) => {
      const title = campaignTitle || campaignDetails?.title || 'Campaign Update';
      const token = tokenAddress || campaignDetails?.token_address || '';
      
      switch (type) {
        case 'manual_start':
          return {
            subject: `🚀 ${title} Campaign Started!`,
            title: 'Campaign Started!',
            message: `The "${title}" campaign has been activated and is now running. Your contribution is now actively being used for trading ${token.slice(0, 8)}...${token.slice(-4)}.`,
            actionText: 'View Campaign'
          };
        case 'manual_restart':
          return {
            subject: `🔄 ${title} Campaign Restarted!`,
            title: 'Campaign Restarted!',
            message: `The "${title}" campaign has been restarted after a pause. Trading has resumed for ${token.slice(0, 8)}...${token.slice(-4)}.`,
            actionText: 'View Campaign'
          };
        case 'auto_pause':
          return {
            subject: `⏸️ ${title} Campaign Paused`,
            title: 'Campaign Paused',
            message: `The "${title}" campaign has been paused. Your funds remain safe and trading will resume when the campaign is reactivated.`,
            actionText: 'View Status'
          };
        case 'auto_end':
          return {
            subject: `✅ ${title} Campaign Completed`,
            title: 'Campaign Completed',
            message: `The "${title}" campaign has completed successfully. Thank you for your participation! Final results will be available shortly.`,
            actionText: 'View Results'
          };
        default:
          return {
            subject: `📢 ${title} Campaign Update`,
            title: 'Campaign Update',
            message: `There's an update for the "${title}" campaign.`,
            actionText: 'View Campaign'
          };
      }
    };

    const emailContent = getEmailContent(notificationType);

    // Get unique email addresses (from auth.users)
    const userIds = recipients.map(r => r.profiles.user_id);
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    const emailList = users.users
      .filter(user => userIds.includes(user.id))
      .map(user => user.email)
      .filter(email => email);

    console.log(`Sending emails to ${emailList.length} recipients`);

    // Send emails using Resend
    const emailPromises = emailList.map(async (email) => {
      try {
        const { data, error } = await resend.emails.send({
          from: 'Bump Bot <notifications@resend.dev>',
          to: [email],
          subject: emailContent.subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #1f2937; margin-bottom: 10px;">${emailContent.title}</h1>
              </div>
              
              <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0;">
                  ${emailContent.message}
                </p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://lovable.dev/projects/apxauapuusmgwbbzjgfl" 
                   style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  ${emailContent.actionText}
                </a>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
                <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 0;">
                  You received this email because you contributed to this campaign.
                  <br>
                  <a href="#" style="color: #6b7280;">Unsubscribe</a> from campaign notifications.
                </p>
              </div>
            </div>
          `,
        });

        if (error) {
          console.error('Error sending email to', email, ':', error);
          return false;
        }

        console.log('Email sent successfully to:', email);
        return true;
      } catch (error) {
        console.error('Failed to send email to', email, ':', error);
        return false;
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter(Boolean).length;

    // Record the notification in the database
    const { error: recordError } = await supabase
      .from('campaign_notifications')
      .insert({
        campaign_id: campaignId,
        campaign_type: campaignType,
        notification_type: notificationType,
        recipients_count: successCount
      });

    if (recordError) {
      console.error('Error recording notification:', recordError);
    }

    console.log(`Campaign notification completed. Sent to ${successCount}/${emailList.length} recipients`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Notification sent to ${successCount} recipients`,
        recipients_count: successCount
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error in send-campaign-notification function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to send campaign notification'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
};

serve(handler);