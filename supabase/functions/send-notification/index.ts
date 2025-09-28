import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'email' | 'push';
  to: string;
  subject: string;
  message: string;
  notificationType: 'campaign' | 'transaction' | 'wallet' | 'security' | 'system';
  level: 'info' | 'success' | 'warning' | 'error';
  data?: any;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const { type, to, subject, message, notificationType, level, data }: NotificationRequest = await req.json();

    console.log(`Sending ${type} notification:`, { to, subject, notificationType, level });

    if (type === 'email') {
      // Send email notification
      const emailResponse = await resend.emails.send({
        from: "BlackBox Farm <notifications@resend.dev>",
        to: [to],
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox Logo" style="width: 48px; height: 48px; margin-bottom: 12px; object-fit: contain;" />
              <h1 style="color: white; margin: 0;">BlackBox Farm</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <h2 style="color: #333; margin-top: 0;">${subject}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              ${data ? `<div style="background: white; padding: 15px; border-radius: 5px; margin-top: 15px;">
                <pre style="margin: 0; font-size: 12px; color: #555;">${JSON.stringify(data, null, 2)}</pre>
              </div>` : ''}
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p style="font-size: 12px; color: #999; margin: 0;">
                  This is an automated notification from BlackBox Farm.
                </p>
              </div>
            </div>
          </div>
        `,
      });

      console.log("Email sent successfully:", emailResponse);

      return new Response(JSON.stringify({ success: true, emailResponse }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // For push notifications, we would integrate with a service like OneSignal or FCM
    // For now, just return success
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Push notification would be sent here" 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error("Error in send-notification function:", error);
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