import React, { useState, useCallback, useRef } from 'react';
import { IntelPublicationsManager } from './IntelPublicationsManager';
import { AiSeoPlaybook } from './publications/AiSeoPlaybook';
import { ContentCondenser } from './publications/ContentCondenser';
import { PlatformsCheatSheet } from './publications/PlatformsCheatSheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { ArticleContent } from '@/components/intel/ArticleMarkdownRenderer';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  Plus, ArrowLeft, Eye, Edit2, Trash2, Upload, Search,
  Save, Clock, FileText, Image as ImageIcon, ChevronDown, GalleryHorizontal, Globe, CalendarIcon,
  Bot, Users, Activity, EyeOff, Images, Layers, ShieldCheck, Loader2
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GalleryPickerButton } from './social/GalleryPickerButton';
import { BreadcrumbUploadButton } from './social/BreadcrumbUploadButton';
import { VariantEditorTab } from './intel/VariantEditorTab';
import { stripExifAndBrand, generateImageName } from '@/utils/imageMetadata';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import { InlineImageManagerModal } from './InlineImageManagerModal';
import { format } from 'date-fns';
import { ExposureCell } from './publications/ExposureCell';
import { ExposurePanel } from './publications/ExposurePanel';
import type { PublicationLite } from './publications/exposure-shared';

interface Briefing {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  content_md: string;
  category: string;
  tags: string[] | null;
  author: string;
  featured_image_url: string | null;
  social_image_url: string | null;
  social_image_generated_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  is_published: boolean;
  published_at: string | null;
  related_slugs: string[] | null;
  created_at: string;
  updated_at: string;
  reviewed_at?: string | null;
  exif_branded_at?: string | null;
}

interface Revision {
  id: string;
  briefing_id: string;
  content_md: string;
  title: string;
  edited_by: string | null;
  revision_note: string | null;
  created_at: string;
}

const DEFAULT_TAGS = ['HoldersIntel', 'Solana', 'Crypto'];

const KNOWN_CATEGORIES = [
  'holder-analysis',
  'wallet-tracing',
  'scam-detection',
  'platform-guides',
  'market-intel',
  'developer-intel',
  'community',
  'general',
];

const emptyBriefing = {
  title: '',
  subtitle: '',
  slug: '',
  content_md: '',
  category: 'holder-analysis',
  tags: [...DEFAULT_TAGS] as string[],
  author: 'BlackBox Research',
  featured_image_url: '',
  seo_title: '',
  seo_description: '',
  is_published: false,
  published_at: null as string | null,
  related_slugs: [] as string[],
};

function PublicAccessToggle() {
  const { data: isPublic, refetch } = useQuery({
    queryKey: ['intel-public-access'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'intel_briefings_public')
        .maybeSingle();
      return data?.value === 'true';
    },
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      await supabase.from('system_settings').upsert({
        key: 'intel_briefings_public',
        value: String(enabled),
        updated_at: new Date().toISOString(),
        updated_by: 'super_admin',
      });
    },
    onSuccess: () => refetch(),
  });

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <Label className="text-xs text-muted-foreground whitespace-nowrap">Public Access</Label>
      <Switch
        checked={!!isPublic}
        onCheckedChange={(v) => toggle.mutate(v)}
      />
      <span className={`text-xs font-medium ${isPublic ? 'text-green-400' : 'text-red-400'}`}>
        {isPublic ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function createUniqueBriefingSlug(baseSlug: string) {
  const normalizedBase = slugify(baseSlug) || `briefing-${Date.now()}`;

  const { data, error } = await supabase
    .from('intel_briefings')
    .select('slug')
    .ilike('slug', `${normalizedBase}%`);

  if (error) throw error;

  const existingSlugs = new Set((data ?? []).map((item) => item.slug));
  if (!existingSlugs.has(normalizedBase)) return normalizedBase;

  let suffix = 2;
  while (existingSlugs.has(`${normalizedBase}-${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase}-${suffix}`;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'holder-analysis': ['holder', 'holders', 'whale', 'whales', 'distribution', 'top 25', 'wallet concentration'],
  'wallet-tracing': ['wallet', 'tracing', 'tracking', 'transaction', 'on-chain', 'onchain'],
  'scam-detection': ['scam', 'rug', 'rugpull', 'fraud', 'honeypot', 'exploit'],
  'platform-guides': ['guide', 'how to', 'tutorial', 'getting started', 'walkthrough'],
  'market-intel': ['market', 'price', 'trading', 'volume', 'liquidity', 'mcap'],
  'developer-intel': ['developer', 'dev', 'creator', 'deployer', 'contract', 'mint'],
  'community': ['community', 'social', 'telegram', 'twitter', 'discord'],
};

function autoParseMarkdown(md: string): Partial<typeof emptyBriefing> {
  const result: Partial<typeof emptyBriefing> = {};
  
  // Title: first # heading
  const titleMatch = md.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
    result.slug = slugify(result.title);
  }

  // Subtitle: first non-heading, non-empty paragraph after title
  const lines = md.split('\n');
  let foundTitle = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!foundTitle && /^#\s+/.test(trimmed)) { foundTitle = true; continue; }
    if (foundTitle && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!') && !trimmed.startsWith('---')) {
      result.subtitle = trimmed.replace(/^\*+|\*+$/g, '').trim();
      break;
    }
  }

  // Category: keyword scan
  const lower = md.toLowerCase();
  let bestCategory = 'intelligence';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestCategory = cat; }
  }
  if (bestScore > 0) result.category = bestCategory;

  // Tags: extract **bold keywords** and #hashtags, merge with defaults
  const boldMatches = md.match(/\*\*([^*]{2,30})\*\*/g) || [];
  const hashMatches = md.match(/#(\w{3,20})/g) || [];
  const extracted = [
    ...boldMatches.slice(0, 5).map(b => b.replace(/\*\*/g, '').trim()),
    ...hashMatches.slice(0, 3).map(h => h.replace('#', '')),
  ];
  const merged = [...DEFAULT_TAGS, ...extracted];
  const unique = [...new Set(merged)].slice(0, 10);
  result.tags = unique;

  return result;
}

