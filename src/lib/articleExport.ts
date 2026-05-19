import { marked } from 'marked';

export type ExportPreset = 'medium' | 'substack' | 'linkedin' | 'ghost' | 'generic' | 'plain';

marked.setOptions({ gfm: true, breaks: false });

function baseHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Strip H1 (Medium uses the title field separately). */
function stripH1(html: string): string {
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '');
}

/** Convert blockquotes to a styled pull-quote (Substack honors inline style). */
function styleBlockquotes(html: string): string {
  return html.replace(/<blockquote>/g, '<blockquote style="border-left:4px solid #888;padding-left:12px;margin:16px 0;font-style:italic;color:#555;">');
}

export function mdToHtml(md: string, preset: ExportPreset = 'generic'): string {
  let html = baseHtml(md);
  switch (preset) {
    case 'medium':
      html = stripH1(html);
      break;
    case 'substack':
      html = styleBlockquotes(html);
      break;
    case 'ghost':
    case 'generic':
      break;
    default:
      break;
  }
  return html.trim();
}

/** Pure-text fallback — strips every markdown marker but preserves structure via line breaks. */
export function mdToPlain(md: string): string {
  return md
    // images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // links -> "text (url)"
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // headings
    .replace(/^#{1,6}\s+/gm, '')
    // bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // inline code
    .replace(/`([^`]+)`/g, '$1')
    // code fences
    .replace(/```[\s\S]*?```/g, '')
    // blockquote markers
    .replace(/^>\s?/gm, '')
    // list bullets
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // horizontal rules
    .replace(/^---+$/gm, '')
    // collapse 3+ blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert ASCII a–z, A–Z, 0–9 to Unicode mathematical sans-serif bold. */
function toUnicodeBold(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 65 && code <= 90) out += String.fromCodePoint(0x1d5d4 + (code - 65));
    else if (code >= 97 && code <= 122) out += String.fromCodePoint(0x1d5ee + (code - 97));
    else if (code >= 48 && code <= 57) out += String.fromCodePoint(0x1d7ec + (code - 48));
    else out += ch;
  }
  return out;
}

/** LinkedIn strips HTML — produce plain text but keep emphasis via Unicode bold. */
export function mdToLinkedIn(md: string): string {
  let s = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '');

  // Headings -> bold line
  s = s.replace(/^#{1,6}\s+(.+)$/gm, (_m, t) => toUnicodeBold(t));
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, t) => toUnicodeBold(t));
  s = s.replace(/__([^_]+)__/g, (_m, t) => toUnicodeBold(t));
  // Italic - LinkedIn has no good italic; leave plain
  s = s.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1');
  // Lists
  s = s.replace(/^[\s]*[-*+]\s+/gm, '• ');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/^---+$/gm, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** Write rich HTML + plain text fallback to the clipboard. */
export async function copyRich(html: string, plain: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
  } catch (e) {
    // fall through to plain
  }
  await navigator.clipboard.writeText(plain);
}

export function buildExport(md: string, preset: ExportPreset): { html: string; plain: string } {
  if (preset === 'linkedin') {
    const text = mdToLinkedIn(md);
    return { html: `<pre style="font-family:inherit;white-space:pre-wrap;">${text.replace(/</g, '&lt;')}</pre>`, plain: text };
  }
  if (preset === 'plain') {
    const text = mdToPlain(md);
    return { html: `<pre style="font-family:inherit;white-space:pre-wrap;">${text.replace(/</g, '&lt;')}</pre>`, plain: text };
  }
  const html = mdToHtml(md, preset);
  const plain = mdToPlain(md);
  return { html, plain };
}