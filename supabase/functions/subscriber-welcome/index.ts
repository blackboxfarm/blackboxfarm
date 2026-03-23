import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubscriberWelcomeRequest {
  email: string;
  name?: string;
  tierKey: string;
  amount?: string;
  isNewSubscription?: boolean;
  // If true, this is for an unmatched customer who needs to create an account
  needsAccountCreation?: boolean;
}

function generateWelcomeEmail(data: SubscriberWelcomeRequest): string {
  const { email, name, tierKey, amount, needsAccountCreation } = data;
  const displayName = name || email.split('@')[0];
  const tierDisplay = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
  const signupUrl = `https://blackbox.farm/auth?tab=signup`;

  const accountSection = needsAccountCreation ? `
    <!-- Account Creation CTA -->
    <tr>
      <td style="padding: 0 40px 40px;">
        <div style="background: linear-gradient(135deg, #0d2818 0%, #1a3a2a 100%); border: 2px solid #00e5ff40; border-radius: 16px; padding: 32px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 16px;">⚠️</div>
          <h3 style="color: #00e5ff; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">
            One More Step — Activate Your Access
          </h3>
          <p style="color: #b0c4d8; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
            Your payment was successful, but you haven't created your BlackBox website account yet.
            <strong style="color: #f0f0f0;">Create an account using this same email address (${email})</strong> 
            and your <strong style="color: #00e5ff;">${tierDisplay}</strong> subscription will be automatically linked — 
            giving you instant access to all your premium features.
          </p>
          <a href="${signupUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%); 
                    color: #0a0a1a; text-decoration: none; padding: 16px 48px; border-radius: 12px; 
                    font-weight: 800; font-size: 16px; letter-spacing: 0.5px;
                    box-shadow: 0 8px 32px rgba(0, 229, 255, 0.35); text-transform: uppercase;">
            🔐 Create Your Account Now
          </a>
          <p style="color: #64748b; font-size: 13px; margin: 20px 0 0 0;">
            Use <strong style="color: #94a3b8;">${email}</strong> — the same email you used for Stripe payment.<br>
            You can also sign in with Google if your Google account uses this email.
          </p>
        </div>
      </td>
    </tr>
  ` : `
    <!-- Already has account -->
    <tr>
      <td style="padding: 0 40px 40px;">
        <div style="background: #0d2818; border: 1px solid #22c55e40; border-radius: 16px; padding: 24px; text-align: center;">
          <p style="color: #22c55e; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">✅ Account Linked</p>
          <p style="color: #b0c4d8; font-size: 14px; margin: 0;">
            Your subscription has been linked to your BlackBox account. Log in to access your premium features.
          </p>
          <a href="https://blackbox.farm/auth?tab=signin" 
             style="display: inline-block; margin-top: 16px; background: linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%); 
                    color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; 
                    font-weight: 700; font-size: 15px;
                    box-shadow: 0 6px 24px rgba(0, 229, 255, 0.3);">
            Sign In →
          </a>
        </div>
      </td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to BlackBox ${tierDisplay}</title>
    </head>
    <body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 48px 40px; text-align: center; border-bottom: 2px solid #00e5ff30;">
                  <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 72px; height: 72px; margin-bottom: 20px; object-fit: contain;" />
                  <h1 style="color: #00e5ff; font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; text-shadow: 0 0 40px rgba(0,229,255,0.3);">BlackBox Farm</h1>
                  <p style="color: #64748b; font-size: 14px; margin: 8px 0 0 0; letter-spacing: 2px; text-transform: uppercase;">Solana Intelligence Platform</p>
                </td>
              </tr>

              <!-- Welcome Message -->
              <tr>
                <td style="padding: 48px 40px 32px;">
                  <h2 style="color: #f0f4f8; font-size: 28px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">
                    Welcome aboard, ${displayName}! 🎉
                  </h2>
                  <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0; text-align: center;">
                    Thank you for subscribing to <strong style="color: #00e5ff;">${tierDisplay}</strong>${amount ? ` (${amount})` : ''}. 
                    You now have access to premium Solana intelligence tools used by serious traders.
                  </p>
                </td>
              </tr>

              ${accountSection}

              <!-- What You Get -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <h3 style="color: #e2e8f0; font-size: 20px; font-weight: 700; margin: 0 0 20px 0;">🚀 Your ${tierDisplay} Features</h3>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${generateFeatureRow('🔍', 'Advanced Holder Analysis', 'Deep-dive into any token\'s holder distribution, whale movements, and clustering patterns.')}
                    ${generateFeatureRow('🤖', 'Full AI Intelligence Panel', 'AI-powered risk scoring, momentum analysis, and predictive insights on any Solana token.')}
                    ${generateFeatureRow('📊', 'Key Drivers & Reasoning', 'Understand exactly why a token\'s health score changed with full reasoning traces.')}
                    ${generateFeatureRow('🐳', 'Whale Tracking & Alerts', 'Real-time notifications when whales move, accumulate, or dump positions.')}
                    ${tierKey === 'dev' || tierKey === 'enterprise' ? generateFeatureRow('⚡', 'API & Webhook Access', 'Programmatic access to all intelligence data for your own bots and dashboards.') : ''}
                    ${tierKey === 'enterprise' ? generateFeatureRow('👥', 'Team Seats', 'Share access with your team — up to 4 seats included.') : ''}
                  </table>
                </td>
              </tr>

              <!-- Quick Links -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <div style="background: #1a2332; border-radius: 12px; padding: 24px;">
                    <h4 style="color: #e2e8f0; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">📌 Quick Links</h4>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/holders" style="color: #D4AF37; text-decoration: none; font-size: 14px;">→ Token Analysis Dashboard</a>
                        </td>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/pricing" style="color: #D4AF37; text-decoration: none; font-size: 14px;">→ Manage Subscription</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/tgbot" style="color: #D4AF37; text-decoration: none; font-size: 14px;">→ Telegram Bot Setup</a>
                        </td>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/features" style="color: #D4AF37; text-decoration: none; font-size: 14px;">→ All Features</a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>

              <!-- Support -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <div style="background: #0d1a2d; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; text-align: center;">
                    <p style="color: #64748b; font-size: 14px; margin: 0 0 8px 0;">Need help getting started?</p>
                    <a href="https://blackbox.farm/contact" style="color: #D4AF37; text-decoration: none; font-weight: 600;">Contact our support team →</a>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background: #080812; padding: 28px 40px; border-top: 1px solid #1e293b;">
                  <p style="color: #475569; font-size: 12px; text-align: center; margin: 0; line-height: 1.8;">
                    BlackBox Farm — Solana Intelligence Platform<br>
                    This email was sent to ${email} because you subscribed to BlackBox.<br>
                    <a href="https://blackbox.farm" style="color: #D4AF37; text-decoration: none;">blackbox.farm</a> · 
                    <a href="https://blackbox.farm/privacy" style="color: #D4AF37; text-decoration: none;">Privacy</a> · 
                    <a href="https://blackbox.farm/terms" style="color: #D4AF37; text-decoration: none;">Terms</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function generateFeatureRow(icon: string, title: string, description: string): string {
  return `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #1e293b15;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align: top; padding-right: 14px; font-size: 22px;">${icon}</td>
            <td>
              <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0 0 4px 0;">${title}</p>
              <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0;">${description}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function generateNewUserWelcomeEmail(email: string): string {
  const displayName = email.split('@')[0];
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to BlackBox Farm!</title>
    </head>
    <body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 48px 40px; text-align: center; border-bottom: 2px solid #00e5ff30;">
                  <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 72px; height: 72px; margin-bottom: 20px; object-fit: contain;" />
                  <h1 style="color: #00e5ff; font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; text-shadow: 0 0 40px rgba(0,229,255,0.3);">BlackBox Farm</h1>
                  <p style="color: #64748b; font-size: 14px; margin: 8px 0 0 0; letter-spacing: 2px; text-transform: uppercase;">Putting the Needle in the Haystack</p>
                </td>
              </tr>

              <!-- Welcome -->
              <tr>
                <td style="padding: 48px 40px 32px;">
                  <h2 style="color: #f0f4f8; font-size: 30px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">
                    Welcome to BlackBox, ${displayName}! 🎉
                  </h2>
                  <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0; text-align: center;">
                    Your account has been created successfully. You now have access to the most advanced 
                    Solana token intelligence platform — built for traders who want the edge.
                  </p>
                </td>
              </tr>

              <!-- What You Can Do -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <h3 style="color: #e2e8f0; font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">🔓 What's Unlocked</h3>
                  
                  <div style="background: #1a2332; border-radius: 12px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #00e5ff;">
                    <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0 0 6px 0;">🔍 Token Holder Analysis</p>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">Analyze any Solana token — holder distribution, health score, whale activity, and AI insights.</p>
                  </div>
                  
                  <div style="background: #1a2332; border-radius: 12px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #22c55e;">
                    <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0 0 6px 0;">🤖 AI Quick Summary</p>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">Get instant AI-generated risk assessment and trading signals on any token.</p>
                  </div>
                  
                  <div style="background: #1a2332; border-radius: 12px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #f59e0b;">
                    <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0 0 6px 0;">📊 10 Reports Per Day</p>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">Free accounts get 10 full reports daily. Upgrade to Pro for 50+ reports and premium features.</p>
                  </div>
                  
                  <div style="background: #1a2332; border-radius: 12px; padding: 20px; border-left: 4px solid #a855f7;">
                    <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0 0 6px 0;">🐳 Whale Warnings</p>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">See when major holders are moving — before it hits the price.</p>
                  </div>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td style="padding: 0 40px 40px; text-align: center;">
                  <a href="https://blackbox.farm/holders" 
                     style="display: inline-block; background: linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%); 
                            color: #0a0a1a; text-decoration: none; padding: 16px 48px; border-radius: 12px; 
                            font-weight: 800; font-size: 16px; letter-spacing: 0.5px;
                            box-shadow: 0 8px 32px rgba(0, 229, 255, 0.35); text-transform: uppercase;">
                    🔍 Analyze Your First Token
                  </a>
                </td>
              </tr>

              <!-- Upgrade Teaser -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <div style="background: linear-gradient(135deg, #1a1a3e 0%, #0d1f3c 100%); border: 1px solid #4f46e540; border-radius: 16px; padding: 28px; text-align: center;">
                    <p style="color: #a78bfa; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 12px 0; font-weight: 600;">Want More Power?</p>
                    <h4 style="color: #e2e8f0; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">Upgrade to Pro — $9.99/mo</h4>
                    <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0;">
                      Full AI panel · Key Drivers · CSV Export · 50 reports/day · Priority alerts
                    </p>
                    <a href="https://blackbox.farm/pricing" style="color: #a78bfa; text-decoration: none; font-weight: 600; font-size: 14px;">
                      View All Plans →
                    </a>
                  </div>
                </td>
              </tr>

              <!-- Quick Links -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <div style="background: #1a2332; border-radius: 12px; padding: 20px;">
                    <h4 style="color: #e2e8f0; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">📌 Get Started</h4>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/holders" style="color: #00e5ff; text-decoration: none; font-size: 14px;">→ Token Analysis</a>
                        </td>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/tgbot" style="color: #00e5ff; text-decoration: none; font-size: 14px;">→ Telegram Bot</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/features" style="color: #00e5ff; text-decoration: none; font-size: 14px;">→ All Features</a>
                        </td>
                        <td style="padding: 6px 0;">
                          <a href="https://blackbox.farm/pricing" style="color: #00e5ff; text-decoration: none; font-size: 14px;">→ Pricing</a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background: #080812; padding: 28px 40px; border-top: 1px solid #1e293b;">
                  <p style="color: #475569; font-size: 12px; text-align: center; margin: 0; line-height: 1.8;">
                    BlackBox Farm — Solana Intelligence Platform<br>
                    This email was sent to ${email} because you created a BlackBox account.<br>
                    <a href="https://blackbox.farm" style="color: #00e5ff60; text-decoration: none;">blackbox.farm</a> · 
                    <a href="https://blackbox.farm/privacy" style="color: #00e5ff60; text-decoration: none;">Privacy</a> · 
                    <a href="https://blackbox.farm/terms" style="color: #00e5ff60; text-decoration: none;">Terms</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function generateSubscriptionRenewalEmail(email: string, name: string | undefined, tierKey: string, amount: string): string {
  const displayName = name || email.split('@')[0];
  const tierDisplay = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
        <tr><td align="center" style="padding: 40px 20px;">
          <table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
            <tr>
              <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 40px; text-align: center; border-bottom: 2px solid #22c55e30;">
                <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 56px; height: 56px; margin-bottom: 16px;" />
                <h1 style="color: #22c55e; font-size: 28px; font-weight: 800; margin: 0;">✅ Payment Confirmed</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #f0f4f8; font-size: 24px; margin: 0 0 16px 0;">Hey ${displayName},</h2>
                <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
                  Your <strong style="color: #00e5ff;">${tierDisplay}</strong> subscription has been renewed successfully.
                </p>
                <div style="background: #1a2332; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Plan</td><td style="color: #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">${tierDisplay}</td></tr>
                    <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Amount</td><td style="color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">${amount}</td></tr>
                    <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Status</td><td style="color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">✅ Active</td></tr>
                  </table>
                </div>
                <div style="text-align: center;">
                  <a href="https://blackbox.farm/holders" style="display: inline-block; background: linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 6px 24px rgba(0,229,255,0.3);">
                    Continue Analyzing →
                  </a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
                <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
                  BlackBox Farm · <a href="https://blackbox.farm/pricing" style="color: #D4AF37; text-decoration: none;">Manage Subscription</a> · <a href="https://blackbox.farm/contact" style="color: #D4AF37; text-decoration: none;">Support</a>
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

function generateCancellationEmail(email: string, name: string | undefined, tierKey: string): string {
  const displayName = name || email.split('@')[0];
  const tierDisplay = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
        <tr><td align="center" style="padding: 40px 20px;">
          <table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
            <tr>
              <td style="background: linear-gradient(135deg, #1a0a0a 0%, #2d1515 50%, #1a0a0a 100%); padding: 40px; text-align: center; border-bottom: 2px solid #ef444430;">
                <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 56px; height: 56px; margin-bottom: 16px;" />
                <h1 style="color: #ef4444; font-size: 28px; font-weight: 800; margin: 0;">Subscription Cancelled</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #f0f4f8; font-size: 24px; margin: 0 0 16px 0;">Hey ${displayName},</h2>
                <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
                  Your <strong style="color: #ef4444;">${tierDisplay}</strong> subscription has been cancelled. 
                  You'll still have access to your premium features until the end of your current billing period.
                </p>
                <div style="background: #1a2332; border: 1px solid #f59e0b30; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
                  <p style="color: #f59e0b; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Changed your mind?</p>
                  <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px 0;">You can resubscribe anytime to regain access to all premium features.</p>
                  <a href="https://blackbox.farm/pricing" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px;">
                    Resubscribe →
                  </a>
                </div>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                  Your free account will remain active with basic features. We hope to see you back soon!
                </p>
              </td>
            </tr>
            <tr>
              <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
                <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
                  BlackBox Farm · <a href="https://blackbox.farm" style="color: #00e5ff60; text-decoration: none;">blackbox.farm</a>
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { emailType = 'subscriber_welcome', ...data } = body;

    console.log(`[subscriber-welcome] Sending ${emailType} email to ${data.email}`);

    let subject: string;
    let html: string;

    switch (emailType) {
      case 'subscriber_welcome':
        subject = data.needsAccountCreation 
          ? `🔐 Action Required: Activate Your BlackBox ${(data.tierKey || 'Pro').charAt(0).toUpperCase() + (data.tierKey || 'Pro').slice(1)} Access`
          : `🎉 Welcome to BlackBox ${(data.tierKey || 'Pro').charAt(0).toUpperCase() + (data.tierKey || 'Pro').slice(1)}!`;
        html = generateWelcomeEmail(data);
        break;

      case 'new_user_welcome':
        subject = '🎉 Welcome to BlackBox Farm — Your Account is Ready!';
        html = generateNewUserWelcomeEmail(data.email);
        break;

      case 'subscription_renewed':
        subject = `✅ Payment Confirmed — BlackBox ${(data.tierKey || 'Pro').charAt(0).toUpperCase() + (data.tierKey || 'Pro').slice(1)}`;
        html = generateSubscriptionRenewalEmail(data.email, data.name, data.tierKey || 'pro', data.amount || 'N/A');
        break;

      case 'subscription_cancelled':
        subject = `Your BlackBox ${(data.tierKey || 'Pro').charAt(0).toUpperCase() + (data.tierKey || 'Pro').slice(1)} Subscription Has Been Cancelled`;
        html = generateCancellationEmail(data.email, data.name, data.tierKey || 'pro');
        break;

      default:
        throw new Error(`Unknown email type: ${emailType}`);
    }

    const emailResponse = await resend.emails.send({
      from: "BlackBox Farm <noreply@blackbox.farm>",
      to: [data.email],
      subject,
      html,
    });

    console.log(`[subscriber-welcome] Email sent:`, emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[subscriber-welcome] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
