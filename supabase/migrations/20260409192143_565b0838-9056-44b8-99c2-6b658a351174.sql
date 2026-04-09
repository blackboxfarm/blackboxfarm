
-- Add missing template keys
INSERT INTO public.email_templates (template_key, display_name, subject)
VALUES
  ('verification_reactivation', 'Account Reactivation', '🔓 Reactivate Your BlackBox Farm Account'),
  ('verification_reminder', '24h Verification Reminder', '⏰ Reminder: Verify Your Email — 24 Hours Left'),
  ('sol_renewal_reminder', 'SOL Renewal Reminder', '⏰ Your BlackBox Pro Subscription Expires Soon')
ON CONFLICT (template_key) DO NOTHING;

-- email_verification
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">🔐</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">Verify Your Email</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">Welcome to BlackBox Farm! Please verify your email address by clicking the button below. You have 48 hours to complete this step.</p>
  <a href="{{verify_url}}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Verify My Email</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">If you didn''t create an account, you can safely ignore this email.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© 2026 BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'email_verification';

-- verification_reactivation
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">🔓</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">Reactivate Your Account</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">Your BlackBox Farm account was suspended because your email wasn''t verified within 48 hours. No worries — click the button below to reactivate instantly!</p>
  <a href="{{verify_url}}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Reactivate My Account</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">This link is valid for 30 days.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© 2026 BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'verification_reactivation';

-- verification_reminder
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">⏰</div>
  <h1 style="color:#ffffff;font-size:24px;margin:0 0 10px;">Verify Your Email — 24 Hours Left</h1>
  <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 30px;">Hey! Just a friendly reminder — you have about 24 hours left to verify your email address. After that, your account will be temporarily suspended. Click below to verify now!</p>
  <a href="{{verify_url}}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Verify My Email</a>
  <p style="color:#71717a;font-size:12px;margin:30px 0 0;">If you''ve already verified, you can safely ignore this.</p>
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">© 2026 BlackBox Farm — HoldersIntel</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'verification_reminder';

-- new_user_welcome (the rich branded version)
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to BlackBox Farm!</title></head>
<body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
<tr><td align="center" style="padding: 40px 20px;">
<table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
  <tr>
    <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 48px 40px; text-align: center; border-bottom: 2px solid #00e5ff30;">
      <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 72px; height: 72px; margin-bottom: 20px; object-fit: contain;" />
      <h1 style="color: #00e5ff; font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; text-shadow: 0 0 40px rgba(0,229,255,0.3);">BlackBox Farm</h1>
      <p style="color: #64748b; font-size: 14px; margin: 8px 0 0 0; letter-spacing: 2px; text-transform: uppercase;">Putting the Needle in the Haystack</p>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px 32px;">
      <h2 style="color: #f0f4f8; font-size: 30px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Welcome to BlackBox, {{name}}! 🎉</h2>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0; text-align: center;">Your account has been created successfully. You now have access to the most advanced Solana token intelligence platform — built for traders who want the edge.</p>
    </td>
  </tr>
  <tr>
    <td style="padding: 0 40px 40px;">
      <h3 style="color: #e2e8f0; font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">🚀 3 Tools — Ready to Use Now</h3>
      <div style="background: #1a2332; border-radius: 12px; padding: 24px; margin-bottom: 16px; border-left: 4px solid #00e5ff;">
        <p style="color: #e2e8f0; font-size: 17px; font-weight: 700; margin: 0 0 8px 0;">🔍 Token Holder Analysis</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0;">Paste any Solana token address and get an instant health report — holder distribution, whale activity, risk flags, and AI insights.</p>
      </div>
      <div style="background: #1a2332; border-radius: 12px; padding: 24px; margin-bottom: 16px; border-left: 4px solid #f59e0b;">
        <p style="color: #e2e8f0; font-size: 17px; font-weight: 700; margin: 0 0 8px 0;">🎯 Developer Intelligence</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0;">Look up any dev wallet to see their full launch history, success rate, and reputation score.</p>
      </div>
      <div style="background: #1a2332; border-radius: 12px; padding: 24px; margin-bottom: 16px; border-left: 4px solid #8b5cf6;">
        <p style="color: #e2e8f0; font-size: 17px; font-weight: 700; margin: 0 0 8px 0;">🤖 AI Chat Assistant</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0;">Ask questions about any token, get market insights, and receive intelligent trading recommendations.</p>
      </div>
      <div style="text-align: center; margin-top: 32px;">
        <a href="https://blackbox.farm/holders" style="display: inline-block; background: linear-gradient(135deg, #00e5ff, #00b8d4); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 6px 24px rgba(0,229,255,0.3);">Start Analyzing →</a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
      <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">BlackBox Farm · <a href="https://blackbox.farm" style="color: #D4AF37; text-decoration: none;">blackbox.farm</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'new_user_welcome';

