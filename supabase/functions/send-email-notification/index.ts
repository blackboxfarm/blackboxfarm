import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailNotificationRequest {
  to: string;
  subject: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, title, message, type = 'info', metadata = {} }: EmailNotificationRequest = await req.json();

    if (!to || !subject || !title || !message) {
      throw new Error('Missing required fields: to, subject, title, message');
    }

    const getTypeColor = (type: string) => {
      switch (type) {
        case 'success': return '#22c55e';
        case 'warning': return '#f59e0b';
        case 'error': return '#ef4444';
        default: return '#3b82f6';
      }
    };

    const getTypeIcon = (type: string) => {
      switch (type) {
        case 'success': return '✅';
        case 'warning': return '⚠️';
        case 'error': return '❌';
        default: return 'ℹ️';
      }
    };

    const emailResponse = await resend.emails.send({
      from: "BlackBox Trading <notifications@resend.dev>",
      to: [to],
      subject: subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">BlackBox Trading</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0; font-size: 16px;">Professional Trading Platform</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: center; margin-bottom: 20px; padding: 15px; background: ${getTypeColor(type)}15; border-left: 4px solid ${getTypeColor(type)}; border-radius: 4px;">
              <span style="font-size: 24px; margin-right: 12px;">${getTypeIcon(type)}</span>
              <h2 style="margin: 0; color: ${getTypeColor(type)}; font-size: 20px; font-weight: 600;">${title}</h2>
            </div>
            
            <div style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
              ${message.replace(/\n/g, '<br>')}
            </div>
            
            ${metadata.actionUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${metadata.actionUrl}" style="background: ${getTypeColor(type)}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                  ${metadata.actionText || 'View Details'}
                </a>
              </div>
            ` : ''}
            
            ${metadata.timestamp ? `
              <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
                <strong>Time:</strong> ${new Date(metadata.timestamp).toLocaleString()}
              </div>
            ` : ''}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
              This is an automated notification from BlackBox Trading.<br>
              If you did not expect this email, please contact support.
            </div>
          </div>
        </div>
      `,
    });

    console.log("Email notification sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-email-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);