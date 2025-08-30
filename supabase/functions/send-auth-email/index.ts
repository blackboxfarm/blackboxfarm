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
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to BlackBox</title>
          </head>
          <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 60px 40px; text-align: center; position: relative;">
                        <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; display: inline-block; margin-bottom: 20px;">
                          <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">BlackBox</h1>
                        </div>
                        <p style="color: rgba(255,255,255,0.9); font-size: 18px; margin: 0; font-weight: 500;">Volume Generation Platform</p>
                        <div style="position: absolute; top: -10px; right: -10px; width: 60px; height: 60px; background: rgba(255,255,255,0.1); border-radius: 50%; opacity: 0.3;"></div>
                        <div style="position: absolute; bottom: -15px; left: -15px; width: 80px; height: 80px; background: rgba(255,255,255,0.05); border-radius: 50%; opacity: 0.5;"></div>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 50px 40px;">
                        <h2 style="color: #1a1a1a; font-size: 28px; font-weight: 600; margin: 0 0 20px 0; text-align: center;">Welcome to BlackBox!</h2>
                        
                        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center;">
                          Thank you for joining the most advanced Solana volume generation platform. You're one step away from accessing institutional-grade trading tools.
                        </p>
                        
                        <div style="background: #f8fafc; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 8px;">
                          <h3 style="color: #2d3748; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">What happens next:</h3>
                          <ul style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                            <li>Click the confirmation button below</li>
                            <li>Complete your profile setup</li>
                            <li>Choose your trading plan</li>
                            <li>Start generating volume immediately</li>
                          </ul>
                        </div>
                        
                        <div style="text-align: center; margin: 40px 0;">
                          <a href="${redirect_url}" 
                             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                    color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; 
                                    font-weight: 600; font-size: 16px; box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
                                    transition: all 0.3s ease;">
                            Confirm Your Account
                          </a>
                        </div>
                        
                        <div style="background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; padding: 20px; margin: 30px 0;">
                          <p style="color: #c53030; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">🔒 Security Notice</p>
                          <p style="color: #742a2a; font-size: 14px; line-height: 1.5; margin: 0;">
                            This confirmation link expires in 24 hours for your security. If you didn't create this account, please ignore this email.
                          </p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px;">
                          <p style="color: #718096; font-size: 14px; margin: 0 0 15px 0;">
                            Having trouble with the button? Copy and paste this link:
                          </p>
                          <p style="background: #f7fafc; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #4a5568; word-break: break-all; margin: 0;">
                            ${redirect_url}
                          </p>
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8fafc; padding: 30px 40px; border-top: 1px solid #e2e8f0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="text-align: center;">
                              <p style="color: #718096; font-size: 14px; margin: 0 0 15px 0; font-weight: 600;">BlackBox Farm</p>
                              <p style="color: #a0aec0; font-size: 12px; line-height: 1.5; margin: 0;">
                                Professional Solana Volume Generation | Enterprise Trading Solutions<br>
                                This email was sent to ${email} because you signed up for BlackBox.<br>
                                Visit <a href="https://blackbox.farm" style="color: #667eea; text-decoration: none;">blackbox.farm</a> for support or questions.
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