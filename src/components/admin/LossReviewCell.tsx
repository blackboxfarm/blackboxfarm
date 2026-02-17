import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageSquarePlus, Save, Tag } from 'lucide-react';

const LOSS_TAG_OPTIONS = [
  'rug_pull',
  'dev_dump',
  'no_volume',
  'pump_and_dump',
  'fake_socials',
  'bundled_wallets',
  'bump_bot',
  'slow_bleed',
  'bonding_curve_dump',
  'copycat_token',
  'honeypot',
  'stale_dead',
  'bad_timing',
  'organic_decline',
  'whale_exit',
  'other',
] as const;

const TAG_COLORS: Record<string, string> = {
  rug_pull: 'bg-red-600/20 text-red-400 border-red-600/30',
  dev_dump: 'bg-red-500/20 text-red-400 border-red-500/30',
  no_volume: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  pump_and_dump: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  fake_socials: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  bundled_wallets: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  bump_bot: 'bg-pink-400/20 text-pink-300 border-pink-400/30',
  slow_bleed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  bonding_curve_dump: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  copycat_token: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  honeypot: 'bg-red-700/20 text-red-300 border-red-700/30',
  stale_dead: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  bad_timing: 'bg-yellow-600/20 text-yellow-300 border-yellow-600/30',
  organic_decline: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  whale_exit: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  other: 'bg-muted text-muted-foreground border-border',
};

interface LossReviewCellProps {
  positionId: string;
  currentTags: string[];
  currentReason: string | null;
  onUpdated: () => void;
}

export function LossReviewCell({ positionId, currentTags, currentReason, onUpdated }: LossReviewCellProps) {
  const [tags, setTags] = useState<string[]>(currentTags || []);
  const [reason, setReason] = useState(currentReason || '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pumpfun_fantasy_positions')
        .update({
          loss_tags: tags,
          manual_loss_reason: reason || null,
        } as any)
        .eq('id', positionId);
      if (error) throw error;
      toast.success('Loss review saved');
      setOpen(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasTags = currentTags && currentTags.length > 0;
  const hasReason = currentReason && currentReason.trim().length > 0;
  const isReviewed = hasTags || hasReason;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 px-1.5 text-xs gap-1 ${isReviewed ? 'text-yellow-400' : 'text-muted-foreground'}`}
          title={isReviewed ? `Reviewed: ${currentTags?.join(', ')}` : 'Add loss review'}
        >
          {isReviewed ? <Tag className="h-3 w-3" /> : <MessageSquarePlus className="h-3 w-3" />}
          {hasTags && <span>{currentTags.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <div className="text-sm font-medium">Loss Review Tags</div>
          <div className="flex flex-wrap gap-1.5">
            {LOSS_TAG_OPTIONS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-all ${
                  tags.includes(tag)
                    ? TAG_COLORS[tag] || 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:border-border'
                }`}
              >
                {tag.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Manual notes: what happened? bonding curve shape, dev behavior, etc."
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="text-xs h-20 resize-none"
          />
          <Button size="sm" onClick={save} disabled={saving} className="w-full h-7 text-xs">
            <Save className="h-3 w-3 mr-1" />
            {saving ? 'Saving...' : 'Save Review'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { LOSS_TAG_OPTIONS, TAG_COLORS };
