import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { getAutopsy } from '@/data/autopsies';

/**
 * Renders the raw .md source as inline plain text in the browser.
 * No site chrome, no markdown rendering — just the source, viewable
 * directly without forcing a download.
 */
export default function AutopsyRaw() {
  const { slug } = useParams<{ slug: string }>();
  const autopsy = slug ? getAutopsy(slug) : undefined;
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!autopsy) return;
    document.title = `${autopsy.title} — Raw Source`;
    fetch(autopsy.mdPath)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, [autopsy]);

  if (!autopsy) return <Navigate to="/autopsy" replace />;

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