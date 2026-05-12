import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  tokenMint: string;
}

interface Summary {
  dev_wallet: string;
  total_tokens: number;
  classified_tokens: number;
  by_cause: Record<string, number>;
  sustained_hits: number;
  flash_hits: number;
  hard_rugs: number;
  slow_bleeds: number;
  bundle_rugs: number;
  community_collapses: number;
  inexperience_fails: number;
  dev_abandoneds: number;
  viral_memes: number;
  marketed_memes: number;
  skill_builds: number;
  skill_index: number | null;
  intent_index: number | null;
  luck_index: number | null;
  verdict_label: string | null;
  verdict_one_liner: string | null;
  ai_interpretation: string | null;
  best_token_ticker: string | null;
  best_token_ath_usd: number | null;
  last_recomputed_at: string;
}

interface FamilySummary {
  dev_wallet: string;
  family_size: number;
  family_wallets: string[];
  kyc_root_label: string | null;
  total_tokens: number;
  sustained_hits: number;
  viral_memes: number;
  hard_rugs: number;
  skill_index: number | null;
  intent_index: number | null;
  luck_index: number | null;
  verdict_label: string | null;
  verdict_one_liner: string | null;
  ai_interpretation: string | null;
  best_token_ticker: string | null;
  best_token_ath_usd: number | null;
}

const CAUSE_LABELS: Record<string, string> = {
  skill_build: 'Skill builds',
  marketed_memes: 'Marketed memes',
  viral_memes: 'Viral memes',
  sustained_hits: 'Sustained hits',
  flash_hits: 'Flash hits',
  community_collapses: 'Community collapses',
  inexperience_fails: 'Inexperience fails',
  dev_abandoneds: 'Dev abandoned',
  slow_bleeds: 'Slow bleeds',
  hard_rugs: 'Hard rugs',
  bundle_rugs: 'Bundle rugs',
};

