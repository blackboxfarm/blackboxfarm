import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SupabaseAuthWebhook {
  user: {
    email: string;
    id: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log the entire payload to understand the structure
    const body = await req.text();
    console.log("Received webhook payload:", body);
    
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    console.log("Parsed payload:", JSON.stringify(payload, null, 2));

    // Handle different possible payload structures
    let email, type, redirect_url;
    
    if (payload.user && payload.email_data) {
      // Webhook format
      email = payload.user.email;
      type = payload.email_data.email_action_type === 'signup' ? 'confirmation' : 
            payload.email_data.email_action_type === 'recovery' ? 'recovery' : 
            payload.email_data.email_action_type;
      redirect_url = payload.email_data.redirect_to;
    } else if (payload.email && payload.type) {
      // Direct call format
      email = payload.email;
      type = payload.type;
      redirect_url = payload.redirect_url;
    } else {
      console.error("Unknown payload structure:", payload);
      return new Response(JSON.stringify({ error: "Unknown payload structure" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    console.log(`Processing email: ${email}, type: ${type}, redirect: ${redirect_url}`);

    let subject: string;
    let html: string;

    switch (type) {
      case 'confirmation':
      case 'signup':
        subject = "Welcome to BlackBox - Confirm Your Account";
        
        // Convert the redirect URL to use blackbox.farm instead of lovable.dev
        const productionRedirectUrl = redirect_url.replace(
          /https:\/\/lovable\.dev\/projects\/[^\/]+/,
          'https://blackbox.farm/auth'
        );
        
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to BlackBox</title>
          </head>
          <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); min-height: 100vh;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table width="600" cellpadding="0" cellspacing="0" style="background: #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.4); border: 1px solid #1e293b;">
                    
                    <!-- Header with BlackBox Branding -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%); padding: 50px 40px; text-align: center; position: relative;">
                        <!-- BlackBox Logo/Brand -->
                        <div style="background: rgba(0,0,0,0.2); border-radius: 16px; padding: 24px; display: inline-block; margin-bottom: 24px; border: 2px solid rgba(255,255,255,0.1);">
                          <h1 style="color: #ffffff; font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">⚫ BlackBox</h1>
                        </div>
                        <p style="color: rgba(255,255,255,0.95); font-size: 20px; margin: 0; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.3);">Professional Volume Generation</p>
                        <p style="color: rgba(255,255,255,0.8); font-size: 16px; margin: 8px 0 0 0; font-weight: 400;">Solana Trading Platform</p>
                      </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 50px 40px; background: #0f172a;">
                        <h2 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; text-align: center;">Welcome to BlackBox!</h2>
                        
                        <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; text-align: center;">
                          Thank you for joining the most advanced Solana volume generation platform. You're one step away from accessing institutional-grade trading tools.
                        </p>
                        
                        <!-- Next Steps -->
                        <div style="background: #1e293b; border-left: 4px solid #4f46e5; padding: 24px; margin: 32px 0; border-radius: 12px; border: 1px solid #334155;">
                          <h3 style="color: #f1f5f9; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">🚀 What happens next:</h3>
                          <ul style="color: #cbd5e1; font-size: 15px; line-height: 1.7; margin: 0; padding-left: 24px; list-style: none;">
                            <li style="margin: 8px 0; position: relative; padding-left: 8px;">✓ Click the confirmation button below</li>
                            <li style="margin: 8px 0; position: relative; padding-left: 8px;">✓ Complete your profile setup</li>
                            <li style="margin: 8px 0; position: relative; padding-left: 8px;">✓ Choose your trading plan</li>
                            <li style="margin: 8px 0; position: relative; padding-left: 8px;">✓ Start generating volume immediately</li>
                          </ul>
                        </div>
                        
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 48px 0;">
                          <a href="${productionRedirectUrl}" 
                             style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%); 
                                    color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 12px; 
                                    font-weight: 700; font-size: 16px; box-shadow: 0 10px 30px rgba(79, 70, 229, 0.4);
                                    transition: all 0.3s ease; border: 2px solid rgba(255,255,255,0.1);
                                    text-transform: uppercase; letter-spacing: 0.5px;">
                            🔐 Confirm Your Account
                          </a>
                        </div>
                        
                        <!-- Security Notice -->
                        <div style="background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 24px; margin: 32px 0;">
                          <p style="color: #ef4444; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">🔒 Security Notice</p>
                          <p style="color: #fca5a5; font-size: 14px; line-height: 1.6; margin: 0;">
                            This confirmation link expires in 24 hours for your security. If you didn't create this account, please ignore this email.
                          </p>
                        </div>
                        
                        <!-- Backup Link -->
                        <div style="text-align: center; margin-top: 32px; background: #1e293b; padding: 20px; border-radius: 8px;">
                          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 12px 0;">
                            Having trouble with the button? Copy and paste this link:
                          </p>
                          <p style="background: #334155; padding: 12px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 11px; color: #e2e8f0; word-break: break-all; margin: 0; border: 1px solid #475569;">
                            ${productionRedirectUrl}
                          </p>
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background: #0f172a; padding: 32px 40px; border-top: 1px solid #1e293b;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="text-align: center;">
                              <p style="color: #64748b; font-size: 15px; margin: 0 0 16px 0; font-weight: 600;">BlackBox Farm</p>
                              <p style="color: #475569; font-size: 12px; line-height: 1.6; margin: 0;">
                                Professional Solana Volume Generation | Enterprise Trading Solutions<br>
                                This email was sent to ${email} because you signed up for BlackBox.<br>
                                Visit <a href="https://blackbox.farm" style="color: #4f46e5; text-decoration: none; font-weight: 600;">blackbox.farm</a> for support or questions.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
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
        console.error("Invalid email type:", type);
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

    console.log("Email sent successfully:", emailResponse);

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