import React from 'react';
import { ALL_PLATFORMS, PLATFORM_ICONS, PublicationLite, platformsForArticle, missingPlatforms } from './exposure-shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

interface ExposureCellProps {
  briefingId: string;
  publications: PublicationLite[];
  /** Show "X gaps" warning badge when more than this many platforms are missing. */
  gapThreshold?: number;
}

/**
 * Compact at-a-glance row of platform dots showing where this article has been
 * seeded. Filled = posted, hollow = not yet. Adds an amber alert when the
 * article has too many missing platforms.
 */
export const ExposureCell = ({ briefingId, publications, gapThreshold = 8 }: ExposureCellProps) => {
  const seen = platformsForArticle(publications, briefingId);
  const missing = missingPlatforms(publications, briefingId);
  const hasGaps = missing.length >= gapThreshold;
  const articlePubs = publications.filter(p => p.briefing_id === briefingId);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="inline-flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {ALL_PLATFORMS.map(p => {
            const Icon = PLATFORM_ICONS[p];
            const has = seen.has(p);
            const matching = articlePubs.filter(x => x.platform === p);
            return (
              <Tooltip key={p}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-3 h-3 rounded-sm transition-colors',
                      has ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground/40'
                    )}
                  >
                    {Icon && <Icon className="h-2 w-2" />}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{p}</p>
                  {has ? (
                    <p className="text-muted-foreground">{matching.length} post{matching.length !== 1 ? 's' : ''}</p>
                  ) : (
                    <p className="text-muted-foreground">Not seeded yet</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {hasGaps && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-amber-500 text-[10px] font-medium">
                <AlertTriangle className="h-3 w-3" />
                {missing.length}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] text-xs">
              <p className="font-medium mb-0.5">Missing on {missing.length} platforms:</p>
              <p className="text-muted-foreground">{missing.join(', ')}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};