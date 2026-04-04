import { createClient } from "npm:@supabase/supabase-js@2";

export interface ResolvedMeta {
  og_title?: string;
  og_description?: string;
  og_image_url?: string;
  og_url?: string;
  og_type?: string;
  twitter_card?: string;
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
  canonical_url?: string;
}

/**
 * Resolves meta tags from the meta_tags_config table with cascade:
 *   article override → page override → sitewide default
 * 
 * Returns only the fields that have overrides; caller merges with its own defaults.
 */
export async function resolveMetaTags(opts: {
  scope: 'sitewide' | 'page' | 'article';
  routePath?: string;
  articleSlug?: string;
}): Promise<ResolvedMeta> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build cascade: sitewide → page → article (later wins)
    const merged: ResolvedMeta = {};

    // 1. Sitewide defaults
    const { data: sitewide } = await supabase
      .from("meta_tags_config")
      .select("*")
      .eq("scope", "sitewide")
      .eq("is_active", true)
      .maybeSingle();

    if (sitewide) applyOverrides(merged, sitewide);

    // 2. Page override (if route provided)
    if (opts.routePath) {
      const { data: page } = await supabase
        .from("meta_tags_config")
        .select("*")
        .eq("scope", "page")
        .eq("route_path", opts.routePath)
        .eq("is_active", true)
        .maybeSingle();

      if (page) applyOverrides(merged, page);
    }

    // 3. Article override (if slug provided)
    if (opts.articleSlug) {
      const { data: article } = await supabase
        .from("meta_tags_config")
        .select("*")
        .eq("scope", "article")
        .eq("article_slug", opts.articleSlug)
        .eq("is_active", true)
        .maybeSingle();

      if (article) applyOverrides(merged, article);
    }

    return merged;
  } catch (err) {
    console.error("[meta-tags-resolver] error:", err);
    return {};
  }
}

function applyOverrides(target: ResolvedMeta, source: Record<string, unknown>) {
  const fields: (keyof ResolvedMeta)[] = [
    'og_title', 'og_description', 'og_image_url', 'og_url', 'og_type',
    'twitter_card', 'twitter_title', 'twitter_description', 'twitter_image',
    'canonical_url',
  ];
  for (const f of fields) {
    const val = source[f];
    if (val && typeof val === 'string' && val.trim()) {
      target[f] = val.trim();
    }
  }
}