-- subscriber_welcome
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
<tr><td align="center" style="padding: 40px 20px;">
<table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
  <tr>
    <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 48px 40px; text-align: center; border-bottom: 2px solid #00e5ff30;">
      <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 72px; height: 72px; margin-bottom: 20px; object-fit: contain;" />
      <h1 style="color: #00e5ff; font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px;">BlackBox Farm</h1>
      <p style="color: #64748b; font-size: 14px; margin: 8px 0 0 0; letter-spacing: 2px; text-transform: uppercase;">Solana Intelligence Platform</p>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px 32px;">
      <h2 style="color: #f0f4f8; font-size: 28px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Welcome aboard, {{name}}! 🎉</h2>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0; text-align: center;">Thank you for subscribing to <strong style="color: #00e5ff;">{{tier}}</strong>{{amount}}. You now have access to premium Solana intelligence tools used by serious traders.</p>
    </td>
  </tr>
  <tr>
    <td style="padding: 0 40px 40px;">
      <h3 style="color: #e2e8f0; font-size: 20px; font-weight: 700; margin: 0 0 20px 0;">🚀 Your {{tier}} Features</h3>
      <div style="background: #1a2332; border-radius: 12px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #00e5ff;">
        <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0;">✅ Unlimited Token Analysis</p>
      </div>
      <div style="background: #1a2332; border-radius: 12px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #8b5cf6;">
        <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0;">✅ Full AI Insights & Recommendations</p>
      </div>
      <div style="background: #1a2332; border-radius: 12px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #f59e0b;">
        <p style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin: 0;">✅ Ad-Free Experience</p>
      </div>
      <div style="text-align: center; margin-top: 32px;">
        <a href="https://blackbox.farm/holders" style="display: inline-block; background: linear-gradient(135deg, #00e5ff, #00b8d4); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 6px 24px rgba(0,229,255,0.3);">Start Analyzing →</a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
      <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">BlackBox Farm · <a href="https://blackbox.farm/pricing" style="color: #D4AF37; text-decoration: none;">Manage Subscription</a> · <a href="https://blackbox.farm/contact" style="color: #D4AF37; text-decoration: none;">Support</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'subscriber_welcome';

-- subscription_renewed
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif;">
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
      <h2 style="color: #f0f4f8; font-size: 24px; margin: 0 0 16px 0;">Hey {{name}},</h2>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your <strong style="color: #00e5ff;">{{tier}}</strong> subscription has been renewed successfully.</p>
      <div style="background: #1a2332; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Plan</td><td style="color: #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">{{tier}}</td></tr>
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Amount</td><td style="color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">{{amount}}</td></tr>
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Status</td><td style="color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">✅ Active</td></tr>
        </table>
      </div>
      <div style="text-align: center;">
        <a href="https://blackbox.farm/holders" style="display: inline-block; background: linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px;">Continue Analyzing →</a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
      <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">BlackBox Farm · <a href="https://blackbox.farm/pricing" style="color: #D4AF37; text-decoration: none;">Manage Subscription</a> · <a href="https://blackbox.farm/contact" style="color: #D4AF37; text-decoration: none;">Support</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'subscription_renewed';

