import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Globe, FileText, BookOpen, Upload, RotateCcw, Save, Trash2, Plus, ExternalLink, Shield } from 'lucide-react';

interface MetaTagEntry {
  id?: string;
  scope: 'sitewide' | 'page' | 'article';
  route_path?: string;
  article_slug?: string;
  og_title?: string;
  og_description?: string;
  og_image_url?: string;
  og_url?: string;
  og_type?: string;
  twitter_card?: string;
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
  canonical_url?: string;
  is_active: boolean;
}

const KNOWN_ROUTES = [
  { path: '/', label: 'Home' },
  { path: '/holders', label: 'Holders' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/features', label: 'Features' },
  { path: '/security', label: 'Security' },
  { path: '/api', label: 'API Landing' },
  { path: '/api-docs', label: 'API Docs' },
  { path: '/bumpbot', label: 'Bump Bot' },
  { path: '/volumebot', label: 'Volume Bot' },
  { path: '/holders-info', label: 'Holders Info' },
  { path: '/holders-bot', label: 'Holders Bot' },
  { path: '/ai-analysis', label: 'AI Analysis' },
  { path: '/about', label: 'About Us' },
  { path: '/contact', label: 'Contact Us' },
  { path: '/whitepaper', label: 'Whitepaper' },
  { path: '/intel', label: 'Intel Briefings List' },
  { path: '/feed', label: 'Feed' },
  { path: '/bubblepromo', label: 'Bubble Promo' },
  { path: '/tgbot', label: 'Telegram Bot' },
];

const HARDCODED_DEFAULTS: Omit<MetaTagEntry, 'scope'> = {
  og_title: 'BlackBox Farm',
  og_description: 'Advanced DeFi trading tools, automated bots, and community-driven campaigns on Solana blockchain',
  og_image_url: 'https://blackbox.farm/assets/blackbox-og-image.png',
  og_url: 'https://blackbox.farm',
  og_type: 'website',
  twitter_card: 'summary_large_image',
  twitter_title: 'BlackBox Farm',
  twitter_description: 'Advanced DeFi trading tools, automated bots, and community-driven campaigns on Solana blockchain',
  twitter_image: 'https://blackbox.farm/assets/blackbox-og-image.png',
  canonical_url: 'https://blackbox.farm',
  is_active: true,
};

const STORAGE_KEY = 'meta_tags_saved_defaults';

function getSavedDefaults(): Omit<MetaTagEntry, 'scope'> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return HARDCODED_DEFAULTS;
}

const emptyEntry = (scope: 'sitewide' | 'page' | 'article'): MetaTagEntry => ({
  scope,
  og_title: '',
  og_description: '',
  og_image_url: '',
  og_url: '',
  og_type: 'website',
  twitter_card: 'summary_large_image',
  twitter_title: '',
  twitter_description: '',
  twitter_image: '',
  canonical_url: '',
  is_active: true,
});

