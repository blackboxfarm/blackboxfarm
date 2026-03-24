import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(withRunLog('send-ticket-reply', async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id, ticket_number, recipient_email, recipient_name, subject, reply_message } = await req.json();

    // Send reply email
    await resend.emails.send({
      from: "BlackBox Farm Support <support@blackbox.farm>",
      to: [recipient_email],
      subject: `Re: [Ticket #${ticket_number}] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a14; color: #e2e8f0; padding: 30px; border-radius: 12px;">
          <div style="border-bottom: 2px solid #00e5ff30; padding-bottom: 16px; margin-bottom: 20px;">
            <h1 style="color: #00e5ff; font-size: 20px; margin: 0;">BlackBox Farm Support</h1>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Ticket #${ticket_number} — ${subject}</p>
          </div>
          
          <p style="color: #e2e8f0; margin-bottom: 8px;">Hi ${recipient_name},</p>
          
          <div style="background: #111827; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="color: #e2e8f0; white-space: pre-wrap; margin: 0;">${reply_message.replace(/\n/g, "<br>")}</p>
          </div>
          
          <p style="color: #94a3b8; font-size: 13px;">If you have follow-up questions, reply to this email or visit <a href="https://blackbox.farm/contact" style="color: #00e5ff;">our contact page</a>.</p>
          
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;">
          <p style="color: #475569; font-size: 11px; text-align: center;">
            BlackBox Farm · <a href="https://blackbox.farm" style="color: #00e5ff60;">blackbox.farm</a>
          </p>
        </div>
      `,
    });

    // If the ticket has a user_id, create an in-app notification for them
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("user_id")
      .eq("id", ticket_id)
      .single();

    if (ticket?.user_id) {
      // Create a user-facing notification (using admin_notifications for now with user metadata)
      await supabaseAdmin.from("admin_notifications").insert({
        notification_type: "ticket_reply",
        title: `📩 Reply to your ticket #${ticket_number}`,
        message: reply_message.slice(0, 300) + (reply_message.length > 300 ? "…" : ""),
        metadata: { ticket_id, ticket_number, user_id: ticket.user_id },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending ticket reply:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
