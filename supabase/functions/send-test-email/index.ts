import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // Verify the caller is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify super admin
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { templateKey, recipientEmail, subject, htmlBody } = await req.json();

    if (!recipientEmail || !templateKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing recipientEmail or templateKey" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no custom HTML body, fetch from DB
    let finalHtml = htmlBody;
    let finalSubject = subject;
    if (!finalHtml) {
      const { data: tpl } = await adminClient
        .from("email_templates")
        .select("html_body, subject")
        .eq("template_key", templateKey)
        .maybeSingle();
      if (tpl?.html_body) finalHtml = tpl.html_body;
      if (tpl?.subject) finalSubject = tpl.subject;
    }

    if (!finalHtml) {
      finalHtml = `<div style="font-family:Arial,sans-serif;padding:20px;"><h2>Test Email</h2><p>This is a test for template: <strong>${templateKey}</strong></p><p>No custom HTML body is set — this is the fallback test message.</p></div>`;
    }

    // Use Resend via RESEND_API_KEY if available, otherwise log
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "BlackBox Farm <noreply@blackbox.farm>",
          to: [recipientEmail],
          subject: `[TEST] ${finalSubject || templateKey}`,
          html: finalHtml,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        console.error("Resend error:", result);
        return new Response(JSON.stringify({ success: false, error: result.message || "Resend API error" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, emailId: result.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try subscriber-welcome edge function as a relay
    const { data, error } = await adminClient.functions.invoke("subscriber-welcome", {
      body: {
        type: "test_email",
        email: recipientEmail,
        subject: `[TEST] ${finalSubject || templateKey}`,
        htmlBody: finalHtml,
      },
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, relay: "subscriber-welcome" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-test-email error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
