import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Search, CheckCircle2, XCircle, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

interface DiagnosticResult {
  slug: string;
  source: string;
  status: 'ok' | 'error' | 'warning';
  canonical?: string;
  ogUrl?: string;
  ogType?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterImage?: string;
  articleMeta?: boolean;
  rawHtml?: string;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function OgMetaDiagnostic() {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  const runDiagnostic = async () => {
    if (!slug.trim()) return;
    setLoading(true);
    setResults([]);

    const cleanSlug = slug.trim().replace(/^\/intel\/briefing\//, '').replace(/\/$/, '');

    // Test all three sources in parallel
    const [ogMetaResult, intelShareResult, publishedResult] = await Promise.allSettled([
      testOgMeta(cleanSlug),
      testIntelShare(cleanSlug),
      testPublishedUrl(cleanSlug),
    ]);

    const newResults: DiagnosticResult[] = [];

    if (ogMetaResult.status === 'fulfilled') newResults.push(ogMetaResult.value);
    else newResults.push({ slug: cleanSlug, source: 'og-meta edge function', status: 'error', error: ogMetaResult.reason?.message });

    if (intelShareResult.status === 'fulfilled') newResults.push(intelShareResult.value);
    else newResults.push({ slug: cleanSlug, source: 'intel-share edge function', status: 'error', error: intelShareResult.reason?.message });

    if (publishedResult.status === 'fulfilled') newResults.push(publishedResult.value);
    else newResults.push({ slug: cleanSlug, source: 'Published URL (blackbox.farm)', status: 'error', error: publishedResult.reason?.message });

    setResults(newResults);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="h-5 w-5" />
          OG Meta Diagnostic
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter article slug (e.g. how-to-detect-a-rug-pull)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runDiagnostic()}
          />
          <Button onClick={runDiagnostic} disabled={loading || !slug.trim()}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Test'}
          </Button>
        </div>

        {results.map((result, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {result.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                  {result.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                  <span className="font-medium text-sm">{result.source}</span>
                </div>
                <Badge variant={result.status === 'ok' ? 'default' : result.status === 'warning' ? 'secondary' : 'destructive'}>
                  {result.status}
                </Badge>
              </div>

              {result.error && (
                <p className="text-sm text-destructive">{result.error}</p>
              )}

              {result.canonical && (
                <div className="grid grid-cols-[120px_1fr] gap-1 text-xs">
                  <MetaRow label="canonical" value={result.canonical} isArticleSpecific={result.canonical.includes('/intel/briefing/')} />
                  <MetaRow label="og:url" value={result.ogUrl} isArticleSpecific={result.ogUrl?.includes('/intel/briefing/')} />
                  <MetaRow label="og:type" value={result.ogType} isArticleSpecific={result.ogType === 'article'} />
                  <MetaRow label="og:title" value={result.ogTitle} />
                  <MetaRow label="og:image" value={result.ogImage} isArticleSpecific={!result.ogImage?.includes('blackbox-og-image')} />
                  <MetaRow label="twitter:image" value={result.twitterImage} isArticleSpecific={!result.twitterImage?.includes('blackbox-og-image')} />
                  <MetaRow label="article:*" value={result.articleMeta ? 'present' : 'missing'} isArticleSpecific={result.articleMeta} />
                </div>
              )}

              {result.ogImage && !result.ogImage.includes('blackbox-og-image') && (
                <div className="mt-2">
                  <img src={result.ogImage} alt="OG Preview" className="max-w-[300px] rounded border border-border" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

function MetaRow({ label, value, isArticleSpecific }: { label: string; value?: string; isArticleSpecific?: boolean }) {
  if (!value) return null;
  return (
    <>
      <span className="text-muted-foreground font-mono">{label}</span>
      <span className={`break-all ${isArticleSpecific ? 'text-green-400' : 'text-yellow-400'}`}>
        {value.length > 120 ? value.slice(0, 120) + '…' : value}
        {isArticleSpecific === false && <span className="ml-1 text-yellow-500">(⚠ default)</span>}
      </span>
    </>
  );
}

function parseMetaFromHtml(html: string): Partial<DiagnosticResult> {
  const get = (pattern: RegExp) => html.match(pattern)?.[1] || undefined;
  return {
    canonical: get(/rel="canonical"\s+href="([^"]+)"/i) || get(/href="([^"]+)"\s+rel="canonical"/i),
    ogUrl: get(/property="og:url"\s+content="([^"]+)"/i),
    ogType: get(/property="og:type"\s+content="([^"]+)"/i),
    ogTitle: get(/property="og:title"\s+content="([^"]+)"/i),
    ogDescription: get(/property="og:description"\s+content="([^"]+)"/i)?.slice(0, 100),
    ogImage: get(/property="og:image"\s+content="([^"]+)"/i),
    twitterImage: get(/name="twitter:image"\s+content="([^"]+)"/i),
    articleMeta: /article:published_time/i.test(html),
  };
}

async function testOgMeta(slug: string): Promise<DiagnosticResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/og-meta?slug=${encodeURIComponent(slug)}`);
  const html = await res.text();
  const meta = parseMetaFromHtml(html);
  const isCorrect = meta.canonical?.includes('/intel/briefing/') && meta.ogImage && !meta.ogImage.includes('blackbox-og-image');
  return {
    slug,
    source: 'og-meta edge function',
    status: isCorrect ? 'ok' : 'warning',
    ...meta,
  };
}

async function testIntelShare(slug: string): Promise<DiagnosticResult> {
  // intel-share redirects humans, so we need to check with a bot UA
  const res = await fetch(`${SUPABASE_URL}/functions/v1/intel-share?slug=${encodeURIComponent(slug)}`, {
    headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    redirect: 'manual',
  });

  // If it's a redirect (human path), check Location
  if (res.status === 302) {
    const location = res.headers.get('location') || '';
    return {
      slug,
      source: 'intel-share edge function',
      status: location.includes('/intel/briefing/') ? 'ok' : 'warning',
      canonical: location,
      ogUrl: location,
    };
  }

  const html = await res.text();
  const meta = parseMetaFromHtml(html);
  const isCorrect = meta.canonical?.includes('/intel/briefing/') && meta.ogImage && !meta.ogImage.includes('blackbox-og-image');
  return {
    slug,
    source: 'intel-share edge function',
    status: isCorrect ? 'ok' : 'warning',
    ...meta,
  };
}

async function testPublishedUrl(slug: string): Promise<DiagnosticResult> {
  try {
    // We can't fetch blackbox.farm from the browser due to CORS, so test via og proxy
    const res = await fetch(`https://blackbox.farm/intel/briefing/${slug}`, { redirect: 'manual' });
    const html = await res.text();
    const meta = parseMetaFromHtml(html);

    const isRoot = meta.canonical === 'https://blackbox.farm' || meta.ogUrl === 'https://blackbox.farm';
    return {
      slug,
      source: 'Published URL (blackbox.farm)',
      status: isRoot ? 'error' : 'ok',
      error: isRoot ? 'Serving root SPA shell — Cloudflare Worker not active for this route' : undefined,
      ...meta,
    };
  } catch {
    return {
      slug,
      source: 'Published URL (blackbox.farm)',
      status: 'warning',
      error: 'Could not fetch (CORS blocked from browser — test manually with curl)',
    };
  }
}
