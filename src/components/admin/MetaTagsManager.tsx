import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Globe, FileText, BookOpen, Upload, RotateCcw, Save, Trash2, Plus, ExternalLink, Shield, GalleryHorizontal, Crop } from 'lucide-react';
import { GalleryPickerButton } from './social/GalleryPickerButton';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';

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

interface ArticleData {
  slug: string;
  title: string;
  subtitle?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  featured_image_url?: string | null;
  content_md?: string;
  author?: string;
  category?: string;
  tags?: string[] | null;
  published_at?: string | null;
}

const SITE_URL = 'https://blackbox.farm';

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
  og_title: 'BlackBox.Farm',
  og_description: 'Crypto has hands — we show them. HoldersIntel AI = Deep holder analysis, wallet tracing, social identity verification, and a revolutionary network graph that exposes the connections others can\'t see.',
  og_image_url: 'https://apxauapuusmgwbbzjgfl.supabase.co/storage/v1/object/public/social-gallery/site001.png',
  og_url: 'https://blackbox.farm',
  og_type: 'website',
  twitter_card: 'summary_large_image',
  twitter_title: 'BlackBox.Farm',
  twitter_description: 'Crypto has hands — we show them. HoldersIntel AI = Deep holder analysis, wallet tracing, social identity verification, and a revolutionary network graph that exposes the connections others can\'t see.',
  twitter_image: 'https://apxauapuusmgwbbzjgfl.supabase.co/storage/v1/object/public/social-gallery/site001.png',
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

/** Extract first paragraph of plain text from markdown content */
function extractFirstParagraph(md: string): string {
  if (!md) return '';
  // Remove markdown headings, images, links formatting
  const lines = md.split('\n').filter(l => {
    const trimmed = l.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('![') && !trimmed.startsWith('---');
  });
  // Get first meaningful paragraph
  const firstPara = lines[0] || '';
  // Strip markdown formatting
  return firstPara
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .slice(0, 200)
    .trim();
}

