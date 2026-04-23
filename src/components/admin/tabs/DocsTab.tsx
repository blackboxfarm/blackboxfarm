import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { BookOpen, Pin, Pencil, Trash2, Plus, Search } from "lucide-react";

interface SuperAdminDoc {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string | null;
  content_md: string;
  tags: string[] | null;
  is_pinned: boolean;
  sort_order: number;
  updated_at: string;
}

const EMPTY_DRAFT: Partial<SuperAdminDoc> = {
  slug: "",
  title: "",
  category: "general",
  summary: "",
  content_md: "",
  tags: [],
  is_pinned: false,
  sort_order: 0,
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/** Renders a markdown link. If href is internal (starts with /), use react-router Link to keep SPA nav. */
function MdLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href) return <span>{children}</span>;
  const isInternal = href.startsWith("/") && !href.startsWith("//");
  if (isInternal) {
    return (
      <Link to={href} className="text-primary underline underline-offset-2 hover:text-primary/80">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  );
}

export default function DocsTab() {
  const [docs, setDocs] = useState<SuperAdminDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<SuperAdminDoc>>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("super_admin_docs")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Failed to load docs", { description: error.message });
      setLoading(false);
      return;
    }
    const rows = (data || []) as SuperAdminDoc[];
    setDocs(rows);
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].id);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      [d.title, d.slug, d.category, d.summary || "", (d.tags || []).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [docs, search]);

  const selected = docs.find((d) => d.id === selectedId) || null;

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  };

  const openEdit = (doc: SuperAdminDoc) => {
    setDraft({ ...doc });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!draft.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    const slug = (draft.slug?.trim() || slugify(draft.title)).toLowerCase();
    if (!slug) {
      toast.error("Could not derive a slug");
      return;
    }
    setSaving(true);
    const payload = {
      slug,
      title: draft.title.trim(),
      category: (draft.category || "general").trim() || "general",
      summary: draft.summary?.trim() || null,
      content_md: draft.content_md || "",
      tags: draft.tags || [],
      is_pinned: !!draft.is_pinned,
      sort_order: Number(draft.sort_order) || 0,
    };
    let error;
    if (draft.id) {
      ({ error } = await supabase.from("super_admin_docs").update(payload).eq("id", draft.id));
    } else {
      ({ error } = await supabase.from("super_admin_docs").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }
    toast.success(draft.id ? "Doc updated" : "Doc created");
    setEditorOpen(false);
    setDraft(EMPTY_DRAFT);
    await fetchDocs();
  };

  const handleDelete = async (doc: SuperAdminDoc) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("super_admin_docs").delete().eq("id", doc.id);
    if (error) {
      toast.error("Delete failed", { description: error.message });
      return;
    }
    toast.success("Doc deleted");
    if (selectedId === doc.id) setSelectedId(null);
    await fetchDocs();
  };

  const togglePin = async (doc: SuperAdminDoc) => {
    const { error } = await supabase
      .from("super_admin_docs")
      .update({ is_pinned: !doc.is_pinned })
      .eq("id", doc.id);
    if (error) {
      toast.error("Pin update failed", { description: error.message });
      return;
    }
    await fetchDocs();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle>Docs Library</CardTitle>
            <Badge variant="secondary">{docs.length}</Badge>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Doc
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Internal explainer / whitepaper library for super admins. Markdown supported. Internal links like
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">/super-admin?tab=oracle</code>
            navigate inside the app.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* List */}
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search docs…"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[60vh]">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No docs found.</div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((doc) => {
                    const active = doc.id === selectedId;
                    return (
                      <li key={doc.id}>
                        <button
                          onClick={() => setSelectedId(doc.id)}
                          className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                            active ? "bg-muted/70" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {doc.is_pinned && (
                                  <Pin className="h-3 w-3 text-primary fill-primary shrink-0" />
                                )}
                                <span className="font-medium text-sm truncate">{doc.title}</span>
                              </div>
                              {doc.summary && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {doc.summary}
                                </p>
                              )}
                              <div className="flex items-center gap-1 mt-1.5">
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                  {doc.category}
                                </Badge>
                                {(doc.tags || []).slice(0, 2).map((t) => (
                                  <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Viewer */}
        <Card className="min-h-[60vh]">
          {!selected ? (
            <CardContent className="py-16 text-center text-muted-foreground">
              Select a doc on the left, or create a new one.
            </CardContent>
          ) : (
            <>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-2xl">{selected.title}</CardTitle>
                    <Badge variant="outline">{selected.category}</Badge>
                    {selected.is_pinned && (
                      <Badge variant="default" className="gap-1">
                        <Pin className="h-3 w-3" /> Pinned
                      </Badge>
                    )}
                  </div>
                  {selected.summary && (
                    <p className="text-sm text-muted-foreground mt-2">{selected.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <code className="px-1.5 py-0.5 rounded bg-muted">{selected.slug}</code>
                    <span>· Updated {new Date(selected.updated_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => togglePin(selected)}
                    title={selected.is_pinned ? "Unpin" : "Pin"}
                  >
                    <Pin
                      className={`h-4 w-4 ${selected.is_pinned ? "fill-primary text-primary" : ""}`}
                    />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(selected)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(selected)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-table:text-sm prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:border prose-td:border prose-table:border prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
                    }}
                  >
                    {selected.content_md}
                  </ReactMarkdown>
                </article>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Doc" : "New Doc"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="doc-title">Title *</Label>
                <Input
                  id="doc-title"
                  value={draft.title || ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      title: e.target.value,
                      // auto-fill slug only when creating
                      slug: !d.id && (!d.slug || d.slug === slugify(d.title || "")) ? slugify(e.target.value) : d.slug,
                    }))
                  }
                  placeholder="Mesh + Oracle Overview"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-slug">Slug *</Label>
                <Input
                  id="doc-slug"
                  value={draft.slug || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))}
                  placeholder="mesh-oracle-overview"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="doc-cat">Category</Label>
                <Input
                  id="doc-cat"
                  value={draft.category || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  placeholder="architecture / oracle / mesh / meta / general"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-tags">Tags (comma separated)</Label>
                <Input
                  id="doc-tags"
                  value={(draft.tags || []).join(", ")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="mesh, oracle, overview"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-summary">Summary</Label>
              <Input
                id="doc-summary"
                value={draft.summary || ""}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                placeholder="One-line description shown in the list"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-content">Content (Markdown)</Label>
              <Textarea
                id="doc-content"
                value={draft.content_md || ""}
                onChange={(e) => setDraft((d) => ({ ...d, content_md: e.target.value }))}
                placeholder={"# Heading\n\nBody text. Internal link: [Oracle](/super-admin?tab=oracle)"}
                className="min-h-[320px] font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="doc-pinned"
                  checked={!!draft.is_pinned}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, is_pinned: v }))}
                />
                <Label htmlFor="doc-pinned">Pinned (sticks to top)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="doc-sort" className="text-xs text-muted-foreground">
                  Sort
                </Label>
                <Input
                  id="doc-sort"
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))}
                  className="w-20"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : draft.id ? "Save Changes" : "Create Doc"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}