import React, { useState, useCallback, useRef } from 'react';
import { IntelPublicationsManager } from './IntelPublicationsManager';
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

import {
  Plus, ArrowLeft, Eye, Edit2, Trash2, Upload, Search,
  Save, Clock, FileText, Image as ImageIcon, ChevronDown, GalleryHorizontal, Globe
} from 'lucide-react';
import { GalleryPickerButton } from './social/GalleryPickerButton';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import { format } from 'date-fns';

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
  seo_title: string | null;
  seo_description: string | null;
  is_published: boolean;
  published_at: string | null;
  related_slugs: string[] | null;
  created_at: string;
  updated_at: string;
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

  // Fetch all briefings
  const { data: briefings = [], isLoading } = useQuery({
    queryKey: ['admin-intel-briefings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intel_briefings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Briefing[];
    },
  });

  // Fetch revisions for current editing briefing
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

  // Get unique categories
  const categories = [...new Set(briefings.map(b => b.category))].sort();

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
    if (cropMode === 'hero') {
      // Upload cropped blob to storage
      const path = `${Date.now()}-${slugify(form.title || 'hero')}-cropped.jpg`;
      const { error } = await supabase.storage.from('intel-images').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        URL.revokeObjectURL(blobUrl);
        return;
      }
      const { data: urlData } = supabase.storage.from('intel-images').getPublicUrl(path);
      setForm(f => ({ ...f, featured_image_url: urlData.publicUrl }));
      toast({ title: 'Hero image set', description: 'Cropped image uploaded.' });
      URL.revokeObjectURL(blobUrl);
    } else {
      // Inline: upload cropped blob, insert markdown tag
      const path = `${Date.now()}-inline-cropped.jpg`;
      const { error } = await supabase.storage.from('intel-images').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        URL.revokeObjectURL(blobUrl);
        return;
      }
      const { data: urlData } = supabase.storage.from('intel-images').getPublicUrl(path);
      const tag = `\n![image](${urlData.publicUrl})\n`;
      const textarea = editorRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const before = form.content_md.slice(0, start);
        const after = form.content_md.slice(start);
        setForm(f => ({ ...f, content_md: before + tag + after }));
      } else {
        setForm(f => ({ ...f, content_md: f.content_md + tag }));
      }
      toast({ title: 'Image inserted', description: 'Cropped gallery image added to article.' });
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium max-w-[300px] truncate">{b.title}</TableCell>
                  <TableCell><Badge variant="secondary">{b.category}</Badge></TableCell>
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
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(b.created_at), 'MMM d, yyyy')}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      {/* Markdown Editor / Preview */}
      <Tabs value={editorTab} onValueChange={setEditorTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="edit">✏️ Edit</TabsTrigger>
            <TabsTrigger value="preview">👁️ Preview</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Import .md
            </Button>
            <GalleryPickerButton
              onSelect={handleGalleryInsert}
              label="Insert Gallery Image"
              articleContent={form.content_md}
              articleTitle={form.title}
            />
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
      </TabsList>
      <TabsContent value="articles">
        <IntelBriefingsArticlesManager />
      </TabsContent>
      <TabsContent value="publications">
        <IntelPublicationsManager />
      </TabsContent>
    </Tabs>
  );
}

export default IntelBriefingsManager;