/** Normalize image URL to absolute */
function resolveImageUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${SITE_URL}${url}`;
  return `${SITE_URL}/${url}`;
}

export function MetaTagsManager() {
  const { toast } = useToast();
  const [activeScope, setActiveScope] = useState<'sitewide' | 'page' | 'article'>('sitewide');
  const [entries, setEntries] = useState<MetaTagEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<MetaTagEntry>(emptyEntry('sitewide'));
  const [articles, setArticles] = useState<ArticleData[]>([]);
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
      if (sitewide) {
        setCurrentEntry(sitewide);
      } else {
        // No sitewide entry yet — show defaults so admin sees what will be used
        setCurrentEntry({ ...emptyEntry('sitewide'), ...HARDCODED_DEFAULTS, scope: 'sitewide' });
      }
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
      .select('slug, title, subtitle, seo_title, seo_description, featured_image_url, content_md, author, category, tags, published_at')
      .order('created_at', { ascending: false });
    if (data) setArticles(data as ArticleData[]);
  };

  const handlePageSelect = (path: string) => {
    setSelectedPage(path);
    const existing = entries.find(e => e.scope === 'page' && e.route_path === path);
    if (existing) {
      // Existing override — show it but fill empty fields with sitewide defaults for visibility
      const sitewide = entries.find(e => e.scope === 'sitewide');
      const merged = { ...existing };
      if (sitewide) {
        const fields: (keyof MetaTagEntry)[] = ['og_title', 'og_description', 'og_image_url', 'og_url', 'og_type', 'twitter_card', 'twitter_title', 'twitter_description', 'twitter_image', 'canonical_url'];
        for (const f of fields) {
          if (!merged[f] && sitewide[f]) {
            (merged as any)[f] = sitewide[f];
          }
        }
      }
      setCurrentEntry(merged);
    } else {
      // No page override — pre-fill from sitewide so admin sees inherited values
      const sitewide = entries.find(e => e.scope === 'sitewide');
      const route = KNOWN_ROUTES.find(r => r.path === path);
      const pageName = route?.label || path;
      setCurrentEntry({
        ...emptyEntry('page'),
        route_path: path,
        og_title: sitewide?.og_title || HARDCODED_DEFAULTS.og_title || '',
        og_description: sitewide?.og_description || HARDCODED_DEFAULTS.og_description || '',
        og_image_url: sitewide?.og_image_url || HARDCODED_DEFAULTS.og_image_url || '',
        og_url: `${SITE_URL}${path}`,
        og_type: sitewide?.og_type || 'website',
        twitter_card: sitewide?.twitter_card || 'summary_large_image',
        twitter_title: sitewide?.twitter_title || sitewide?.og_title || '',
        twitter_description: sitewide?.twitter_description || sitewide?.og_description || '',
        twitter_image: sitewide?.twitter_image || sitewide?.og_image_url || '',
        canonical_url: `${SITE_URL}${path}`,
      });
    }
  };

  const handleArticleSelect = (slug: string) => {
    setSelectedArticle(slug);
    const existing = entries.find(e => e.scope === 'article' && e.article_slug === slug);
    const article = articles.find(a => a.slug === slug);

    if (existing && article) {
      // Show existing override but fill blanks from article data
      const merged = { ...existing };
      if (!merged.og_title) merged.og_title = article.seo_title || article.title;
      if (!merged.og_description) merged.og_description = article.seo_description || article.subtitle || extractFirstParagraph(article.content_md || '');
      if (!merged.og_image_url) merged.og_image_url = resolveImageUrl(article.featured_image_url);
      if (!merged.og_url) merged.og_url = `${SITE_URL}/intel/briefing/${slug}`;
      if (!merged.twitter_title) merged.twitter_title = merged.og_title;
      if (!merged.twitter_description) merged.twitter_description = merged.og_description;
      if (!merged.twitter_image) merged.twitter_image = merged.og_image_url;
      if (!merged.canonical_url) merged.canonical_url = `${SITE_URL}/intel/briefing/${slug}`;
      setCurrentEntry(merged);
    } else if (article) {
      // No override yet — auto-populate from article data
      const ogTitle = article.seo_title || article.title;
      const ogDesc = article.seo_description || article.subtitle || extractFirstParagraph(article.content_md || '');
      const ogImage = resolveImageUrl(article.featured_image_url);
      const articleUrl = `${SITE_URL}/intel/briefing/${slug}`;

      setCurrentEntry({
        ...emptyEntry('article'),
        article_slug: slug,
        og_title: ogTitle,
        og_description: ogDesc,
        og_image_url: ogImage,
        og_url: articleUrl,
        og_type: 'article',
        twitter_card: 'summary_large_image',
        twitter_title: ogTitle,
        twitter_description: ogDesc,
        twitter_image: ogImage,
        canonical_url: articleUrl,
      });
    } else {
      setCurrentEntry({ ...emptyEntry('article'), article_slug: slug });
    }
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
      handlePageSelect(selectedPage);
    } else {
      handleArticleSelect(selectedArticle);
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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [cropTarget, setCropTarget] = useState<'og_image_url' | 'twitter_image'>('og_image_url');
  const ogFileRef = useRef<HTMLInputElement>(null);
  const twFileRef = useRef<HTMLInputElement>(null);

  const handleFileWithCrop = (e: React.ChangeEvent<HTMLInputElement>, target: 'og_image_url' | 'twitter_image') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropTarget(target);
    setCropSrc(URL.createObjectURL(file));
    setShowCrop(true);
    e.target.value = '';
  };

  const handleCropComplete = async (blobUrl: string, blob: Blob) => {
    URL.revokeObjectURL(blobUrl);
    try {
      const ext = 'jpg';
      const fileName = `meta-tags/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('social-gallery').upload(fileName, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('social-gallery').getPublicUrl(fileName);
      onChange(cropTarget, urlData.publicUrl);
    } catch (err: any) {
      console.error('Crop upload failed:', err);
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleGallerySelect = (url: string, target: 'og_image_url' | 'twitter_image') => {
    onChange(target, url);
  };

  const ImageField = ({ field, label, sublabel }: { field: 'og_image_url' | 'twitter_image'; label: string; sublabel?: string }) => (
    <div>
      <label className="text-xs text-muted-foreground">{label} {sublabel && <span className="text-muted-foreground/60">{sublabel}</span>}</label>
      <div className="flex gap-2 items-center">
        <Input value={entry[field] || ''} onChange={e => onChange(field, e.target.value)} placeholder="https://..." className="flex-1" />
        <input ref={field === 'og_image_url' ? ogFileRef : twFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileWithCrop(e, field)} />
        <Button variant="outline" size="sm" onClick={() => (field === 'og_image_url' ? ogFileRef : twFileRef).current?.click()} disabled={uploading}>
          <Upload className="h-3.5 w-3.5 mr-1" />{uploading ? '...' : 'Upload'}
        </Button>
        <GalleryPickerButton onSelect={(url) => handleGallerySelect(url, field)} label="Gallery" />
      </div>
      {entry[field] && (
        <img src={entry[field]!} alt={label} className="mt-2 h-16 w-28 rounded border border-border/30 object-cover" />
      )}
    </div>
  );

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
        <ImageField field="og_image_url" label="OG Image" />
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
        <ImageField field="twitter_image" label="Twitter Image" sublabel="(blank = uses OG image)" />
      </div>

      {/* Crop Dialog */}
      {cropSrc && (
        <ImageCropDialog
          open={showCrop}
          onOpenChange={(open) => { setShowCrop(open); if (!open) { URL.revokeObjectURL(cropSrc); setCropSrc(null); } }}
          imageSrc={cropSrc}
          onCropComplete={handleCropComplete}
          defaultAspect={2}
          title="Crop Image for Meta Tags"
        />
      )}
    </div>
  );
}
