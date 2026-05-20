import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, BookOpen } from "lucide-react";

interface NarrativeLink {
  url: string;
  title: string | null;
  source_domain: string | null;
  editor_note: string | null;
}

export function NarrativeLinkCard({ tokenMint }: { tokenMint: string }) {
  const [link, setLink] = useState<NarrativeLink | null>(null);

  useEffect(() => {
    if (!tokenMint) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("token_narrative_links")
        .select("url, title, source_domain, editor_note")
        .eq("token_mint", tokenMint)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setLink(data as any);
    })();
    return () => { cancelled = true; };
  }, [tokenMint]);

  if (!link) return null;

  return (
    <div className="rounded-lg border border-amber-400/30 bg-gradient-to-br from-amber-500/5 via-card to-yellow-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-300/90 font-semibold">
        <BookOpen className="h-3.5 w-3.5" />
        Editor Note — context, not financial advice
      </div>
      {link.title && <h4 className="text-sm font-semibold text-foreground">{link.title}</h4>}
      {link.editor_note && (
        <p className="text-xs text-foreground/80 leading-relaxed">{link.editor_note}</p>
      )}
      <a
        href={link.url}
        target="_blank"
        rel="noopener nofollow noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline"
      >
        Read source: {link.source_domain ?? "external article"}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}