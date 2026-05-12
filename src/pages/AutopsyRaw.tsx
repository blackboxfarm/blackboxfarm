import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAutopsy } from '@/data/autopsies';
import { supabase } from '@/integrations/supabase/client';

/**
 * Renders the raw .md source as inline plain text in the browser.
 * No site chrome, no markdown rendering — just the source, viewable
 * directly without forcing a download.
 */
export default function AutopsyRaw() {
  const { slug } = useParams<{ slug: string }>();
  const staticAutopsy = slug ? getAutopsy(slug) : undefined;
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        if (staticAutopsy) {
          document.title = `${staticAutopsy.title} — Raw Source`;
          const r = await fetch(staticAutopsy.mdPath);
          if (!r.ok) throw new Error('not found');
          setContent(await r.text());
          return;
        }
        // DB-backed autopsy
        const { data } = await supabase
          .from('autopsy_reports')
          .select('title, md_content, md_path')
          .eq('slug', slug)
          .eq('is_current', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) { setError(true); return; }
        document.title = `${data.title} — Raw Source`;
        if (data.md_content) { setContent(data.md_content); return; }
        if (data.md_path) {
          const r = await fetch(data.md_path);
          if (!r.ok) throw new Error('not found');
          setContent(await r.text());
          return;
        }
        setError(true);
      } catch {
        setError(true);
      }
    })();
  }, [slug, staticAutopsy]);

  return (
    <pre
      style={{
        margin: 0,
        padding: '24px',
        background: '#ffffff',
        color: '#0f172a',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '13px',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: '100vh',
      }}
    >
      {error ? 'Failed to load autopsy source.' : content || 'Loading…'}
    </pre>
  );
}