export function MetaTagsManager() {
  const { toast } = useToast();
  const [activeScope, setActiveScope] = useState<'sitewide' | 'page' | 'article'>('sitewide');
  const [entries, setEntries] = useState<MetaTagEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<MetaTagEntry>(emptyEntry('sitewide'));
  const [articles, setArticles] = useState<{ slug: string; title: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [selectedArticle, setSelectedArticle] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadEntries();
    loadArticles();
  }, []);

  useEffect(() => {
    if (activeScope === 'sitewide') {
      const sitewide = entries.find(e => e.scope === 'sitewide');
      setCurrentEntry(sitewide || emptyEntry('sitewide'));
    }
  }, [activeScope, entries]);

  const loadEntries = async () => {
    const { data } = await supabase
      .from('meta_tags_config')
      .select('*')
      .eq('is_active', true)
      .order('scope');
    if (data) setEntries(data as MetaTagEntry[]);
  };

  const loadArticles = async () => {
    const { data } = await supabase
      .from('intel_briefings')
      .select('slug, title')
      .order('created_at', { ascending: false });
    if (data) setArticles(data);
  };

  const handlePageSelect = (path: string) => {
    setSelectedPage(path);
    const existing = entries.find(e => e.scope === 'page' && e.route_path === path);
    setCurrentEntry(existing || { ...emptyEntry('page'), route_path: path });
  };

  const handleArticleSelect = (slug: string) => {
    setSelectedArticle(slug);
    const existing = entries.find(e => e.scope === 'article' && e.article_slug === slug);
    setCurrentEntry(existing || { ...emptyEntry('article'), article_slug: slug });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'og_image_url' | 'twitter_image') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `meta-tags/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('social-gallery').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('social-gallery').getPublicUrl(fileName);
      setCurrentEntry(prev => ({ ...prev, [field]: urlData.publicUrl }));
      toast({ title: 'Image uploaded', description: 'Image URL has been set.' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { ...currentEntry };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;

      if (currentEntry.id) {
        const { error } = await supabase
          .from('meta_tags_config')
          .update(payload)
          .eq('id', currentEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('meta_tags_config')
          .insert(payload);
        if (error) throw error;
      }
      toast({ title: 'Saved', description: `Meta tags for ${activeScope} saved successfully.` });
      await loadEntries();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const DEFAULTS = getSavedDefaults();
    if (activeScope === 'sitewide') {
      setCurrentEntry({ ...emptyEntry('sitewide'), ...DEFAULTS, scope: 'sitewide', id: currentEntry.id });
    } else if (activeScope === 'page') {
      setCurrentEntry({ ...emptyEntry('page'), route_path: selectedPage, id: currentEntry.id });
    } else {
      setCurrentEntry({ ...emptyEntry('article'), article_slug: selectedArticle, id: currentEntry.id });
    }
    toast({ title: 'Reset', description: 'Fields reset to defaults. Click Save to apply.' });
  };

  const handleSetAsDefault = () => {
    const { id, scope, route_path, article_slug, ...fields } = currentEntry as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    toast({ title: 'Defaults Updated', description: 'Current settings are now the new defaults for "Reset to Defaults".' });
  };

  const handleDelete = async () => {
    if (!currentEntry.id) return;
    const { error } = await supabase.from('meta_tags_config').delete().eq('id', currentEntry.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted', description: 'Meta tag override removed. Sitewide defaults will apply.' });
    setCurrentEntry(emptyEntry(activeScope));
    await loadEntries();
  };

  const updateField = (field: keyof MetaTagEntry, value: string) => {
    setCurrentEntry(prev => ({ ...prev, [field]: value }));
  };

  const pageEntries = entries.filter(e => e.scope === 'page');
  const articleEntries = entries.filter(e => e.scope === 'article');

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="h-5 w-5 text-primary" />
          Meta Tags Manager
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Manage OG/SEO meta tags: sitewide defaults → per-page overrides → per-article overrides. 
          Empty fields inherit from the level above.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeScope} onValueChange={v => setActiveScope(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="sitewide" className="gap-1"><Globe className="h-3.5 w-3.5" /> Sitewide</TabsTrigger>
            <TabsTrigger value="page" className="gap-1"><FileText className="h-3.5 w-3.5" /> Per Page ({pageEntries.length})</TabsTrigger>
            <TabsTrigger value="article" className="gap-1"><BookOpen className="h-3.5 w-3.5" /> Per Article ({articleEntries.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="sitewide">
            <MetaTagForm
              entry={currentEntry}
              onChange={updateField}
              onImageUpload={handleImageUpload}
              uploading={uploading}
            />
          </TabsContent>

          <TabsContent value="page">
            <div className="mb-4 flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Select Page</label>
                <Select value={selectedPage} onValueChange={handlePageSelect}>
                  <SelectTrigger><SelectValue placeholder="Choose a page route..." /></SelectTrigger>
                  <SelectContent>
                    {KNOWN_ROUTES.map(r => (
                      <SelectItem key={r.path} value={r.path}>
                        {r.label} ({r.path})
                        {entries.some(e => e.scope === 'page' && e.route_path === r.path) && ' ✅'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedPage ? (
              <MetaTagForm
                entry={currentEntry}
                onChange={updateField}
                onImageUpload={handleImageUpload}
                uploading={uploading}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Select a page to configure its meta tags.</p>
            )}
          </TabsContent>

          <TabsContent value="article">
            <div className="mb-4">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Select Article</label>
              <Select value={selectedArticle} onValueChange={handleArticleSelect}>
                <SelectTrigger><SelectValue placeholder="Choose an article..." /></SelectTrigger>
                <SelectContent>
                  {articles.map(a => (
                    <SelectItem key={a.slug} value={a.slug}>
                      {a.title}
                      {entries.some(e => e.scope === 'article' && e.article_slug === a.slug) && ' ✅'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedArticle ? (
              <MetaTagForm
                entry={currentEntry}
                onChange={updateField}
                onImageUpload={handleImageUpload}
                uploading={uploading}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Select an article to configure its meta tags.</p>
            )}
          </TabsContent>
        </Tabs>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border/50">
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={handleReset} className="gap-1">
            <RotateCcw className="h-4 w-4" /> Reset to Defaults
          </Button>
          {activeScope === 'sitewide' && (
            <Button variant="secondary" onClick={handleSetAsDefault} className="gap-1">
              <Shield className="h-4 w-4" /> Set as New Default
            </Button>
          )}
          {currentEntry.id && (
            <Button variant="destructive" onClick={handleDelete} className="gap-1 ml-auto">
              <Trash2 className="h-4 w-4" /> Remove Override
            </Button>
          )}
        </div>

        {/* Preview */}
        {(currentEntry.og_title || currentEntry.og_image_url) && (
          <div className="mt-6 p-4 rounded-lg border border-border/50 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-2">SOCIAL PREVIEW</p>
            <div className="rounded-lg overflow-hidden border border-border/30 max-w-md">
              {currentEntry.og_image_url && (
                <img src={currentEntry.og_image_url} alt="OG Preview" className="w-full h-40 object-cover" />
              )}
              <div className="p-3 bg-card">
                <p className="text-xs text-muted-foreground uppercase">blackbox.farm</p>
                <p className="font-semibold text-sm text-foreground">{currentEntry.og_title || 'No title set'}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{currentEntry.og_description || 'No description set'}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaTagForm({
  entry,
  onChange,
  onImageUpload,
  uploading,
}: {
  entry: MetaTagEntry;
  onChange: (field: keyof MetaTagEntry, value: string) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, field: 'og_image_url' | 'twitter_image') => void;
  uploading: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* OG Tags */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1">
          <ExternalLink className="h-3.5 w-3.5" /> Open Graph Tags
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">OG Title</label>
            <Input value={entry.og_title || ''} onChange={e => onChange('og_title', e.target.value)} placeholder="Page title for social shares" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">OG URL</label>
            <Input value={entry.og_url || ''} onChange={e => onChange('og_url', e.target.value)} placeholder="https://blackbox.farm/..." />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">OG Description</label>
          <Textarea value={entry.og_description || ''} onChange={e => onChange('og_description', e.target.value)} placeholder="Description for social shares (max 200 chars)" className="min-h-[60px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">OG Image</label>
          <div className="flex gap-2 items-center">
            <Input value={entry.og_image_url || ''} onChange={e => onChange('og_image_url', e.target.value)} placeholder="https://..." className="flex-1" />
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={e => onImageUpload(e, 'og_image_url')} />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span><Upload className="h-3.5 w-3.5 mr-1" />{uploading ? '...' : 'Upload'}</span>
              </Button>
            </label>
          </div>
          {entry.og_image_url && (
            <img src={entry.og_image_url} alt="OG" className="mt-2 h-20 rounded border border-border/30 object-cover" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">OG Type</label>
            <Select value={entry.og_type || 'website'} onValueChange={v => onChange('og_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="website">website</SelectItem>
                <SelectItem value="article">article</SelectItem>
                <SelectItem value="product">product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Canonical URL</label>
            <Input value={entry.canonical_url || ''} onChange={e => onChange('canonical_url', e.target.value)} placeholder="https://blackbox.farm/..." />
          </div>
        </div>
      </div>

      {/* Twitter Tags */}
      <div className="space-y-3 pt-3 border-t border-border/30">
        <h3 className="text-sm font-semibold text-foreground">𝕏 / Twitter Tags</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Twitter Title <span className="text-muted-foreground/60">(blank = uses OG title)</span></label>
            <Input value={entry.twitter_title || ''} onChange={e => onChange('twitter_title', e.target.value)} placeholder="Leave blank to use OG title" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Twitter Card Type</label>
            <Select value={entry.twitter_card || 'summary_large_image'} onValueChange={v => onChange('twitter_card', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="summary_large_image">Summary Large Image</SelectItem>
                <SelectItem value="summary">Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Twitter Description <span className="text-muted-foreground/60">(blank = uses OG description)</span></label>
          <Textarea value={entry.twitter_description || ''} onChange={e => onChange('twitter_description', e.target.value)} placeholder="Leave blank to use OG description" className="min-h-[60px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Twitter Image <span className="text-muted-foreground/60">(blank = uses OG image)</span></label>
          <div className="flex gap-2 items-center">
            <Input value={entry.twitter_image || ''} onChange={e => onChange('twitter_image', e.target.value)} placeholder="Leave blank to use OG image" className="flex-1" />
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={e => onImageUpload(e, 'twitter_image')} />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span><Upload className="h-3.5 w-3.5 mr-1" />{uploading ? '...' : 'Upload'}</span>
              </Button>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
