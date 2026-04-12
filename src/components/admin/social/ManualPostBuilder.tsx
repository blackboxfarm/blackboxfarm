import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GalleryPickerButton } from "./GalleryPickerButton";
import { PlatformPostCard } from "./PlatformPostCard";
import { ManualPostHistory } from "./ManualPostHistory";
import { PLATFORM_CONFIGS, CATEGORIES, type MasterTemplateData } from "./platformConfigs";
import { Image, Link, Hash, FileText, Video } from "lucide-react";

const emptyTemplate: MasterTemplateData = {
  title: '', bodyLong: '', bodyShort: '', hashtags: '',
  imageUrl: '', videoUrl: '', linkUrl: '', altText: '',
  tagsMentions: '', ctaText: '', category: '',
};

export function ManualPostBuilder() {
  const [master, setMaster] = useState<MasterTemplateData>({ ...emptyTemplate });
  const [templateId] = useState(() => crypto.randomUUID());
  const [activeTab, setActiveTab] = useState('master');

  const update = (field: keyof MasterTemplateData, value: string) =>
    setMaster(prev => ({ ...prev, [field]: value }));

  const resetTemplate = () => {
    setMaster({ ...emptyTemplate });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap gap-0.5">
          <TabsTrigger value="master" className="gap-1">📋 Master Template</TabsTrigger>
          {PLATFORM_CONFIGS.map(p => (
            <TabsTrigger key={p.id} value={p.id} className="gap-1 text-xs">
              {p.emoji} {p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name}
            </TabsTrigger>
          ))}
          <TabsTrigger value="history" className="gap-1">📜 History</TabsTrigger>
        </TabsList>

        <TabsContent value="master">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>📋 Master Post Template</span>
                <Button size="sm" variant="outline" onClick={resetTemplate}>Clear All</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Title + Category */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label className="flex items-center gap-1"><FileText className="h-3 w-3" /> Title / Headline</Label>
                  <Input value={master.title} onChange={e => update('title', e.target.value)} placeholder="Post title (YouTube, Medium, Reddit, etc.)" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={master.category} onValueChange={v => update('category', v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Body Long */}
              <div className="space-y-2">
                <Label>Body Text (Long) — full post for long-form platforms</Label>
                <Textarea value={master.bodyLong} onChange={e => update('bodyLong', e.target.value)} placeholder="Full post content..." rows={6} />
                <p className="text-xs text-muted-foreground text-right">{master.bodyLong.length} chars</p>
              </div>

              {/* Row 3: Body Short */}
              <div className="space-y-2">
                <Label>Body Text (Short) — for X, Threads, etc. (optional override)</Label>
                <Textarea value={master.bodyShort} onChange={e => update('bodyShort', e.target.value)} placeholder="Short version for character-limited platforms..." rows={3} />
                <p className="text-xs text-muted-foreground text-right">{master.bodyShort.length} chars</p>
              </div>

              {/* Row 4: Hashtags + Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Hash className="h-3 w-3" /> Hashtags (comma-separated)</Label>
                  <Input value={master.hashtags} onChange={e => update('hashtags', e.target.value)} placeholder="crypto, solana, defi, trading" />
                </div>
                <div className="space-y-2">
                  <Label>Tags / Mentions (@handles)</Label>
                  <Input value={master.tagsMentions} onChange={e => update('tagsMentions', e.target.value)} placeholder="@blackboxfarm @solana" />
                </div>
              </div>

              {/* Row 5: Image + Video */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Image className="h-3 w-3" /> Image URL</Label>
                  <div className="flex gap-2">
                    <Input value={master.imageUrl} onChange={e => update('imageUrl', e.target.value)} placeholder="https://..." className="flex-1" />
                    <GalleryPickerButton onSelect={url => update('imageUrl', url)} />
                  </div>
                  {master.imageUrl && <img src={master.imageUrl} alt="preview" className="h-16 w-16 object-cover rounded border" />}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Video className="h-3 w-3" /> Video URL</Label>
                  <Input value={master.videoUrl} onChange={e => update('videoUrl', e.target.value)} placeholder="https://..." />
                </div>
              </div>

              {/* Row 6: Link + Alt + CTA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Link className="h-3 w-3" /> Link URL</Label>
                  <Input value={master.linkUrl} onChange={e => update('linkUrl', e.target.value)} placeholder="https://blackbox.farm" />
                </div>
                <div className="space-y-2">
                  <Label>Alt Text</Label>
                  <Input value={master.altText} onChange={e => update('altText', e.target.value)} placeholder="Image description for accessibility" />
                </div>
                <div className="space-y-2">
                  <Label>CTA Text</Label>
                  <Input value={master.ctaText} onChange={e => update('ctaText', e.target.value)} placeholder="Join the alpha → blackbox.farm" />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  👆 Fill in above, then click through the <strong>25 platform tabs</strong> to see your post formatted for each platform.
                  Use <strong>Copy All</strong> + <strong>Open Platform</strong> to manually post, then <strong>Mark as Posted</strong> to log it.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {PLATFORM_CONFIGS.map(platform => (
          <TabsContent key={platform.id} value={platform.id}>
            <PlatformPostCard platform={platform} master={master} masterTemplateId={templateId} />
          </TabsContent>
        ))}

        <TabsContent value="history">
          <ManualPostHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
