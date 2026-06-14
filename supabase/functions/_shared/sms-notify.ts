/**
 * Shared SMS notification utility for admin alerts.
 * Fire-and-forget pattern — never throws.
 */

const TWILIO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';
const ADMIN_PHONE = '+12265835975';

export async function sendAdminSms(body: string): Promise<boolean> {
  try {
    if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false') {
      console.warn('[SMS KILL] sendAdminSms suppressed. Set SMS_GLOBAL_KILL=false to re-enable.');
      return false;
    }
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      console.warn('[SMS] Cannot send — missing LOVABLE_API_KEY or TWILIO_API_KEY');
      return false;
    }

    // Truncate to 1600 chars
    const message = body.length > 1600 ? body.slice(0, 1597) + '...' : body;

    const res = await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: ADMIN_PHONE,
        From: TWILIO_FROM,
        Body: message,
      }),
    });

    if (!res.ok) {
      console.warn(`[SMS] Send failed: ${res.status}`);
      return false;
    }
    console.log('[SMS] Admin notification sent successfully');
    return true;
  } catch (err) {
    console.warn('[SMS] Send error (non-blocking):', err);
    return false;
  }
}
