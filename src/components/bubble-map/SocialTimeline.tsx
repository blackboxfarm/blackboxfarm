import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, ArrowRight } from 'lucide-react';

interface SocialTimelineProps {
  tokenMint: string;
}

interface Snapshot {
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  phase: string;
  source: string;
  captured_at: string;
}

const phaseLabels: Record<string, { label: string; color: string }> = {
  launchpad: { label: '🚀 Launchpad', color: 'text-blue-400' },
  dex_paid: { label: '💎 DEX Paid', color: 'text-green-400' },
  cto: { label: '🔄 CTO', color: 'text-orange-400' },
  unknown: { label: '📋 Legacy', color: 'text-muted-foreground' },
  discovery: { label: '🔍 Discovery', color: 'text-muted-foreground' },
};

export default function SocialTimeline({ tokenMint }: SocialTimelineProps) {
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['social-timeline', tokenMint],
    queryFn: async () => {
      const { data } = await supabase
        .from('token_socials_history')
        .select('twitter, telegram, website, phase, source, captured_at')
        .eq('token_mint', tokenMint)
        .order('captured_at', { ascending: true });
      return (data || []) as Snapshot[];
    },
    enabled: !!tokenMint,
  });

  if (isLoading) return <div className="text-xs text-muted-foreground">Loading timeline...</div>;
  if (!snapshots || snapshots.length === 0) return null;

  // Group by phase, take first snapshot per phase
  const phases = new Map<string, Snapshot>();
  for (const s of snapshots) {
    const key = s.phase || 'unknown';
    if (!phases.has(key)) phases.set(key, s);
  }

  const entries = Array.from(phases.entries());

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Social Evolution
      </div>
      <div className="space-y-1.5">
        {entries.map(([phase, snap], i) => {
          const info = phaseLabels[phase] || phaseLabels.unknown;
          const socials = [
            snap.twitter && { label: 'X', url: snap.twitter },
            snap.telegram && { label: 'TG', url: snap.telegram },
            snap.website && { label: 'Web', url: snap.website },
          ].filter(Boolean) as { label: string; url: string }[];

          return (
            <div key={phase} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <div className={`w-2 h-2 rounded-full ${phase === 'cto' ? 'bg-orange-400' : phase === 'dex_paid' ? 'bg-green-400' : 'bg-blue-400'}`} />
                {i < entries.length - 1 && <div className="w-px h-4 bg-border" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium ${info.color}`}>
                  {info.label}
                  <span className="text-muted-foreground ml-1.5 font-normal">
                    {new Date(snap.captured_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {socials.map(s => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s.label}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                  {socials.length === 0 && (
                    <span className="text-[10px] text-muted-foreground italic">No links</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