export function DevTrackRecordCard({ tokenMint }: Props) {
  const { user } = useAuth();
  const { tierInfo } = useUserTier();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [family, setFamily] = useState<FamilySummary | null>(null);
  const [showFamilyWallets, setShowFamilyWallets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const isVerified = !!user?.email_confirmed_at;
  const isPaid = ['pro', 'dev', 'enterprise', 'x_subscriber'].includes(tierInfo.tierKey);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: lc } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet')
        .eq('token_mint', tokenMint)
        .maybeSingle();
      const dev = lc?.creator_wallet;
      if (!dev) { if (!cancelled) { setSummary(null); setLoading(false); } return; }
      const [{ data }, { data: famData }] = await Promise.all([
        supabase.from('dev_track_record_summary').select('*').eq('dev_wallet', dev).maybeSingle(),
        supabase.from('dev_family_track_record_summary').select('*').eq('dev_wallet', dev).maybeSingle(),
      ]);
      if (!cancelled) {
        setSummary(data as Summary | null);
        setFamily(famData as FamilySummary | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tokenMint]);

  if (loading || (!summary && !family)) return null;

  return (
    <>
    {summary && (
    <Card className="mt-8 p-5 bg-slate-900/40 border-slate-700">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Dev Track Record</div>
          <div className="text-lg font-semibold mt-1 text-foreground">
            {summary.verdict_label ?? 'Unscored dev'}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              · {summary.total_tokens} prior tokens
            </span>
          </div>
          {summary.verdict_one_liner && (
            <div className="text-sm text-muted-foreground mt-0.5">{summary.verdict_one_liner}</div>
          )}
        </div>
        {isPaid && summary.best_token_ticker && (
          <Badge variant="outline" className="text-xs">
            Best: ${summary.best_token_ticker} (~${Math.round(Number(summary.best_token_ath_usd) || 0).toLocaleString()})
          </Badge>
        )}
      </div>

      {/* Tier 2+: indices (logged-in users) */}
      {user && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <IndexChip label="Skill" value={summary.skill_index} hue="emerald" />
          <IndexChip label="Intent" value={summary.intent_index} hue="amber" signed />
          <IndexChip label="Luck" value={summary.luck_index} hue="sky" />
        </div>
      )}

      {/* Tier 3: counts breakdown (email-verified) */}
      {isVerified && (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Outcome breakdown</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {(['skill_builds','sustained_hits','marketed_memes','viral_memes','flash_hits','community_collapses','inexperience_fails','dev_abandoneds','slow_bleeds','hard_rugs','bundle_rugs'] as const).map(k => (
              <div key={k} className="flex justify-between bg-slate-800/40 rounded px-2 py-1">
                <span className="text-muted-foreground">{CAUSE_LABELS[k]}</span>
                <span className={
                  ['hard_rugs','bundle_rugs','slow_bleeds'].includes(k) && (summary as any)[k] > 0
                    ? 'text-red-400 font-semibold'
                    : ['skill_builds','sustained_hits'].includes(k) && (summary as any)[k] > 0
                      ? 'text-emerald-400 font-semibold'
                      : 'text-foreground'
                }>{(summary as any)[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tier 4: AI interpretation (paid) */}
      {isPaid && summary.ai_interpretation && (
        <div className="mt-5 border-t border-slate-700 pt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">AI interpretation</div>
          <p className="text-sm text-foreground/90 leading-relaxed">{summary.ai_interpretation}</p>
        </div>
      )}

      {/* Upsell tail for lower tiers */}
      {!user && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Sign in for skill/intent/luck indices. Verify email for full breakdown. Upgrade for AI interpretation.</span>
        </div>
      )}
      {user && !isVerified && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Verify your email to see the full per-cause breakdown.</span>
        </div>
      )}
      {isVerified && !isPaid && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Upgrade to Pro to unlock the AI interpretation and best-token highlight.</span>
        </div>
      )}

      {isPaid && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setExpanded(e => !e)}>
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Hide' : 'Show'} raw counts
          </Button>
          {expanded && (
            <pre className="mt-2 text-xs text-muted-foreground bg-slate-800/40 rounded p-2 overflow-x-auto">
{JSON.stringify(summary.by_cause, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
    )}

    {family && family.total_tokens > 0 && (
      <Card className="mt-4 p-5 bg-purple-950/20 border-purple-800/50">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Extended Dev-Family Track Record
            </div>
            <div className="text-lg font-semibold mt-1 text-foreground">
              {family.verdict_label ?? 'Operator cluster'}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                · {family.family_size} wallets · {family.total_tokens} prior tokens
              </span>
            </div>
            {family.verdict_one_liner && (
              <div className="text-sm text-muted-foreground mt-0.5">{family.verdict_one_liner}</div>
            )}
            {family.kyc_root_label && (
              <div className="text-xs text-muted-foreground mt-1">
                KYC root: <span className="text-purple-300">{family.kyc_root_label}</span>
              </div>
            )}
          </div>
          {isPaid && family.best_token_ticker && (
            <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-200">
              Family best: ${family.best_token_ticker} (~${Math.round(Number(family.best_token_ath_usd) || 0).toLocaleString()})
            </Badge>
          )}
        </div>

        {user && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <IndexChip label="Skill" value={family.skill_index} hue="emerald" />
            <IndexChip label="Intent" value={family.intent_index} hue="amber" signed />
            <IndexChip label="Luck" value={family.luck_index} hue="sky" />
          </div>
        )}

        {isPaid && family.ai_interpretation && (
          <div className="mt-5 border-t border-purple-800/40 pt-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">AI interpretation (family lens)</div>
            <p className="text-sm text-foreground/90 leading-relaxed">{family.ai_interpretation}</p>
          </div>
        )}

        {family.family_wallets?.length > 1 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setShowFamilyWallets(s => !s)}>
              <ChevronDown className={`h-3 w-3 transition-transform ${showFamilyWallets ? 'rotate-180' : ''}`} />
              {showFamilyWallets ? 'Hide' : 'Show'} {family.family_wallets.length} family wallets
            </Button>
            {showFamilyWallets && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs font-mono">
                {family.family_wallets.map(w => (
                  <a
                    key={w}
                    href={`/bubblemap?wallet=${w}`}
                    className="bg-purple-900/30 hover:bg-purple-900/60 rounded px-2 py-1 text-purple-200 truncate"
                  >
                    {w === family.dev_wallet ? '★ ' : ''}{w}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    )}
    </>
  );
}

function IndexChip({ label, value, hue, signed }: { label: string; value: number | null; hue: 'emerald' | 'amber' | 'sky'; signed?: boolean }) {
  if (value === null || value === undefined) return (
    <div className="bg-slate-800/40 rounded p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-muted-foreground">—</div>
    </div>
  );
  const display = signed && value > 0 ? `+${value}` : `${value}`;
  const color =
    hue === 'emerald' ? 'text-emerald-400'
    : hue === 'amber' ? (value < 0 ? 'text-red-400' : value > 0 ? 'text-emerald-400' : 'text-amber-400')
    : 'text-sky-400';
  return (
    <div className="bg-slate-800/40 rounded p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{display}</div>
    </div>
  );
}
