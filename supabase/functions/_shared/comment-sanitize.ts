// Sanitize a comment body — strip HTML/scripts/control chars, trim, length-cap.
// Defense-in-depth layer. Run BEFORE storing as `body_clean`.

const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ZERO_WIDTH = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const HTML_TAG = /<\/?[^>]+(>|$)/g;
const SCRIPT_PROTOCOL = /(javascript:|data:|vbscript:)/gi;
const ANSI_ESC = /\x1b\[/g;
const SQLI_HINT = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION)\b\s+\b(FROM|INTO|TABLE|DATABASE)\b/gi;

export interface SanitizedComment {
  clean: string;
  flags: string[];
}

export function sanitizeCommentBody(raw: string, maxLen = 1000): SanitizedComment {
  const flags: string[] = [];
  if (typeof raw !== 'string') return { clean: '', flags: ['not_string'] };

  let s = raw.normalize('NFKC');

  if (CONTROL_RE.test(s)) flags.push('control');
  s = s.replace(CONTROL_RE, '');

  if (ZERO_WIDTH.test(s)) flags.push('zero_width');
  s = s.replace(ZERO_WIDTH, '');

  if (ANSI_ESC.test(s)) flags.push('ansi');
  s = s.replace(ANSI_ESC, '');

  if (HTML_TAG.test(s)) flags.push('html');
  s = s.replace(HTML_TAG, '');

  if (SCRIPT_PROTOCOL.test(s)) flags.push('script_proto');
  s = s.replace(SCRIPT_PROTOCOL, '');

  if (SQLI_HINT.test(s)) flags.push('sqli_hint');

  s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
    flags.push('truncated');
  }

  return { clean: s, flags };
}

export async function verifyTurnstile(token: string | undefined): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get('CLOUDFLARE_TURNSTILE_SECRET_KEY');
  if (!secret) return { ok: true, reason: 'no_secret_configured' }; // fail-open in dev
  if (!token) return { ok: false, reason: 'missing_token' };
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const j = await r.json();
    return j?.success ? { ok: true } : { ok: false, reason: 'siteverify_failed' };
  } catch (e) {
    return { ok: false, reason: `siteverify_error:${(e as Error).message}` };
  }
}