function IntelBriefingsArticlesManager() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyBriefing);
  const [tagsInput, setTagsInput] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editorTab, setEditorTab] = useState('edit');
  const [showCategoryCol, setShowCategoryCol] = useState<boolean>(() => {
    try { return localStorage.getItem('intel-show-category') !== '0'; } catch { return true; }
  });
  const [showExposureCol, setShowExposureCol] = useState<boolean>(() => {
    try { return localStorage.getItem('intel-show-exposure') !== '0'; } catch { return true; }
  });
  const toggleCategoryCol = () => setShowCategoryCol(v => { try { localStorage.setItem('intel-show-category', v ? '0' : '1'); } catch {} return !v; });
  const toggleExposureCol = () => setShowExposureCol(v => { try { localStorage.setItem('intel-show-exposure', v ? '0' : '1'); } catch {} return !v; });
  const [showSeo, setShowSeo] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Crop dialog state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState<'hero' | 'inline'>('hero');
  const [showCrop, setShowCrop] = useState(false);
  const [showImageManager, setShowImageManager] = useState(false);
  const [rebrandingId, setRebrandingId] = useState<string | null>(null);
  const [regeneratingSocialId, setRegeneratingSocialId] = useState<string | null>(null);
  // Remember the hero URL the editor opened with, so we can detect a change on save
  const originalHeroRef = useRef<string>('');

  const rebrandImages = async (b: Briefing) => {
    setRebrandingId(b.id);
    try {
      const { data, error } = await supabase.functions.invoke('intel-exif-rebrand', { body: { briefingId: b.id } });
      if (error) throw error;
      toast({
        title: 'EXIF rebranded',
        description: `${data?.rebranded ?? 0}/${data?.total ?? 0} images stripped & branded with BlackBox copyright.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
    } catch (e: any) {
      toast({ title: 'Rebrand failed', description: e.message, variant: 'destructive' });
    } finally {
      setRebrandingId(null);
    }
  };

  // Regenerate the 1.91:1 social-share card from the current hero image
  const regenerateSocialCard = async (
    target: { slug?: string; slugs?: string[]; all?: boolean; id?: string },
    opts: { silent?: boolean; force?: boolean } = { force: true }
  ) => {
    if (target.id) setRegeneratingSocialId(target.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-intel-social-card', {
        body: {
          slug: target.slug,
          slugs: target.slugs,
          all: target.all,
          force: opts.force ?? true,
        },
      });
      if (error) throw error;
      const ok = (data?.results || []).filter((r: any) => r.status === 'ok').length;
      const total = data?.processed ?? 0;
      if (!opts.silent) {
        toast({
          title: 'Social card regenerated',
          description: `${ok}/${total} card${total === 1 ? '' : 's'} updated for Twitter / Facebook / LinkedIn previews.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
      return data;
    } catch (e: any) {
      if (!opts.silent) {
        toast({ title: 'Social card regen failed', description: e.message, variant: 'destructive' });
      }
      console.error('[social-card] regen failed:', e);
    } finally {
      if (target.id) setRegeneratingSocialId(null);
    }
  };

  // Fetch all briefings
  const { data: briefings = [], isLoading } = useQuery({
    queryKey: ['admin-intel-briefings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefings')
        .select('*')
        .order('published_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Briefing[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Time range for the Views column (all-time / 30d / 7d / 24h)
  const [viewsRange, setViewsRange] = useState<'all' | '30d' | '7d' | '24h'>('all');

  // Fetch view stats per briefing — now includes referrer & utm_source for attribution.
  const { data: viewStats = {} } = useQuery({
    queryKey: ['intel-briefing-view-stats', viewsRange],
    queryFn: async () => {
      let query = supabase
        .from('intel_briefing_views')
        .select('briefing_id, visitor_type, bot_name, referrer_source, utm_source')
        .limit(50000);
      if (viewsRange !== 'all') {
        const hours = viewsRange === '24h' ? 24 : viewsRange === '7d' ? 24 * 7 : 24 * 30;
        const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
        query = query.gte('created_at', cutoff);
      }
      const { data, error } = await query;
      if (error) throw error;
      const stats: Record<string, {
        human: number; crawler: number; ai_bot: number; total: number;
        bots: Record<string, number>;
        sources: Record<string, number>;
        utms: Record<string, number>;
      }> = {};
      for (const row of (data || []) as any[]) {
        if (!stats[row.briefing_id]) stats[row.briefing_id] = { human: 0, crawler: 0, ai_bot: 0, total: 0, bots: {}, sources: {}, utms: {} };
        const s = stats[row.briefing_id];
        s.total++;
        if (row.visitor_type === 'human') s.human++;
        else if (row.visitor_type === 'crawler') s.crawler++;
        else if (row.visitor_type === 'ai_bot') s.ai_bot++;
        if (row.bot_name) s.bots[row.bot_name] = (s.bots[row.bot_name] || 0) + 1;
        if (row.referrer_source) s.sources[row.referrer_source] = (s.sources[row.referrer_source] || 0) + 1;
        if (row.utm_source) s.utms[row.utm_source] = (s.utms[row.utm_source] || 0) + 1;
      }
      return stats;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });


  const { data: revisions = [] } = useQuery({
    queryKey: ['intel-briefing-revisions', editingId],
    queryFn: async () => {
      if (!editingId) return [];
      const { data, error } = await supabase
        .from('intel_briefing_revisions')
        .select('*')
        .eq('briefing_id', editingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Revision[];
    },
    enabled: !!editingId,
  });

  // Fetch all publications once for the exposure column on the list view.
  const { data: allPublications = [] } = useQuery({
    queryKey: ['intel-publications', 'exposure-all'],
    queryFn: async (): Promise<PublicationLite[]> => {
      const { data, error } = await supabase
        .from('intel_publications')
        .select('id, briefing_id, platform, content_depth, is_breadcrumb, published_url, published_at');
      if (error) throw error;
      return (data || []) as PublicationLite[];
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });

  // Fetch ALL briefing variants (75 / 50 / 25 / 0=breadcrumb) for the variant-count column.
  // The list view previously looked at intel_publications.is_breadcrumb, which only counts
  // *posted* breadcrumbs — not the AI-generated condensed variants. This query covers both:
  // depth 75/50/25 = condensed sizes, depth 0 = the short breadcrumb teaser.
  const { data: allVariants = [] } = useQuery({
    queryKey: ['intel-briefing-variants', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefing_variants')
        .select('briefing_id, depth, content_md');
      if (error) throw error;
      return (data || []) as Array<{ briefing_id: string; depth: number; content_md: string | null }>;
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });

  // Get unique categories
  const categories = [...new Set(briefings.map(b => b.category))].sort();
  const currentBriefingIndex = editingId ? briefings.findIndex((b) => b.id === editingId) : -1;
  const articleLabel = currentBriefingIndex >= 0 ? `Article #${currentBriefingIndex + 1}` : `Draft Article #${briefings.length + 1}`;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (isNew: boolean) => {
      const baseSlug = form.slug || slugify(form.title);
      const slug = isNew ? await createUniqueBriefingSlug(baseSlug) : baseSlug;
      const payload = {
        title: form.title,
        subtitle: form.subtitle || null,
        slug,
        content_md: form.content_md,
        category: form.category,
        tags: form.tags.length > 0 ? form.tags : null,
        author: form.author,
        featured_image_url: form.featured_image_url || null,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        is_published: form.is_published,
        published_at: form.is_published ? (form.published_at || new Date().toISOString()) : form.published_at,
        related_slugs: form.related_slugs.length > 0 ? form.related_slugs : null,
      };

      let briefingId = editingId;

      if (isNew) {
        const { data, error } = await supabase.from('intel_briefings').insert(payload).select().single();
        if (error) throw error;
        briefingId = data.id;
      } else {
        const { error } = await supabase.from('intel_briefings').update(payload).eq('id', editingId!);
        if (error) throw error;
      }

      // Save revision
      if (briefingId) {
        await supabase.from('intel_briefing_revisions').insert({
          briefing_id: briefingId,
          content_md: form.content_md,
          title: form.title,
          revision_note: revisionNote || (isNew ? 'Initial creation' : 'Updated'),
        });
      }

      return briefingId;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
      queryClient.invalidateQueries({ queryKey: ['intel-briefing-revisions', id] });
      setForm((current) => ({ ...current, slug: current.slug || slugify(current.title) }));
      toast({ title: 'Saved', description: 'Briefing saved successfully.' });
      setRevisionNote('');
      if (!editingId) {
        setEditingId(id!);
      }
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('intel_briefings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
      toast({ title: 'Deleted' });
    },
  });

  // Toggle publish
  const togglePublish = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase.from('intel_briefings').update({
        is_published: publish,
        published_at: publish ? new Date().toISOString() : null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
    },
  });

  // Update published_at date
  const updateDate = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: Date }) => {
      const { error } = await supabase.from('intel_briefings').update({
        published_at: date.toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
      toast({ title: 'Date updated' });
    },
  });

  // Toggle reviewed/completed flag
  const toggleReviewed = useMutation({
    mutationFn: async ({ id, reviewed }: { id: string; reviewed: boolean }) => {
      const { error } = await supabase.from('intel_briefings').update({
        reviewed_at: reviewed ? new Date().toISOString() : null,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-intel-briefings'] });
    },
  });

  const openEditor = useCallback((briefing?: Briefing) => {
    if (briefing) {
      setEditingId(briefing.id);
      setForm({
        title: briefing.title,
        subtitle: briefing.subtitle || '',
        slug: briefing.slug,
        content_md: briefing.content_md,
        category: briefing.category,
        tags: briefing.tags || [],
        author: briefing.author,
        featured_image_url: briefing.featured_image_url || '',
        seo_title: briefing.seo_title || '',
        seo_description: briefing.seo_description || '',
        is_published: briefing.is_published,
        published_at: briefing.published_at,
        related_slugs: briefing.related_slugs || [],
      });
      setTagsInput((briefing.tags || []).join(', '));
    } else {
      setEditingId(null);
      setForm(emptyBriefing);
    setTagsInput(DEFAULT_TAGS.join(', '));
    }
    setRevisionNote('');
    setEditorTab('edit');
    setShowRevisions(false);
    setView('edit');
  }, []);

  const applyAutoParse = (md: string) => {
    const parsed = autoParseMarkdown(md);
    setForm(f => ({
      ...f,
      content_md: md,
      title: parsed.title || f.title,
      subtitle: parsed.subtitle || f.subtitle,
      slug: parsed.slug || f.slug,
      category: parsed.category || f.category,
      tags: parsed.tags || f.tags,
    }));
    if (parsed.tags) setTagsInput(parsed.tags.join(', '));
  };

  const handleMdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      applyAutoParse(text);
      toast({ title: 'Imported & Auto-filled', description: `Loaded ${file.name} — metadata extracted automatically.` });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGalleryInsert = (imageUrl: string) => {
    // Open cropper for inline gallery images
    setCropSrc(imageUrl);
    setCropMode('inline');
    setShowCrop(true);
  };

  const handleGalleryCropComplete = async (blobUrl: string, blob: Blob) => {
    // Strip EXIF data and inject BlackBox Farm copyright
    const cleanBlob = await stripExifAndBrand(blob);

    // Random 6-char suffix prevents same-millisecond filename collisions
    // (two uploads in the same ms with overlapping random words would otherwise overwrite each other)
    const rand = Math.random().toString(36).slice(2, 8);

    if (cropMode === 'hero') {
      const imageName = generateImageName('hero', form.title);
      const path = `${Date.now()}-${rand}-${imageName}.jpg`;
      // upsert:false → storage rejects collisions instead of silently overwriting
      const { error } = await supabase.storage.from('intel-images').upload(path, cleanBlob, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        URL.revokeObjectURL(blobUrl);
        return;
      }
      const { data: urlData } = supabase.storage.from('intel-images').getPublicUrl(path);
      setForm(f => ({ ...f, featured_image_url: urlData.publicUrl }));
      toast({ title: 'Hero image set', description: `Uploaded as "${imageName}" — EXIF stripped & branded.` });
      URL.revokeObjectURL(blobUrl);
    } else {
      const imageName = generateImageName('inline', form.title);
      const path = `${Date.now()}-${rand}-${imageName}.jpg`;
      const { error } = await supabase.storage.from('intel-images').upload(path, cleanBlob, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        URL.revokeObjectURL(blobUrl);
        return;
      }
      const { data: urlData } = supabase.storage.from('intel-images').getPublicUrl(path);
      const tag = `\n\n![image](${urlData.publicUrl})\n`;
      
      // Smart insertion: find paragraph breaks and place image between paragraphs
      const content = form.content_md;
      // Split into paragraphs (double newline separated blocks)
      const paraBreaks: number[] = [];
      const regex = /\n\s*\n/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        paraBreaks.push(match.index + match[0].length);
      }
      
      // Count existing inline images to determine which insertion this is
      const existingImages = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
      // Subtract hero image if content starts with one
      const heroOffset = content.trimStart().startsWith('![') ? 1 : 0;
      const insertionIndex = existingImages - heroOffset; // 0-based: 0=first, 1=second, 2=third...
      
      let insertPos = content.length; // fallback: end
      
      if (paraBreaks.length >= 2) {
        if (insertionIndex === 0) {
          // First image: after paragraph 1 (between para 1 and 2), or para 2 if enough
          const targetBreak = paraBreaks.length >= 3 ? 1 : 0;
          insertPos = paraBreaks[targetBreak];
        } else if (insertionIndex === 1 && paraBreaks.length >= 3) {
          // Second image: near the end, before last paragraph
          insertPos = paraBreaks[paraBreaks.length - 2];
        } else if (insertionIndex === 2) {
          // Third image: middle of the article
          const midIdx = Math.floor(paraBreaks.length / 2);
          insertPos = paraBreaks[midIdx];
        } else {
          // 4+ images: distribute evenly
          const slot = Math.floor((paraBreaks.length * (insertionIndex + 1)) / (insertionIndex + 2));
          insertPos = paraBreaks[Math.min(slot, paraBreaks.length - 1)];
        }
      } else if (paraBreaks.length === 1) {
        insertPos = paraBreaks[0];
      }
      
      const before = content.slice(0, insertPos);
      const after = content.slice(insertPos);
      setForm(f => ({ ...f, content_md: before + tag + after }));
      toast({ title: 'Image inserted', description: `"${imageName}" — EXIF stripped & branded.` });
      URL.revokeObjectURL(blobUrl);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Open cropper instead of direct upload
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCropMode('hero');
    setShowCrop(true);
    e.target.value = '';
  };

  const handleTagsChange = (val: string) => {
    setTagsInput(val);
    setForm(f => ({ ...f, tags: val.split(',').map(t => t.trim()).filter(Boolean) }));
  };

  // Filter briefings
  const filtered = briefings.filter(b => {
    if (filterCategory !== 'all' && b.category !== filterCategory) return false;
    if (filterStatus === 'published' && !b.is_published) return false;
    if (filterStatus === 'draft' && b.is_published) return false;
    if (searchQuery && !b.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const restoreRevision = (rev: Revision) => {
    setForm(f => ({ ...f, title: rev.title, content_md: rev.content_md }));
    setEditorTab('edit');
    setShowRevisions(false);
    toast({ title: 'Restored', description: `Loaded revision from ${format(new Date(rev.created_at), 'PPp')}` });
  };

  // ─── LIST VIEW ───
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Intel Briefings</h2>
          <div className="flex items-center gap-4">
            <PublicAccessToggle />
            <Button onClick={() => openEditor()}>
              <Plus className="h-4 w-4 mr-2" /> New Briefing
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search titles..."
              className="pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={toggleCategoryCol} className="gap-1">
            {showCategoryCol ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Category
          </Button>
          <Button variant="outline" size="sm" onClick={toggleExposureCol} className="gap-1">
            {showExposureCol ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Exposure
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No briefings found. Create your first one!</p>
          </div>
        ) : (
          <><div className="text-sm text-muted-foreground mb-2">{filtered.length} article{filtered.length !== 1 ? 's' : ''}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Title</TableHead>
                {showCategoryCol && <TableHead>Category</TableHead>}
                <TableHead className="text-center w-[80px]" title="Word count of the 100% master article">Words</TableHead>
                <TableHead className="text-center w-[70px]" title="Reviewed / completed">✓</TableHead>
                <TableHead className="text-center w-[110px]" title="Assets: Hero / Inline images / Breadcrumbs">Assets</TableHead>
                <TableHead className="text-center w-[60px]" title="Strip EXIF/personal info from all images and inject BlackBox Farm copyright + links">EXIF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span>Views</span>
                    <div className="inline-flex rounded border border-border overflow-hidden text-[9px] font-normal">
                      {(['24h', '7d', '30d', 'all'] as const).map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setViewsRange(r)}
                          className={cn(
                            'px-1.5 py-0.5 transition-colors',
                            viewsRange === r
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
                {showExposureCol && <TableHead className="text-center">Exposure</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b, idx) => (
                <TableRow key={b.id}>
                  <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">{b.title}</TableCell>
                  {showCategoryCol && <TableCell><Badge variant="secondary">{b.category}</Badge></TableCell>}
                  <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                    {((b.content_md || '').trim().match(/\S+/g)?.length ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Checkbox
                              checked={!!b.reviewed_at}
                              onCheckedChange={(checked) => toggleReviewed.mutate({ id: b.id, reviewed: !!checked })}
                              aria-label="Mark reviewed"
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {b.reviewed_at
                            ? `Reviewed ${format(new Date(b.reviewed_at), 'MMM d, yyyy HH:mm')}`
                            : 'Not yet reviewed (images, breadcrumbs 75/50/25)'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const hasHero = !!b.featured_image_url;
                      const inlineCount = (b.content_md.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
                      // Count actual condensed variants stored in intel_briefing_variants.
                      // Depths: 75, 50, 25 (condensed sizes) + 0 (breadcrumb teaser) = 4 total.
                      const variantDepths = new Set(
                        allVariants
                          .filter(v => v.briefing_id === b.id && (v.content_md || '').trim().length > 0)
                          .map(v => v.depth)
                      );
                      const breadcrumbCount = variantDepths.size;
                      return (
                        <TooltipProvider>
                          <div className="inline-flex items-center gap-2 text-xs">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn('inline-flex items-center', hasHero ? 'text-primary' : 'text-muted-foreground/40')}>
                                  <ImageIcon className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top"><p className="text-xs">{hasHero ? 'Hero image set' : 'No hero image'}</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn('inline-flex items-center gap-0.5', inlineCount > 0 ? 'text-primary' : 'text-muted-foreground/40')}>
                                  <Images className="h-3.5 w-3.5" />
                                  {inlineCount > 0 && <span className="text-[10px] font-mono">({inlineCount})</span>}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top"><p className="text-xs">{inlineCount > 0 ? `${inlineCount} inline image${inlineCount === 1 ? '' : 's'}` : 'No inline images'}</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn('inline-flex items-center gap-0.5', breadcrumbCount > 0 ? 'text-primary' : 'text-muted-foreground/40')}>
                                  <Layers className="h-3.5 w-3.5" />
                                  {breadcrumbCount > 0 && <span className="text-[10px] font-mono">({breadcrumbCount})</span>}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top"><p className="text-xs">{breadcrumbCount > 0 ? `${breadcrumbCount}/5 variants (TL;DR/75/50/25/breadcrumb)` : 'No condensed variants yet'}</p></TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={rebrandingId === b.id}
                            onClick={() => rebrandImages(b)}
                          >
                            {rebrandingId === b.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <ShieldCheck className={cn('h-3.5 w-3.5', b.exif_branded_at ? 'text-primary' : 'text-muted-foreground/50')} />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          <p className="text-xs">
                            {b.exif_branded_at
                              ? `Branded ${format(new Date(b.exif_branded_at), 'MMM d, yyyy HH:mm')}. Click to re-run on all images.`
                              : 'Strip EXIF/personal data from hero + inline images and inject BlackBox Farm copyright, website, Telegram, X links.'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={b.is_published}
                        onCheckedChange={(checked) => togglePublish.mutate({ id: b.id, publish: checked })}
                      />
                      <span className="text-xs text-muted-foreground">
                        {b.is_published ? 'Live' : 'Draft'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'text-xs justify-start font-normal h-7 px-2',
                            !b.published_at && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {b.published_at ? format(new Date(b.published_at), 'MMM d, yyyy') : 'Set date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={b.published_at ? new Date(b.published_at) : undefined}
                          onSelect={(date) => {
                            if (date) updateDate.mutate({ id: b.id, date });
                          }}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                   </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center gap-1.5 text-xs cursor-default">
                            {(() => {
                              const s = viewStats[b.id];
                              if (!s || s.total === 0) return <span className="text-muted-foreground">—</span>;
                              return (
                                <>
                                  <span className="flex items-center gap-0.5">
                                    <Users className="h-3 w-3 text-green-500" />{s.human}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <Globe className="h-3 w-3 text-blue-500" />{s.crawler}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <Bot className="h-3 w-3 text-purple-500" />{s.ai_bot}
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[250px]">
                          {(() => {
                            const s = viewStats[b.id];
                            if (!s || s.total === 0) return <p className="text-xs">No views yet</p>;
                            return (
                              <div className="text-xs space-y-1">
                                <p className="font-medium">{s.total} total views</p>
                                <p>👤 Humans: {s.human}</p>
                                <p>🔍 Crawlers: {s.crawler}</p>
                                <p>🤖 AI Bots: {s.ai_bot}</p>
                                {Object.keys(s.bots).length > 0 && (
                                  <div className="pt-1 border-t border-border mt-1">
                                    <p className="font-medium mb-0.5">Bot breakdown:</p>
                                    {Object.entries(s.bots).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([name, count]) => (
                                      <p key={name}>{name}: {count as number}</p>
                                    ))}
                                  </div>
                                )}
                                {Object.keys(s.sources).length > 0 && (
                                  <div className="pt-1 border-t border-border mt-1">
                                    <p className="font-medium mb-0.5">Top sources:</p>
                                    {Object.entries(s.sources).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 6).map(([src, count]) => (
                                      <p key={src}>{src}: {count as number}</p>
                                    ))}
                                  </div>
                                )}
                                {Object.keys(s.utms).length > 0 && (
                                  <div className="pt-1 border-t border-border mt-1">
                                    <p className="font-medium mb-0.5">Campaign hits (utm_source):</p>
                                    {Object.entries(s.utms).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([utm, count]) => (
                                      <p key={utm}>{utm}: {count as number}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEditor(b)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {b.is_published && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/intel/briefing/${b.slug}`} target="_blank" rel="noreferrer">
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${b.title}"?`)) deleteMutation.mutate(b.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  {showExposureCol && (
                    <TableCell className="text-center">
                      <ExposureCell briefingId={b.id} publications={allPublications} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </div>
    );
  }

  // ─── EDITOR VIEW ───
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setView('list')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to List
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_published}
              onCheckedChange={(v) => setForm(f => ({ ...f, is_published: v }))}
            />
            <Label className="text-sm">{form.is_published ? 'Published' : 'Draft'}</Label>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">Date:</Label>
            <Input
              type="date"
              className="w-[150px]"
              value={form.published_at ? new Date(form.published_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
              onChange={e => {
                const d = new Date(e.target.value + 'T12:00:00Z');
                setForm(f => ({ ...f, published_at: d.toISOString() }));
              }}
            />
          </div>
          <Input
            placeholder="Revision note (optional)"
            className="w-[200px]"
            value={revisionNote}
            onChange={e => setRevisionNote(e.target.value)}
          />
          <Button onClick={() => saveMutation.mutate(!editingId)} disabled={saveMutation.isPending || !form.title}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Metadata fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={form.title}
              onChange={e => {
                const title = e.target.value;
                setForm(f => ({
                  ...f,
                  title,
                  slug: editingId ? f.slug : slugify(title),
                }));
              }}
              placeholder="Article title"
            />
          </div>
          <div>
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={form.subtitle}
              onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
              placeholder="Optional subtitle"
            />
          </div>
          <div>
            <Label className="text-xs">Slug</Label>
            <Input
              value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              placeholder="url-friendly-slug"
            />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => {
              if (v === '__new__') {
                const newCat = prompt('Enter new category slug (e.g. "defi-analysis"):');
                if (newCat && newCat.trim()) {
                  setForm(f => ({ ...f, category: newCat.trim().toLowerCase().replace(/\s+/g, '-') }));
                }
              } else {
                setForm(f => ({ ...f, category: v }));
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {[...new Set([...KNOWN_CATEGORIES, ...categories])].sort().map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
                <SelectItem value="__new__">➕ Add new category...</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={tagsInput}
              onChange={e => handleTagsChange(e.target.value)}
              placeholder="solana, holder-analysis, alpha"
            />
          </div>
          <div>
            <Label className="text-xs">Author</Label>
            <Input
              value={form.author}
              onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Hero image */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
          <ImageIcon className="h-4 w-4 mr-2" /> Upload Hero Image
        </Button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <GalleryPickerButton
          onSelect={(url) => {
            setCropSrc(url);
            setCropMode('hero');
            setShowCrop(true);
          }}
          label="Hero from Gallery"
          articleContent={form.content_md}
          articleId={editingId}
          articleSlug={form.slug}
          articleTitle={form.title}
          articleLabel={articleLabel}
          imageUsageContext="hero"
        />
        <span className="text-xs text-muted-foreground">Recommended: 1200 × 630px (2:1 ratio)</span>
        {form.featured_image_url && (
          <div className="flex items-center gap-2">
            <img src={form.featured_image_url} alt="Hero" className="h-10 w-16 object-cover rounded" />
            <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, featured_image_url: '' }))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* SEO collapsible */}
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setShowSeo(!showSeo)}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${showSeo ? 'rotate-180' : ''}`} />
        SEO Overrides
      </button>
      {showSeo && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
          <div>
            <Label className="text-xs">SEO Title</Label>
            <Input
              value={form.seo_title}
              onChange={e => setForm(f => ({ ...f, seo_title: e.target.value }))}
              placeholder="Custom meta title"
            />
          </div>
          <div>
            <Label className="text-xs">SEO Description</Label>
            <Input
              value={form.seo_description}
              onChange={e => setForm(f => ({ ...f, seo_description: e.target.value }))}
              placeholder="Custom meta description"
            />
          </div>
        </div>
      )}

      {/* Exposure history for this article */}
      <ExposurePanel briefingId={editingId} briefingTitle={form.title} />

      {/* Markdown Editor / Preview */}
      <Tabs value={editorTab} onValueChange={setEditorTab}>
        <div className="flex items-center justify-between">
          {(() => {
            const wc = (s: string | null | undefined) =>
              s ? (s.trim().match(/\S+/g)?.length ?? 0) : 0;
            const fmt = (n: number) => n.toLocaleString();
            const masterWc = wc(form.content_md);
            const variantWc = (depth: number) => {
              const v = allVariants.find(
                (x) => x.briefing_id === editingId && x.depth === depth
              );
              return wc(v?.content_md);
            };
            const w75 = variantWc(75);
            const w50 = variantWc(50);
            const w25 = variantWc(25);
            const wbc = variantWc(0);
            const wtldr = variantWc(1);
            return (
              <TabsList>
                <TabsTrigger value="edit">✏️ Edit{masterWc > 0 ? ` (${fmt(masterWc)})` : ''}</TabsTrigger>
                <TabsTrigger value="preview">👁️ Preview</TabsTrigger>
                {editingId && (
                  <>
                    <TabsTrigger value="v75" className="text-blue-400 data-[state=active]:text-blue-400">75%{w75 > 0 ? ` (${fmt(w75)})` : ''}</TabsTrigger>
                    <TabsTrigger value="v50" className="text-amber-400 data-[state=active]:text-amber-400">50%{w50 > 0 ? ` (${fmt(w50)})` : ''}</TabsTrigger>
                    <TabsTrigger value="v25" className="text-red-400 data-[state=active]:text-red-400">25%{w25 > 0 ? ` (${fmt(w25)})` : ''}</TabsTrigger>
                    <TabsTrigger value="vbc" className="text-violet-400 data-[state=active]:text-violet-400">🔗 Breadcrumb{wbc > 0 ? ` (${fmt(wbc)})` : ''}</TabsTrigger>
                    <TabsTrigger value="vtldr" className="text-emerald-400 data-[state=active]:text-emerald-400">📝 TL;DR{wtldr > 0 ? ` (${fmt(wtldr)})` : ''}</TabsTrigger>
                  </>
                )}
              </TabsList>
            );
          })()}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Import .md
            </Button>
            <GalleryPickerButton
              onSelect={handleGalleryInsert}
              label="Insert Gallery Image"
              articleContent={form.content_md}
              articleId={editingId}
              articleSlug={form.slug}
              articleTitle={form.title}
              articleLabel={articleLabel}
              imageUsageContext="inline"
            />
            <BreadcrumbUploadButton
              articleId={editingId}
              articleSlug={form.slug}
              articleTitle={form.title}
              articleLabel={articleLabel}
            />
            {(() => {
              const inlineCount = (form.content_md.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
              if (inlineCount === 0) return null;
              return (
                <Button variant="outline" size="sm" onClick={() => setShowImageManager(true)}>
                  <ImageIcon className="h-4 w-4 mr-2" /> Manage Images ({inlineCount})
                </Button>
              );
            })()}
            <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown" className="hidden" onChange={handleMdUpload} />
            {editingId && (
              <Button variant="outline" size="sm" onClick={() => setShowRevisions(!showRevisions)}>
                <Clock className="h-4 w-4 mr-2" /> Revisions ({revisions.length})
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="edit" className="mt-2">
          <Textarea
            ref={editorRef}
            value={form.content_md}
            onChange={e => setForm(f => ({ ...f, content_md: e.target.value }))}
            onPaste={e => {
              const pasted = e.clipboardData.getData('text');
              if (pasted.length > 200 && !form.title && /^#\s+/.test(pasted)) {
                e.preventDefault();
                applyAutoParse(pasted);
                toast({ title: 'Auto-filled', description: 'Metadata extracted from pasted markdown.' });
              }
            }}
            placeholder="Write or paste your markdown content here..."
            className="min-h-[500px] font-mono text-sm"
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-2">
          <Card>
            <CardContent className="pt-6">
              {/* Hero image with proper aspect ratio */}
              {form.featured_image_url && (
                <div className="rounded-xl overflow-hidden mb-6">
                  <img src={form.featured_image_url} alt={form.title} className="w-full aspect-[1200/630] object-cover" />
                </div>
              )}
              <h1 className="text-2xl font-bold mb-1">{form.title}</h1>
              {form.subtitle && <p className="text-muted-foreground text-lg mb-3">{form.subtitle}</p>}
              <div className="flex gap-2 mb-6">
                <Badge variant="secondary">{form.category}</Badge>
                {form.tags.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
              </div>
              <ArticleContent content={form.content_md} />
            </CardContent>
          </Card>
        </TabsContent>

        {editingId && (
          <>
            <TabsContent value="vtldr" className="mt-2">
              <VariantEditorTab
                briefingId={editingId}
                briefingSlug={form.slug}
                masterContent={form.content_md}
                depth={1}
                label="TL;DR"
                platform="2-3 sentence snippet (no link, no preamble)"
                badgeColor="bg-emerald-500/20 text-emerald-400"
              />
            </TabsContent>
            <TabsContent value="v75" className="mt-2">
              <VariantEditorTab
                briefingId={editingId}
                briefingSlug={form.slug}
                masterContent={form.content_md}
                depth={75}
                label="75% Substantial"
                platform="Medium / Long-form republish"
                badgeColor="bg-blue-500/20 text-blue-400"
              />
            </TabsContent>
            <TabsContent value="v50" className="mt-2">
              <VariantEditorTab
                briefingId={editingId}
                briefingSlug={form.slug}
                masterContent={form.content_md}
                depth={50}
                label="50% Condensed"
                platform="Twitter Articles / Fiverr / Substack"
                badgeColor="bg-amber-500/20 text-amber-400"
              />
            </TabsContent>
            <TabsContent value="v25" className="mt-2">
              <VariantEditorTab
                briefingId={editingId}
                briefingSlug={form.slug}
                masterContent={form.content_md}
                depth={25}
                label="25% Teaser"
                platform="Reddit / LinkedIn short-form"
                badgeColor="bg-red-500/20 text-red-400"
              />
            </TabsContent>
            <TabsContent value="vbc" className="mt-2">
              <VariantEditorTab
                briefingId={editingId}
                briefingSlug={form.slug}
                masterContent={form.content_md}
                depth={0}
                label="Breadcrumb"
                platform="X / Telegram teaser (≤280 chars, links back)"
                badgeColor="bg-violet-500/20 text-violet-400"
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Revision History */}
      {showRevisions && revisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Revision History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {revisions.map(rev => (
                <div key={rev.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                  <div>
                    <span className="font-medium">{rev.title}</span>
                    {rev.revision_note && <span className="text-muted-foreground ml-2">— {rev.revision_note}</span>}
                    <div className="text-xs text-muted-foreground">{format(new Date(rev.created_at), 'PPp')}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => restoreRevision(rev)}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Crop Dialog */}
      {cropSrc && (
        <ImageCropDialog
          open={showCrop}
          onOpenChange={(open) => {
            setShowCrop(open);
            if (!open) { URL.revokeObjectURL(cropSrc); setCropSrc(null); }
          }}
          imageSrc={cropSrc}
          onCropComplete={handleGalleryCropComplete}
          defaultAspect={cropMode === 'hero' ? 2 : 'free'}
          title={cropMode === 'hero' ? 'Crop Hero Image' : 'Crop Inline Image'}
        />
      )}

      {/* Inline Image Manager */}
      <InlineImageManagerModal
        open={showImageManager}
        onOpenChange={setShowImageManager}
        contentMd={form.content_md}
        articleTitle={form.title}
        onApply={(newMd) => setForm(f => ({ ...f, content_md: newMd }))}
      />
    </div>
  );
}

export function IntelBriefingsManager() {
  const [mainTab, setMainTab] = useState('articles');

  return (
    <Tabs value={mainTab} onValueChange={setMainTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="articles"><FileText className="h-3.5 w-3.5 mr-1" />Articles</TabsTrigger>
        <TabsTrigger value="publications"><Globe className="h-3.5 w-3.5 mr-1" />Publications</TabsTrigger>
        <TabsTrigger value="playbook">🎯 AI Playbook</TabsTrigger>
        <TabsTrigger value="repurpose">✂️ Repurpose</TabsTrigger>
        <TabsTrigger value="platforms">📋 Platforms</TabsTrigger>
      </TabsList>
      <TabsContent value="articles">
        <IntelBriefingsArticlesManager />
      </TabsContent>
      <TabsContent value="publications">
        <IntelPublicationsManager />
      </TabsContent>
      <TabsContent value="playbook">
        <AiSeoPlaybook />
      </TabsContent>
      <TabsContent value="repurpose">
        <ContentCondenser />
      </TabsContent>
      <TabsContent value="platforms">
        <PlatformsCheatSheet />
      </TabsContent>
    </Tabs>
  );
}

export default IntelBriefingsManager;
