import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ALL_PLATFORMS, BREADCRUMB_PLATFORMS } from './exposure-shared';

const PLATFORMS = ALL_PLATFORMS;

interface PublicationFormProps {
  briefings: { id: string; title: string; slug: string }[];
  /** Existing publications, used to show per-platform post counts in the dropdown. */
  publications?: { briefing_id: string; platform: string }[];
  onSubmit: (data: {
    briefing_id: string;
    platform: string;
    content_depth: number;
    published_url: string;
    notes: string;
    published_at: string;
    is_breadcrumb: boolean;
  }) => void;
  isSubmitting?: boolean;
  initial?: {
    briefing_id: string;
    platform: string;
    content_depth: number;
    published_url: string;
    notes: string;
    published_at: string;
    is_breadcrumb?: boolean;
  };
}

export const PublicationForm = ({ briefings, onSubmit, isSubmitting, initial, publications = [] }: PublicationFormProps) => {
  const [briefingId, setBriefingId] = useState(initial?.briefing_id || '');
  const [platform, setPlatform] = useState(initial?.platform || '');
  const [customPlatform, setCustomPlatform] = useState('');
  const initialMode = initial?.is_breadcrumb
    ? 'breadcrumb'
    : String(initial?.content_depth || 100);
  const [depthMode, setDepthMode] = useState<string>(initialMode);
  const [publishedUrl, setPublishedUrl] = useState(initial?.published_url || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [date, setDate] = useState<Date>(initial?.published_at ? new Date(initial.published_at) : new Date());
  const [showCustom, setShowCustom] = useState(false);

  // Auto-suggest breadcrumb when user picks a typical breadcrumb platform.
  React.useEffect(() => {
    if (initial) return; // don't override during edit
    if (platform && BREADCRUMB_PLATFORMS.includes(platform)) {
      setDepthMode('breadcrumb');
    } else if (platform && depthMode === 'breadcrumb') {
      setDepthMode('100');
    }
  }, [platform, initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPlatform = showCustom ? customPlatform : platform;
    if (!briefingId || !finalPlatform) return;
    const isBreadcrumb = depthMode === 'breadcrumb';
    const contentDepth = isBreadcrumb ? 0 : parseInt(depthMode);
    onSubmit({
      briefing_id: briefingId,
      platform: finalPlatform,
      content_depth: contentDepth,
      published_url: publishedUrl,
      notes,
      published_at: date.toISOString(),
      is_breadcrumb: isBreadcrumb,
    });
    if (!initial) {
      setPublishedUrl('');
      setNotes('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-border rounded-lg bg-card">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Article</Label>
          <Select value={briefingId} onValueChange={setBriefingId}>
            <SelectTrigger><SelectValue placeholder="Select article..." /></SelectTrigger>
            <SelectContent>
              {briefings.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Platform</Label>
          {showCustom ? (
            <div className="flex gap-2">
              <Input value={customPlatform} onChange={e => setCustomPlatform(e.target.value)} placeholder="Custom platform..." />
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCustom(false)}>Back</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue placeholder="Select platform..." /></SelectTrigger>
                <SelectContent className="max-h-[420px]">
                  {PLATFORMS.map(p => {
                    const count = briefingId
                      ? publications.filter(pub => pub.briefing_id === briefingId && pub.platform === p).length
                      : 0;
                    return (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">
                          <span>{p}</span>
                          {count > 0 && (
                            <span className="text-xs text-primary font-mono">({count})</span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowCustom(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Content Depth</Label>
        <RadioGroup value={depthMode} onValueChange={setDepthMode} className="flex gap-4 flex-wrap">
          {[
            { val: '100', label: '100% Full', color: 'text-green-400' },
            { val: '75', label: '75% Substantial', color: 'text-blue-400' },
            { val: '50', label: '50% Condensed', color: 'text-amber-400' },
            { val: '25', label: '25% Teaser', color: 'text-red-400' },
            { val: 'breadcrumb', label: 'Breadcrumb (teaser linking back)', color: 'text-primary' },
          ].map(d => (
            <div key={d.val} className="flex items-center gap-2">
              <RadioGroupItem value={d.val} id={`depth-${d.val}`} />
              <Label htmlFor={`depth-${d.val}`} className={cn('cursor-pointer', d.color)}>{d.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Published Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, 'PPP')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={d => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label>URL (optional)</Label>
          <Input value={publishedUrl} onChange={e => setPublishedUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Rewritten for brevity..." />
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting || !briefingId || (!platform && !customPlatform)}>
        <Plus className="h-4 w-4 mr-1" />
        {initial ? 'Update' : 'Log Publication'}
      </Button>
    </form>
  );
};
