import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { PlatformConfig, MasterTemplateData } from "./platformConfigs";

interface PlatformPostCardProps {
  platform: PlatformConfig;
  master: MasterTemplateData;
  masterTemplateId?: string;
}

export function PlatformPostCard({ platform, master, masterTemplateId }: PlatformPostCardProps) {
  const [saved, setSaved] = React.useState(false);

  const bodyText = platform.maxChars
    ? (platform.hasTitle ? master.bodyLong : (master.bodyShort || master.bodyLong)).slice(0, platform.maxChars)
    : (platform.hasTitle ? master.bodyLong : (master.bodyShort || master.bodyLong));

  const hashtagLine = master.hashtags
    ? master.hashtags.split(',').map(t => t.trim()).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')
    : '';

  const fullPost = [
    platform.hasTitle && master.title ? '' : '', // title shown separately
    bodyText,
    master.ctaText,
    master.linkUrl ? `🔗 ${master.linkUrl}` : '',
    hashtagLine,
    master.tagsMentions,
  ].filter(Boolean).join('\n\n');

  const charCount = fullPost.length;
  const isOverLimit = platform.maxChars ? charCount > platform.maxChars : false;
  const missingImage = platform.requiresImage && !master.imageUrl;
  const missingVideo = platform.requiresVideo && !master.videoUrl;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const handleSaveAsPosted = async () => {
    try {
      const { error } = await supabase.from('social_posts_log').insert({
        platform: platform.id,
        content: fullPost,
        status: 'posted',
        post_type: 'manual',
        title: master.title || null,
        hashtags: master.hashtags || null,
        image_url: master.imageUrl || null,
        video_url: master.videoUrl || null,
        link_url: master.linkUrl || null,
        alt_text: master.altText || null,
        tags_mentions: master.tagsMentions || null,
        cta_text: master.ctaText || null,
        category: master.category || null,
        master_template_id: masterTemplateId || null,
      } as any);
      if (error) throw error;
      setSaved(true);
      toast.success(`Saved to ${platform.name} history`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span>{platform.emoji}</span>
            <span>{platform.name}</span>
            <Badge variant="outline" className={platform.colorClass + ' text-xs'}>
              {platform.apiStatus === 'has_api' ? '✅ API' : '🔒 Manual Only'}
            </Badge>
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => window.open(platform.postUrl, '_blank')} className="gap-1 text-xs">
              <ExternalLink className="h-3 w-3" /> Open
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(missingImage || missingVideo) && (
          <div className="flex items-center gap-2 text-yellow-400 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            {missingImage && 'Image required. '}
            {missingVideo && 'Video required.'}
          </div>
        )}

        {platform.hasTitle && master.title && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copyToClipboard(master.title, 'Title')}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-sm font-semibold border rounded p-2 bg-muted/30">{master.title}</p>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Post Body
              {platform.maxChars && (
                <span className={isOverLimit ? ' text-destructive' : ''}> ({charCount}/{platform.maxChars})</span>
              )}
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copyToClipboard(fullPost, 'Post')}>
              <Copy className="h-3 w-3 mr-1" /> Copy All
            </Button>
          </div>
          <pre className="text-sm border rounded p-3 bg-muted/30 whitespace-pre-wrap max-h-48 overflow-y-auto font-sans">{fullPost || <span className="text-muted-foreground italic">Fill in the Master Template to see preview</span>}</pre>
        </div>

        {master.imageUrl && (
          <div className="flex items-center gap-3">
            <img src={master.imageUrl} alt={master.altText || 'post image'} className="h-14 w-14 rounded object-cover border" />
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copyToClipboard(master.imageUrl, 'Image URL')}>
              <Copy className="h-3 w-3 mr-1" /> Image URL
            </Button>
          </div>
        )}

        {master.videoUrl && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">🎥 Video:</span>
            <span className="text-xs truncate max-w-[200px]">{master.videoUrl}</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copyToClipboard(master.videoUrl, 'Video URL')}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}

        {platform.notes && (
          <p className="text-xs text-muted-foreground italic">💡 {platform.notes}</p>
        )}

        <Button
          size="sm"
          variant={saved ? "secondary" : "default"}
          onClick={handleSaveAsPosted}
          disabled={saved}
          className="w-full gap-1.5"
        >
          {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : '✅ Mark as Posted'}
        </Button>
      </CardContent>
    </Card>
  );
}
