import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skull } from 'lucide-react';

interface Props {
  score: number;
  headline?: string | null;
  breakdown?: any | null;
  size?: 'sm' | 'md';
}

function harmClasses(score: number): string {
  if (score >= 86) return 'bg-black text-red-400 border-red-700/60';
  if (score >= 60) return 'bg-destructive/15 text-destructive border-destructive/40';
  if (score >= 25) return 'bg-amber-500/15 text-amber-500 border-amber-500/40';
  return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40';
}

export function HarmBadge({ score, headline, breakdown, size = 'sm' }: Props) {
  const cls = harmClasses(score);
  const text = `${size === 'sm' ? '' : 'HARM '}${score}/100`;
  const components = breakdown?.components as Record<string, number> | undefined;
  const badge = (
    <Badge variant="outline" className={`uppercase tracking-wider ${cls} ${size === 'md' ? 'text-xs' : 'text-[10px]'} gap-1`}>
      <Skull className="h-3 w-3" /> HARM {text}
    </Badge>
  );
  if (!headline && !components) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {headline && <div className="text-xs font-semibold mb-1">{headline}</div>}
          {components && (
            <ul className="text-[11px] space-y-0.5 text-muted-foreground">
              <li>Loss to holders: {components.loss}/35</li>
              <li>Bagholders: {components.bag}/20</li>
              <li>Drawdown: {components.draw}/15</li>
              <li>Dev extraction: {components.dev}/15</li>
              <li>Speed of death: {components.speed}/10</li>
              {breakdown?.intent && (
                <li className="pt-1 border-t border-border/50 mt-1">Intent: {breakdown.intent} (×{breakdown.multiplier})</li>
              )}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}