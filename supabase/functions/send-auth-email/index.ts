import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuthEmailRequest {
  email: string;
  type: 'confirmation' | 'recovery' | 'magic_link';
  token?: string;
  redirect_url?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, type, token, redirect_url }: AuthEmailRequest = await req.json();

    let subject: string;
    let html: string;

    switch (type) {
      case 'confirmation':
        subject = "Confirm your BlackBox account";
        html = `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a1a; margin: 0;">BlackBox</h1>
              <p style="color: #666; margin: 5px 0 0 0;">Volume Generation Platform</p>
            </div>
            
            <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin: 20px 0;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0;">Confirm Your Email</h2>
              <p style="color: #666; line-height: 1.6; margin: 0 0 25px 0;">
                Welcome to BlackBox! Click the button below to confirm your email address and activate your account.
              </p>
              
              <div style="text-align: center;">
                <a href="${redirect_url}" 
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; 
                          font-weight: bold; margin: 20px 0;">
                  Confirm Email Address
                </a>
              </div>
              
              <p style="color: #999; font-size: 14px; margin: 25px 0 0 0; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${redirect_url}" style="color: #667eea; word-break: break-all;">${redirect_url}</a>
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #999; font-size: 12px;">
                If you didn't create an account with BlackBox, you can safely ignore this email.
              </p>
            </div>
          </div>
        `;
        break;

      case 'recovery':
        subject = "Reset your BlackBox password";
        html = `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a1a; margin: 0;">BlackBox</h1>
              <p style="color: #666; margin: 5px 0 0 0;">Volume Generation Platform</p>
            </div>
            
            <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin: 20px 0;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0;">Reset Your Password</h2>
              <p style="color: #666; line-height: 1.6; margin: 0 0 25px 0;">
                We received a request to reset your password. Click the button below to create a new password.
              </p>
              
              <div style="text-align: center;">
                <a href="${redirect_url}" 
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; 
                          font-weight: bold; margin: 20px 0;">
                  Reset Password
                </a>
              </div>
              
              <p style="color: #999; font-size: 14px; margin: 25px 0 0 0; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${redirect_url}" style="color: #667eea; word-break: break-all;">${redirect_url}</a>
              </p>
              
              <p style="color: #999; font-size: 14px; margin: 15px 0 0 0; text-align: center;">
                This link will expire in 60 minutes for security reasons.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #999; font-size: 12px;">
                If you didn't request a password reset, you can safely ignore this email.
              </p>
            </div>
          </div>
        `;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid email type" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }

    const emailResponse = await resend.emails.send({
      from: "BlackBox <noreply@blackbox.farm>",
      to: [email],
      subject: subject,
      html: html,
    });

    console.log("Auth email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-auth-email function:", error);
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