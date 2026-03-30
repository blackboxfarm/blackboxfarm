import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Link2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const PRESET_SOURCES = [
  { value: 'twitter', label: '🐦 Twitter / X' },
  { value: 'telegram', label: '✈️ Telegram' },
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'facebook', label: '📘 Facebook' },
  { value: 'threads', label: '🧵 Threads' },
  { value: 'tiktok', label: '🎵 TikTok' },
  { value: 'discord', label: '💬 Discord' },
  { value: 'reddit', label: '🟠 Reddit' },
  { value: 'youtube', label: '▶️ YouTube' },
  { value: 'linkedin', label: '💼 LinkedIn' },
  { value: 'whatsapp', label: '💚 WhatsApp' },
  { value: 'email', label: '📧 Email' },
];

const PRESET_MEDIUMS = [
  { value: 'post', label: 'Post / Organic' },
  { value: 'bio', label: 'Bio / Profile Link' },
  { value: 'paid', label: 'Paid Ad' },
  { value: 'dm', label: 'Direct Message' },
  { value: 'channel', label: 'Channel / Group' },
  { value: 'story', label: 'Story / Reel' },
  { value: 'comment', label: 'Comment' },
  { value: 'pinned', label: 'Pinned Message' },
];

export function UTMLinkBuilder() {
  const [basePath, setBasePath] = useState('/holders');
  const [source, setSource] = useState('twitter');
  const [medium, setMedium] = useState('post');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');

  const baseUrl = 'https://blackboxfarm.lovable.app';

  const generatedUrl = useMemo(() => {
    const url = new URL(basePath, baseUrl);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', medium);
    if (campaign.trim()) url.searchParams.set('utm_campaign', campaign.trim().replace(/\s+/g, '_').toLowerCase());
    if (content.trim()) url.searchParams.set('utm_content', content.trim().replace(/\s+/g, '_').toLowerCase());
    return url.toString();
  }, [basePath, source, medium, campaign, content]);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(generatedUrl);
    toast.success('Link copied to clipboard!');
  };

  const recentLinks = useMemo(() => {
    try {
      const stored = localStorage.getItem('utm_link_history');
      return stored ? JSON.parse(stored) as string[] : [];
    } catch {
      return [];
    }
  }, []);

  const saveLink = () => {
    const history = [...recentLinks];
    if (!history.includes(generatedUrl)) {
      history.unshift(generatedUrl);
      if (history.length > 10) history.pop();
      localStorage.setItem('utm_link_history', JSON.stringify(history));
    }
    copyToClipboard();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          UTM Link Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Page */}
          <div className="space-y-1.5">
            <Label className="text-xs">Page</Label>
            <Select value={basePath} onValueChange={setBasePath}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/">Home</SelectItem>
                <SelectItem value="/holders">Holders Report</SelectItem>
                <SelectItem value="/features">Features</SelectItem>
                <SelectItem value="/pricing">Pricing</SelectItem>
                <SelectItem value="/tgbot">Telegram Bot</SelectItem>
                <SelectItem value="/bubble-promo">Bubblemaps</SelectItem>
                <SelectItem value="/adverts">Advertise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label className="text-xs">Source (platform)</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_SOURCES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Medium */}
          <div className="space-y-1.5">
            <Label className="text-xs">Medium (how)</Label>
            <Select value={medium} onValueChange={setMedium}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_MEDIUMS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campaign */}
          <div className="space-y-1.5">
            <Label className="text-xs">Campaign (optional)</Label>
            <Input
              placeholder="e.g. june_promo, rug_detection"
              value={campaign}
              onChange={e => setCampaign(e.target.value)}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Content ID (optional — differentiate same-source links)</Label>
            <Input
              placeholder="e.g. banner_top, cta_button"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
        </div>

        {/* Generated URL */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Generated Link</p>
          <p className="text-sm font-mono break-all text-foreground">{generatedUrl}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveLink} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={generatedUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Test
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