-- subscription_cancelled
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif;">
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
      <h2 style="color: #f0f4f8; font-size: 24px; margin: 0 0 16px 0;">Hey {{name}},</h2>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your <strong style="color: #ef4444;">{{tier}}</strong> subscription has been cancelled. You''ll still have access to your premium features until the end of your current billing period.</p>
      <div style="background: #1a2332; border: 1px solid #f59e0b30; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
        <p style="color: #f59e0b; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Changed your mind?</p>
        <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px 0;">You can resubscribe anytime to regain access to all premium features.</p>
        <a href="https://blackbox.farm/pricing" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px;">Resubscribe →</a>
      </div>
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">Your free account will remain active with basic features. We hope to see you back soon!</p>
    </td>
  </tr>
  <tr>
    <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
      <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">BlackBox Farm · <a href="https://blackbox.farm" style="color: #D4AF37; text-decoration: none;">blackbox.farm</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'subscription_cancelled';

-- sol_payment_confirmed
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
<tr><td align="center" style="padding: 40px 20px;">
<table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
  <tr>
    <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 40px; text-align: center; border-bottom: 2px solid #9945ff30;">
      <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 56px; height: 56px; margin-bottom: 16px;" />
      <h1 style="color: #9945ff; font-size: 28px; font-weight: 800; margin: 0;">◎ SOL Payment Received</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 40px;">
      <h2 style="color: #f0f4f8; font-size: 24px; margin: 0 0 16px 0;">Thank you, {{name}}! 🎉</h2>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your Solana payment has been confirmed. Your <strong style="color: #9945ff;">Pro</strong> yearly subscription is now active.</p>
      <div style="background: #1a2332; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Plan</td><td style="color: #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">Pro (Yearly)</td></tr>
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Amount</td><td style="color: #9945ff; font-size: 14px; font-weight: 600; text-align: right;">{{amount_sol}} SOL</td></tr>
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Valid Until</td><td style="color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">{{expiry_date}}</td></tr>
          <tr><td style="color: #64748b; font-size: 14px; padding: 8px 0;">Payment Wallet</td><td style="color: #e2e8f0; font-size: 12px; text-align: right; font-family: monospace; word-break: break-all;">{{wallet_short}}</td></tr>
        </table>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="{{solscan_url}}" style="display: inline-block; background: linear-gradient(135deg, #9945ff 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px;">View Transaction on Solscan →</a>
      </div>
      <div style="text-align: center;">
        <a href="https://blackbox.farm/holders" style="display: inline-block; background: linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%); color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px;">Start Analyzing →</a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
      <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">BlackBox Farm · <a href="https://blackbox.farm" style="color: #D4AF37; text-decoration: none;">blackbox.farm</a> · <a href="https://blackbox.farm/contact" style="color: #D4AF37; text-decoration: none;">Support</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'sol_payment_confirmed';

-- sol_renewal_reminder
UPDATE public.email_templates SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #080812; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #080812;">
<tr><td align="center" style="padding: 40px 20px;">
<table width="640" cellpadding="0" cellspacing="0" style="background: #0f1724; border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 1px solid #1e293b;">
  <tr>
    <td style="background: linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%); padding: 40px; text-align: center; border-bottom: 2px solid #f59e0b30;">
      <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox" style="width: 56px; height: 56px; margin-bottom: 16px;" />
      <h1 style="color: #f59e0b; font-size: 28px; font-weight: 800; margin: 0;">⏰ Subscription Expiring Soon</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 40px;">
      <h2 style="color: #f0f4f8; font-size: 24px; margin: 0 0 16px 0;">Hey {{name}},</h2>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">Your <strong style="color: #9945ff;">Pro</strong> yearly subscription expires on <strong style="color: #f59e0b;">{{expiry_date}}</strong> ({{days_left}} days from now).</p>
      <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">To keep your premium access, simply send <strong style="color: #9945ff;">{{amount_sol}} SOL</strong> via the /payment command in <a href="https://t.me/holdersintel_bot" style="color: #00e5ff; text-decoration: none;">@holdersintel_bot</a>.</p>
      <div style="text-align: center;">
        <a href="https://t.me/holdersintel_bot" style="display: inline-block; background: linear-gradient(135deg, #9945ff 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-weight: 700; font-size: 15px;">Renew via Telegram →</a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background: #080812; padding: 24px 40px; border-top: 1px solid #1e293b;">
      <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">BlackBox Farm · <a href="https://blackbox.farm" style="color: #D4AF37; text-decoration: none;">blackbox.farm</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE template_key = 'sol_renewal_reminder';
