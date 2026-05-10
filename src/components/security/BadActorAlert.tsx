import React from 'react';
import { AlertTriangle, Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useBadActorCheck } from '@/hooks/useBadActorCheck';

interface Props {
  tokenMint?: string | null;
  walletAddress?: string | null;
  xHandle?: string | null;
  className?: string;
}

const REASON_LABELS: Record<string, string> = {
  blacklisted_token: 'Token mint is blacklisted',
  blacklisted_dev: 'Developer wallet is blacklisted',
  blacklisted_x_handle: 'X handle is blacklisted',
  scammer: 'Developer flagged as scammer',
  serial_rugger: 'Developer is a serial rugger',
  blacklisted: 'Developer reputation: blacklisted',
  serial_spammer: 'Developer pattern: serial spammer',
  fee_farmer: 'Developer pattern: fee farmer',
  mesh_linked: 'Wallet linked to blacklisted entity via funding chain',
  recycled_community: 'X community is a recycled vehicle for prior rugs',
};

export function BadActorAlert({ tokenMint, walletAddress, xHandle, className = '' }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useBadActorCheck({ tokenMint, walletAddress, xHandle });

  if (isLoading || !data || !data.isBadActor) return null;

  const isCritical = data.level === 'critical';
  const isHigh = data.level === 'high';
  const isLocked = data.locked;

  // Count of evidence categories present (visible to free users as teaser)
  const evidenceCount =
    (data.counts.blacklistEntries > 0 ? 1 : 0) +
    (data.counts.hasDevReputation ? 1 : 0) +
    (data.counts.meshLinks > 0 ? 1 : 0) +
    (data.counts.recycledCommunities > 0 ? 1 : 0) +
    (data.counts.launchHistory > 0 ? 1 : 0);

  const banner = isCritical
    ? 'bg-red-600 border-red-800 text-white'
    : isHigh
    ? 'bg-orange-600 border-orange-800 text-white'
    : 'bg-yellow-600 border-yellow-800 text-black';

  return (
    <div
      className={`rounded-lg border-2 shadow-lg p-5 md:p-6 ${banner} ${className}`}
      role="alert"
      aria-live="assertive"
      data-bad-actor-level={data.level}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <AlertTriangle className="h-8 w-8 md:h-10 md:w-10 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight">
            {data.headline}
          </div>
          <div className="mt-2 text-sm md:text-base font-semibold opacity-95">
            {isCritical
              ? 'This entity is on the BlackBox Farm bad-actor list. Trade at extreme risk.'
              : isHigh
              ? 'This entity has confirmed links to known bad actors. Proceed with caution.'
              : 'This entity shows signals consistent with recycled rug operations.'}
          </div>

          {/* Public-safe reason chips (no doxxing detail) */}
          {data.reasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.reasons.map((r) => (
                <span
                  key={r}
                  className="px-2 py-1 rounded text-xs font-bold bg-black/30 backdrop-blur-sm border border-white/20"
                >
                  {REASON_LABELS[r] || r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {isLocked ? (
            <div className="mt-4 rounded-md bg-black/40 backdrop-blur-sm border border-white/20 p-3">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="h-4 w-4" />
                Subscriber-only intelligence
              </div>
              <div className="text-xs md:text-sm mt-1 opacity-90">
                Full Dev Reputation, KYC profile, linked wallets, launch history, social mesh and
                community ties are available to Pro subscribers.
                {evidenceCount > 0 && (
                  <> We have <span className="font-bold">{evidenceCount}</span> evidence{evidenceCount === 1 ? '' : ' categories'} on file for this entity.</>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 gap-2 font-bold"
                onClick={() => navigate('/pricing')}
              >
                <Crown className="h-4 w-4" />
                Unlock Bad Actor Intel
              </Button>
            </div>
          ) : (
            <BadActorDetails details={data.details} />
          )}
        </div>
      </div>
    </div>
  );
}

function BadActorDetails({ details }: { details: any }) {
  if (!details) return null;
  const { blacklistEntries, devReputation, meshLinks, recycledCommunities, launchHistory } = details;
  return (
    <div className="mt-4 space-y-3 rounded-md bg-black/40 backdrop-blur-sm border border-white/20 p-3 text-xs md:text-sm">
      {devReputation && (
        <div>
          <div className="font-bold uppercase tracking-wide opacity-90">Developer Reputation</div>
          <div className="opacity-95 mt-1">
            <span className="font-mono text-[10px] md:text-xs">{devReputation.wallet}</span>
            <div>
              Trust: <b>{devReputation.trust_level || '—'}</b> · Score: <b>{devReputation.reputation_score ?? '—'}</b> ·
              Launched: <b>{devReputation.tokens_launched ?? 0}</b> · Rugged: <b>{devReputation.tokens_rugged ?? 0}</b>
              {devReputation.dev_pattern && <> · Pattern: <b>{devReputation.dev_pattern}</b></>}
            </div>
          </div>
        </div>
      )}
      {blacklistEntries?.length > 0 && (
        <div>
          <div className="font-bold uppercase tracking-wide opacity-90">Blacklist Entries ({blacklistEntries.length})</div>
          <ul className="mt-1 space-y-1">
            {blacklistEntries.slice(0, 5).map((e: any, i: number) => (
              <li key={i} className="font-mono text-[10px] md:text-xs">
                [{e.entry_type || 'unknown'}] {e.identifier?.slice(0, 12)}…{e.identifier?.slice(-6)} —{' '}
                <span className="font-sans">{e.blacklist_reason || e.risk_level || 'flagged'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {meshLinks?.length > 0 && (
        <div>
          <div className="font-bold uppercase tracking-wide opacity-90">Funding Chain Links ({meshLinks.length})</div>
          <ul className="mt-1 space-y-1">
            {meshLinks.slice(0, 5).map((l: any, i: number) => (
              <li key={i} className="font-mono text-[10px] md:text-xs">
                {l.relationship.replace(/_/g, ' ')} → {l.linked_id?.slice(0, 8)}… ({l.blacklisted_reason || 'blacklisted'})
              </li>
            ))}
          </ul>
        </div>
      )}
      {recycledCommunities?.length > 0 && (
        <div>
          <div className="font-bold uppercase tracking-wide opacity-90">Recycled X Communities</div>
          <ul className="mt-1 space-y-1">
            {recycledCommunities.map((c: any, i: number) => (
              <li key={i} className="text-[11px] md:text-xs">
                {c.name || c.community_id} — band: <b>{c.recycled_band}</b> (score {c.recycled_score})
              </li>
            ))}
          </ul>
        </div>
      )}
      {launchHistory?.length > 0 && (
        <div>
          <div className="font-bold uppercase tracking-wide opacity-90">
            Launch History ({launchHistory.length} prior tokens)
          </div>
          <div className="text-[11px] md:text-xs opacity-90 mt-1">
            {(() => {
              const failed = launchHistory.filter((t: any) => t.outcome === 'failed' || t.outcome === 'rugged').length;
              const success = launchHistory.filter((t: any) => t.outcome === 'success' || t.outcome === 'graduated').length;
              return <>Failed: <b>{failed}</b> · Success: <b>{success}</b></>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}