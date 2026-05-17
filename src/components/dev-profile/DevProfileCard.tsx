import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useDevProfileCard } from '@/hooks/useDevProfileCard';
import { Copy, ExternalLink, Twitter, Send, Crown, ShieldCheck, ShieldAlert, Skull, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props {
  wallet: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function shortAddr(s?: string | null) {
  if (!s) return '—';
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
function copy(s: string, label = 'Copied') {
  navigator.clipboard.writeText(s);
  toast.success(label);
}
function fmtUsd(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
function fmtFollowers(n: number | null) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function TrustChip({ level }: { level: string }) {
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    trusted: { icon: ShieldCheck, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Trusted' },
    neutral: { icon: Sparkles, cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30', label: 'Neutral' },
    suspicious: { icon: ShieldAlert, cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Suspicious' },
    scammer: { icon: Skull, cls: 'bg-red-500/15 text-red-300 border-red-500/30', label: 'Scammer' },
    blacklisted: { icon: Skull, cls: 'bg-red-700/30 text-red-200 border-red-700/40', label: 'Blacklisted' },
    unknown: { icon: Sparkles, cls: 'bg-muted text-muted-foreground border-border', label: 'Unknown' },
  };
  const v = map[level] || map.unknown;
  const Icon = v.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${v.cls}`}>
      <Icon className="h-3 w-3" /> {v.label}
    </Badge>
  );
}

function tierGradient(tier: number | null): string {
  if (!tier) return 'from-zinc-700 via-zinc-800 to-zinc-900';
  if (tier >= 7) return 'from-amber-400 via-fuchsia-500 to-cyan-400';
  if (tier >= 6) return 'from-amber-400 via-orange-500 to-rose-500';
  if (tier >= 4) return 'from-yellow-500 via-amber-600 to-orange-700';
  return 'from-zinc-500 via-zinc-700 to-zinc-900';
}

export function DevProfileCard({ wallet, open, onOpenChange }: Props) {
  const { data, isLoading, error } = useDevProfileCard(wallet, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-background border border-border">
        {/* Holographic top border */}
        <div className={`h-2 w-full bg-gradient-to-r ${tierGradient(data?.tier ?? null)}`} />
        <DialogHeader className="px-6 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-amber-400" />
            Developer Profile
            {data?.tier && (
              <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                T{data.tier}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] px-6 pb-6">
          {isLoading && <div className="py-12 text-center text-sm text-muted-foreground">Loading dossier…</div>}
          {error && <div className="py-12 text-center text-sm text-red-400">Failed to load: {(error as Error).message}</div>}
          {data && (
            <div className="space-y-4 text-sm">
              {/* Identity */}
              <section>
                <div className="flex items-start gap-3">
                  <div className={`h-14 w-14 rounded-full bg-gradient-to-br ${tierGradient(data.tier)} flex items-center justify-center text-lg font-bold text-black/70`}>
                    {(data.identity.displayName || data.identity.xHandle || data.wallet).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {data.identity.displayName || <span className="text-muted-foreground italic">No display name</span>}
                    </div>
                    {data.identity.xHandle && (
                      <a href={`https://x.com/${data.identity.xHandle}`} target="_blank" rel="noreferrer"
                         className="text-sky-400 hover:text-sky-300 text-xs inline-flex items-center gap-1">
                        <Twitter className="h-3 w-3" /> @{data.identity.xHandle}
                        <span className="text-muted-foreground ml-1">• {fmtFollowers(data.identity.xFollowers)} followers</span>
                      </a>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <TrustChip level={data.careerStats.trustLevel} />
                      {data.careerStats.archetype && (
                        <Badge variant="outline" className="text-[10px]">{data.careerStats.archetype}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs italic text-foreground/80 border-l-2 border-amber-500/40 pl-3">{data.verdict}</p>
                {(data.identity.handleHistory?.length > 0 || data.identity.knownAliases?.length > 0) && (
                  <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
                    {data.identity.handleHistory?.length > 0 && (
                      <div>Prior handles: {data.identity.handleHistory.map(h => `@${h}`).join(', ')}</div>
                    )}
                    {data.identity.knownAliases?.length > 0 && (
                      <div>Aliases: {data.identity.knownAliases.join(', ')}</div>
                    )}
                  </div>
                )}
              </section>

              <Separator />

              {/* Wallet identity */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Wallet Graph</h3>
                <div className="space-y-1.5">
                  <WalletRow label="Master" addr={data.walletGraph.masterWallet} />
                  {data.walletGraph.kycRootWallet && <WalletRow label="KYC Root" addr={data.walletGraph.kycRootWallet} accent />}
                  <div className="text-[11px] text-muted-foreground">
                    Family size: <span className="text-foreground font-medium">{data.walletGraph.familySize}</span>
                    {data.walletGraph.linkedWallets.length > 0 && (
                      <> • Linked: {data.walletGraph.linkedWallets.length}</>
                    )}
                  </div>
                </div>
              </section>

              <Separator />

              {/* Top tokens */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Top 5 Best Tokens
                </h3>
                {data.bestTokens.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No proven tokens on file yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.bestTokens.map((t) => (
                      <div key={t.mint}
                           className={`flex items-center gap-2 rounded border px-2 py-1.5 ${t.isTierDefining ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/50'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">
                            ${t.symbol} <span className="text-muted-foreground font-normal text-xs">{t.name}</span>
                            {t.isTierDefining && <span className="ml-2 text-[9px] text-amber-400">★ TIER-DEFINING</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            ATH {fmtUsd(t.athMcap)}
                            {t.athAt && <> • {format(new Date(t.athAt), 'MMM d, yyyy')}</>}
                            {t.tier != null && <> • T{t.tier}</>}
                          </div>
                        </div>
                        <a href={`https://pump.fun/coin/${t.mint}`} target="_blank" rel="noreferrer"
                           className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <Separator />

              {/* Career stats */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Career</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Launched" v={data.careerStats.totalLaunched} />
                  <Stat label="Graduated" v={data.careerStats.graduated} />
                  <Stat label="Rugged" v={data.careerStats.rugged} cls={data.careerStats.rugged ? 'text-red-400' : ''} />
                  <Stat label="Success %" v={data.careerStats.successRatePct != null ? `${data.careerStats.successRatePct}%` : null} />
                  <Stat label="Avg ATH" v={fmtUsd(data.careerStats.avgPeakMcapUsd)} />
                  <Stat label="Rep Score" v={data.careerStats.reputationScore} />
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(data.careerStats.patterns).filter(([, v]) => v).map(([k]) => (
                    <Badge key={k} variant="outline" className="text-[9px] bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30">{k}</Badge>
                  ))}
                  {Object.entries(data.careerStats.flags).filter(([, v]) => v).map(([k]) => (
                    <Badge key={k} variant="outline" className="text-[9px] bg-orange-500/10 text-orange-300 border-orange-500/30">{k}</Badge>
                  ))}
                </div>
              </section>

              {/* Social footprint */}
              {(data.social.twitterAccounts.length || data.social.telegramGroups.length || data.social.discordServers.length || data.launchpadProfiles.length) ? (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Social & Launchpads</h3>
                    <div className="space-y-1 text-xs">
                      {data.social.twitterAccounts.map((h) => (
                        <a key={h} href={`https://x.com/${h.replace(/^@/, '')}`} target="_blank" rel="noreferrer"
                           className="flex items-center gap-1 text-sky-400 hover:text-sky-300">
                          <Twitter className="h-3 w-3" /> {h}
                        </a>
                      ))}
                      {data.social.telegramGroups.map((g) => (
                        <div key={g} className="flex items-center gap-1 text-cyan-400"><Send className="h-3 w-3" /> {g}</div>
                      ))}
                      {data.launchpadProfiles.map((lp) => (
                        <div key={`${lp.platform}-${lp.username}`} className="text-muted-foreground">
                          <span className="text-foreground font-medium">{lp.platform}</span>
                          {lp.username && <> • {lp.username}</>}
                          {lp.tokensCreated != null && <> • {lp.tokensCreated} created</>}
                          {lp.profileUrl && (
                            <a href={lp.profileUrl} target="_blank" rel="noreferrer" className="ml-1 text-sky-400">↗</a>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {/* KOLscan */}
              {data.kolscan && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">KOLscan</h3>
                    <a href={data.kolscan.url} target="_blank" rel="noreferrer"
                       className="text-sm text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                      {data.kolscan.handle} <ExternalLink className="h-3 w-3" />
                    </a>
                  </section>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function WalletRow({ label, addr, accent = false }: { label: string; addr: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`text-[10px] uppercase tracking-wider w-16 ${accent ? 'text-amber-400' : 'text-muted-foreground'}`}>{label}</span>
      <code className="font-mono text-[11px]">{shortAddr(addr)}</code>
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copy(addr, `${label} copied`)}>
        <Copy className="h-3 w-3" />
      </Button>
      <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function Stat({ label, v, cls = '' }: { label: string; v: any; cls?: string }) {
  return (
    <div className="rounded border border-border/50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-semibold ${cls}`}>{v ?? '—'}</div>
    </div>
  );
}