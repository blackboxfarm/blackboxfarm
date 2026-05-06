import React from 'react';

/**
 * Telegram MarkdownV2 / HTML formatting cheatsheet.
 * Rendered inside a Dialog from the Announce to Users panel.
 */
export function TelegramFormattingHelp() {
  const rows: { style: React.ReactNode; mdv2: string; legacy: string; html: string }[] = [
    { style: <strong>Bold</strong>, mdv2: '*bold*', legacy: '*bold*', html: '<b>bold</b>' },
    { style: <em>Italic</em>, mdv2: '_italic_', legacy: '_italic_', html: '<i>italic</i>' },
    { style: <span className="underline">Underline</span>, mdv2: '__under__', legacy: '—', html: '<u>under</u>' },
    { style: <span className="line-through">Strike</span>, mdv2: '~strike~', legacy: '—', html: '<s>strike</s>' },
    { style: <span>Spoiler</span>, mdv2: '||spoiler||', legacy: '—', html: '<tg-spoiler>x</tg-spoiler>' },
    { style: <code className="px-1 rounded bg-muted">Inline code</code>, mdv2: '`code`', legacy: '`code`', html: '<code>code</code>' },
    { style: <span>Code block</span>, mdv2: '```lang\\n…\\n```', legacy: 'same', html: '<pre>…</pre>' },
    { style: <span className="text-primary">Link</span>, mdv2: '[txt](url)', legacy: '[txt](url)', html: '<a href="url">txt</a>' },
    { style: <span>Mention</span>, mdv2: '[name](tg://user?id=123)', legacy: 'same', html: '<a href="tg://user?id=123">' },
    { style: <span>Blockquote</span>, mdv2: '>quoted line', legacy: '—', html: '<blockquote>…</blockquote>' },
  ];

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        Native Telegram inline formatting. Use <code className="px-1 rounded bg-muted">parse_mode: "MarkdownV2"</code> (recommended) or <code className="px-1 rounded bg-muted">"HTML"</code> in <code className="px-1 rounded bg-muted">sendMessage</code>. HTML is usually safer — fewer escape footguns.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Style</th>
              <th className="px-3 py-2 font-semibold">MarkdownV2</th>
              <th className="px-3 py-2 font-semibold">Legacy Markdown</th>
              <th className="px-3 py-2 font-semibold">HTML</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2">{r.style}</td>
                <td className="px-3 py-2 font-mono text-primary">{r.mdv2}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.legacy}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.html}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
        <p className="font-semibold text-yellow-500 text-xs uppercase tracking-wide">MarkdownV2 gotchas</p>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
          <li>
            Must escape these literal chars with <code className="px-1 rounded bg-muted">\</code>:{' '}
            <code className="px-1 rounded bg-muted">{'_ * [ ] ( ) ~ ` > # + - = | { } . !'}</code>
          </li>
          <li>Inside <code className="px-1 rounded bg-muted">code</code>/<code className="px-1 rounded bg-muted">pre</code>: escape <code className="px-1 rounded bg-muted">`</code> and <code className="px-1 rounded bg-muted">\</code> only.</li>
          <li>Inside <code className="px-1 rounded bg-muted">(url)</code>: escape <code className="px-1 rounded bg-muted">)</code> and <code className="px-1 rounded bg-muted">\</code>.</li>
          <li>Nesting: bold+italic OK (<code className="px-1 rounded bg-muted">*_both_*</code>), but entities can't cross-overlap.</li>
        </ul>
      </div>
    </div>
  );
}