import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactFormRequest {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  cf_turnstile_token?: string;
}

// HTML escape to prevent injection
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CATEGORY_PRIORITY: Record<string, string> = {
  "Technical Support": "high",
  "Bug Report": "high",
  "Security Issue": "critical",
  "Feature Request/Feedback": "low",
  "Partnership Inquiries": "medium",
  "General Inquiry": "medium",
  "Billing/Subscription": "high",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, subject, category, message, cf_turnstile_token }: ContactFormRequest = await req.json();

    // Verify Cloudflare Turnstile token
    const turnstileSecret = Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY");
    if (turnstileSecret && cf_turnstile_token) {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: turnstileSecret, response: cf_turnstile_token }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        console.error("Turnstile verification failed:", verifyData);
        return new Response(JSON.stringify({ error: "CAPTCHA verification failed" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    } else if (turnstileSecret && !cf_turnstile_token) {
      return new Response(JSON.stringify({ error: "CAPTCHA token required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Sanitize all user inputs
    const safeName = escapeHtml(name || '');
    const safeEmail = escapeHtml(email || '');
    const safeSubject = escapeHtml(subject || '');
    const safeCategory = escapeHtml(category || '');
    const safeMessage = escapeHtml(message || '');

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Determine auto-priority from category (use raw category for lookup, safe for display)
    const priority = CATEGORY_PRIORITY[category] || "medium";

    // Check if submitter has an account (by email)
    let userId: string | null = null;
    const { data: matchedUsers } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .limit(1);
    if (matchedUsers && matchedUsers.length > 0) {
      userId = matchedUsers[0].user_id;
    }

    // Save to support_tickets table (raw values for DB, not HTML-escaped)
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        name,
        email,
        category,
        subject,
        message,
        priority,
        user_id: userId,
        metadata: { source: "contact_form" },
      })
      .select("id, ticket_number")
      .single();

    if (ticketError) {
      console.error("Failed to create ticket:", ticketError);
    }

    const ticketNum = ticket?.ticket_number || "N/A";

    // Create admin notification with ticket details
    if (ticket) {
      const priorityEmoji = priority === "critical" ? "🔴" : priority === "high" ? "🟠" : priority === "medium" ? "🟡" : "🟢";
      await supabaseAdmin.from("admin_notifications").insert({
        notification_type: "support_ticket",
        title: `🎫 New Ticket #${ticketNum}: ${safeSubject}`,
        message: `${priorityEmoji} ${priority.toUpperCase()} | ${safeCategory}\nFrom: ${safeName} (${safeEmail})\n\n${message.slice(0, 300)}${message.length > 300 ? "…" : ""}`,
        metadata: {
          ticket_id: ticket.id,
          ticket_number: ticketNum,
          category,
          priority,
          email,
          name,
        },
      });
    }

    console.warn("BLACKBOX Telegram muted — contact ticket alert logged only", { ticket_number: ticketNum });

    // Send notification to support team (using escaped values in HTML)
    const supportEmail = await resend.emails.send({
      from: "BlackBox Farm <noreply@blackbox.farm>",
      to: ["support@blackbox.farm"],
      subject: `[Ticket #${ticketNum}] ${safeCategory} - ${safeSubject}`,
      html: `
        <h2>New Support Ticket #${ticketNum}</h2>
        <p><strong>Priority:</strong> ${escapeHtml(priority.toUpperCase())}</p>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Category:</strong> ${safeCategory}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <h3>Message:</h3>
        <p>${safeMessage.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><small>Ticket created from BlackBox Farm contact form</small></p>
      `,
    });

    // Send confirmation to user (using escaped values in HTML)
    const userEmail = await resend.emails.send({
      from: "BlackBox Farm <support@blackbox.farm>",
      to: [email],
      subject: `[Ticket #${ticketNum}] We received your message - BlackBox Farm`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a14; color: #e2e8f0; padding: 30px; border-radius: 12px;">
          <div style="border-bottom: 2px solid #00e5ff30; padding-bottom: 16px; margin-bottom: 20px;">
            <h1 style="color: #00e5ff; font-size: 20px; margin: 0;">Thank you for contacting BlackBox Farm!</h1>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Ticket #${ticketNum}</p>
          </div>
          
          <p>Hi ${safeName},</p>
          <p>We've received your message and assigned it ticket number <strong>#${ticketNum}</strong>. Our team will get back to you based on the priority of your inquiry.</p>
          
          <div style="background: #111827; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p><strong>Category:</strong> ${safeCategory}</p>
            <p><strong>Subject:</strong> ${safeSubject}</p>
            <p><strong>Your message:</strong></p>
            <p style="font-style: italic; color: #94a3b8;">"${safeMessage}"</p>
          </div>
          
          <p style="color: #94a3b8; font-size: 13px;">Expected response times:</p>
          <ul style="color: #94a3b8; font-size: 13px;">
            <li>Critical/Security: 2 hours</li>
            <li>Technical Support: 12 hours</li>
            <li>General Inquiries: 24 hours</li>
            <li>Partnerships: 48 hours</li>
          </ul>
          
          <p>Best regards,<br>The BlackBox Farm Team</p>
          
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;">
          <p style="color: #475569; font-size: 11px; text-align: center;">
            BlackBox Farm · <a href="https://blackbox.farm" style="color: #00e5ff60;">blackbox.farm</a>
          </p>
        </div>
      `,
    });

    console.log("Contact emails sent, ticket created:", { ticketNum, supportEmail, userEmail });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email sent successfully",
        ticket_number: ticketNum,
      }), 
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(withRunLog('send-contact-email', handler));
