import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Palette } from 'lucide-react';

interface StructuredFields {
  emoji: string;
  heading: string;
  bodyText: string;
  buttonText: string;
  buttonUrl: string;
  footerText: string;
  bgColor: string;
  cardBgColor: string;
  cardBorderColor: string;
  buttonGradientStart: string;
  buttonGradientEnd: string;
  headingColor: string;
  bodyTextColor: string;
  footerColor: string;
  linkExpiryNote: string;
  copyright: string;
}

const DEFAULT_FIELDS: StructuredFields = {
  emoji: '📧',
  heading: 'Email Heading',
  bodyText: 'Your email body text goes here.',
  buttonText: 'Click Here',
  buttonUrl: '{{action_url}}',
  footerText: '',
  bgColor: '#0a0a0a',
  cardBgColor: '#111111',
  cardBorderColor: '#222222',
  buttonGradientStart: '#8b5cf6',
  buttonGradientEnd: '#3b82f6',
  headingColor: '#ffffff',
  bodyTextColor: '#a1a1aa',
  footerColor: '#71717a',
  linkExpiryNote: '',
  copyright: `© ${new Date().getFullYear()} BlackBox Farm — HoldersIntel`,
};

function parseHtmlToFields(html: string): StructuredFields {
  const fields = { ...DEFAULT_FIELDS };
  if (!html) return fields;

  // Extract emoji (first large font-size div content)
  const emojiMatch = html.match(/font-size:\s*48px[^>]*>([^<]+)</);
  if (emojiMatch) fields.emoji = emojiMatch[1].trim();

  // Extract heading (h1 content)
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (h1Match) fields.heading = h1Match[1].trim();

  // Extract body text (first <p> with color:#a1a1aa or similar muted color)
  const bodyMatch = html.match(/<p[^>]*color:\s*#a1a1aa[^>]*>([\s\S]*?)<\/p>/);
  if (bodyMatch) fields.bodyText = bodyMatch[1].trim().replace(/<br\s*\/?>/g, '\n');

  // Extract button
  const btnMatch = html.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/);
  if (btnMatch) {
    fields.buttonUrl = btnMatch[1];
    fields.buttonText = btnMatch[2].trim();
  }

  // Extract link expiry note
  const expiryMatch = html.match(/<p[^>]*color:\s*#71717a[^>]*>([^<]+)<\/p>/);
  if (expiryMatch) fields.linkExpiryNote = expiryMatch[1].trim();

  // Extract copyright
  const copyMatch = html.match(/<p[^>]*color:\s*#52525b[^>]*>([\s\S]*?)<\/p>/);
  if (copyMatch) fields.copyright = copyMatch[1].trim();

  // Extract colors
  const bgMatch = html.match(/background-color:\s*(#[0-9a-fA-F]{6})[^"]*"[^>]*padding:\s*40px/);
  if (bgMatch) fields.bgColor = bgMatch[1];

  const cardBgMatch = html.match(/background-color:\s*(#[0-9a-fA-F]{6})[^"]*border.*border-radius/);
  if (cardBgMatch) fields.cardBgColor = cardBgMatch[1];

  const gradMatch = html.match(/linear-gradient\(\s*135deg\s*,\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})/);
  if (gradMatch) {
    fields.buttonGradientStart = gradMatch[1];
    fields.buttonGradientEnd = gradMatch[2];
  }

  const headColorMatch = html.match(/<h1[^>]*color:\s*(#[0-9a-fA-F]{6})/);
  if (headColorMatch) fields.headingColor = headColorMatch[1];

  return fields;
}

function fieldsToHtml(f: StructuredFields): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${f.bgColor};font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${f.bgColor};padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:${f.cardBgColor};border:1px solid ${f.cardBorderColor};border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 30px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">${f.emoji}</div>
  <h1 style="color:${f.headingColor};font-size:24px;margin:0 0 10px;">${f.heading}</h1>
  <p style="color:${f.bodyTextColor};font-size:14px;line-height:1.6;margin:0 0 30px;">
    ${f.bodyText.replace(/\n/g, '<br/>')}
  </p>${f.buttonText ? `
  <a href="${f.buttonUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,${f.buttonGradientStart},${f.buttonGradientEnd});color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">${f.buttonText}</a>` : ''}${f.linkExpiryNote ? `
  <p style="color:${f.footerColor};font-size:12px;margin:30px 0 0;">${f.linkExpiryNote}</p>` : ''}
  <p style="color:#52525b;font-size:11px;margin:20px 0 0;">${f.copyright}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

interface Props {
  htmlBody: string;
  onChange: (html: string) => void;
}

export function EmailStructuredEditor({ htmlBody, onChange }: Props) {
  const [fields, setFields] = useState<StructuredFields>(() => parseHtmlToFields(htmlBody));
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    setFields(parseHtmlToFields(htmlBody));
  }, [htmlBody]);

  const update = useCallback((partial: Partial<StructuredFields>) => {
    setFields(prev => {
      const next = { ...prev, ...partial };
      onChange(fieldsToHtml(next));
      return next;
    });
  }, [onChange]);

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        Edit structured fields below. Changes update the HTML automatically — switch to Editor tab to see raw HTML or Preview to see the result.
      </p>

      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <Label className="text-xs">Emoji Icon</Label>
        <Input value={fields.emoji} onChange={e => update({ emoji: e.target.value })} className="h-8 text-lg w-20" />
      </div>

      <div>
        <Label className="text-xs">Heading</Label>
        <Input value={fields.heading} onChange={e => update({ heading: e.target.value })} className="h-8 text-sm" />
      </div>

      <div>
        <Label className="text-xs">Body Text</Label>
        <Textarea value={fields.bodyText} onChange={e => update({ bodyText: e.target.value })} rows={4} className="text-sm" placeholder="Main email body content..." />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Button Text</Label>
          <Input value={fields.buttonText} onChange={e => update({ buttonText: e.target.value })} className="h-8 text-sm" placeholder="Leave empty for no button" />
        </div>
        <div>
          <Label className="text-xs">Button URL</Label>
          <Input value={fields.buttonUrl} onChange={e => update({ buttonUrl: e.target.value })} className="h-8 text-sm font-mono text-[11px]" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Link Expiry Note</Label>
        <Input value={fields.linkExpiryNote} onChange={e => update({ linkExpiryNote: e.target.value })} className="h-8 text-sm" placeholder="e.g. This link is valid for 30 days." />
      </div>

      <div>
        <Label className="text-xs">Copyright / Footer</Label>
        <Input value={fields.copyright} onChange={e => update({ copyright: e.target.value })} className="h-8 text-sm" />
      </div>

      <Separator />

      <button
        type="button"
        onClick={() => setShowColors(!showColors)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Palette className="h-3.5 w-3.5" />
        {showColors ? 'Hide' : 'Show'} Color Settings
      </button>

      {showColors && (
        <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/20">
          {([
            ['bgColor', 'Page Background'],
            ['cardBgColor', 'Card Background'],
            ['cardBorderColor', 'Card Border'],
            ['headingColor', 'Heading Color'],
            ['bodyTextColor', 'Body Text Color'],
            ['footerColor', 'Footer Color'],
            ['buttonGradientStart', 'Button Gradient Start'],
            ['buttonGradientEnd', 'Button Gradient End'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={fields[key]}
                onChange={e => update({ [key]: e.target.value })}
                className="w-7 h-7 rounded border cursor-pointer"
              />
              <div>
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <span className="text-[9px] font-mono text-muted-foreground/60 ml-1">{fields[key]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
