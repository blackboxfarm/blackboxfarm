/**
 * Shared utility for generating email tracking pixel + click wrapper URLs.
 * Import this in any edge function that sends emails.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export interface TrackingInfo {
  trackingId: string;
  pixelHtml: string;
  wrapUrl: (destinationUrl: string) => string;
}

/**
 * Creates a tracking record and returns pixel HTML + click wrapper.
 * Call this before sending any email.
 */
export async function createEmailTracking(options: {
  userId?: string;
  emailType: string;
  recipientEmail: string;
  subjectLine?: string;
  metadata?: Record<string, unknown>;
}): Promise<TrackingInfo> {
  const trackingId = crypto.randomUUID();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await supabase.from('email_tracking_events').insert({
      tracking_id: trackingId,
      user_id: options.userId || null,
      email_type: options.emailType,
      recipient_email: options.recipientEmail,
      subject_line: options.subjectLine || null,
      metadata: options.metadata || {},
    });
  } catch {
    // Silent — tracking should never block email sending
  }

  const pixelUrl = `${SUPABASE_URL}/functions/v1/track-email-open?id=${trackingId}`;
  const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`;

  const wrapUrl = (destinationUrl: string) =>
    `${SUPABASE_URL}/functions/v1/track-email-click?id=${trackingId}&redirect=${encodeURIComponent(destinationUrl)}`;

  return { trackingId, pixelHtml, wrapUrl };
}

/**
 * Injects a tracking pixel at the end of an HTML email body.
 * Simple string injection — works with any HTML email.
 */
export function injectPixelIntoHtml(html: string, pixelHtml: string): string {
  // Insert before </body> if it exists, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixelHtml}</body>`);
  }
  return html + pixelHtml;
}
