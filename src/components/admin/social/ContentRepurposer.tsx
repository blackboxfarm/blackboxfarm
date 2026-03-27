import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RefreshCw, Plus, Trash2, Wand2, Send, Image, ExternalLink,
  CheckCircle, XCircle, Copy, Sparkles, Clock, Lock, Calendar
} from "lucide-react";

// ─── Source Accounts Manager ────────────────────────────
function SourceAccountsPanel() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [newHandle, setNewHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState<string | null>(null);
  const [maxTweets, setMaxTweets] = useState(100);

  const loadAccounts = async () => {
    const { data } = await supabase
      .from('repurpose_source_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    setAccounts(data || []);
  };

  useEffect(() => { loadAccounts(); }, []);

  const addAccount = async () => {
    const username = newHandle.trim().replace('@', '').toLowerCase();
    if (!username) return;
    const { error } = await supabase
      .from('repurpose_source_accounts')
      .insert({ username });
    if (error) {
      if (error.code === '23505') toast.error('Account already added');
      else toast.error(error.message);
      return;
    }
    toast.success(`@${username} added`);
    setNewHandle('');
    loadAccounts();
  };

  const removeAccount = async (id: string) => {
    await supabase.from('repurpose_source_accounts').delete().eq('id', id);
    toast.success('Removed');
    loadAccounts();
  };

  const scrapeAccount = async (username: string) => {
    setScraping(username);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-twitter-posts', {
        body: { username, max_tweets: maxTweets },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success(`Scraped ${data.total_scraped} new tweets from @${username}`);
      loadAccounts();
    } catch (err: any) {
      toast.error(err.message || 'Scrape failed');
    } finally {
      setScraping(null);
    }
  };

  const scrapeAll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-twitter-posts', {
        body: { max_tweets: maxTweets },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success(`Scraped ${data.total_scraped} total tweets from ${data.results?.length} accounts`);
      loadAccounts();
    } catch (err: any) {
      toast.error(err.message || 'Scrape failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Source Accounts</span>
          <Button size="sm" onClick={scrapeAll} disabled={loading || accounts.length === 0}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Scrape All
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="@username"
            onKeyDown={(e) => e.key === 'Enter' && addAccount()}
            className="flex-1"
          />
          <Button size="sm" onClick={addAccount} disabled={!newHandle.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Max tweets per scrape:</Label>
          <Input
            type="number"
            value={maxTweets}
            onChange={(e) => setMaxTweets(Number(e.target.value) || 20)}
            className="w-24 text-xs"
            min={1}
            max={5000}
          />
          <span className="text-xs text-muted-foreground">Set high (e.g. 5000) for full history</span>
        </div>

        <div className="space-y-2">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <span className="font-mono text-sm font-medium">@{acc.username}</span>
                {acc.last_scraped_at && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Last scraped: {new Date(acc.last_scraped_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm" variant="ghost"
                  onClick={() => scrapeAccount(acc.username)}
                  disabled={scraping === acc.username}
                >
                  <RefreshCw className={`h-3 w-3 ${scraping === acc.username ? 'animate-spin' : ''}`} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeAccount(acc.id)}>
                  <Trash2 className="h-3 w-3 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
          {accounts.length === 0 && (
            <p className="text-muted-foreground text-center py-4 text-sm">
              Add Twitter accounts to scrape content from
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Scraped Posts Browser (with approve/delete) ────────────────────────────
function ScrapedPostsBrowser() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [repurposing, setRepurposing] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [filter, setFilter] = useState<string>("pending");

  const loadPosts = async () => {
    setLoading(true);
    let query = supabase
      .from('repurpose_scraped_posts')
      .select('*')
      .order('posted_at', { ascending: false })
      .limit(100);
    
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    
    const { data } = await query;
    setPosts(data || []);
    setLoading(false);
  };

  useEffect(() => { loadPosts(); }, [filter]);

  const updatePostStatus = async (id: string, status: string) => {
    await supabase
      .from('repurpose_scraped_posts')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    toast.success(status === 'approved' ? '✅ Approved for repurposing' : status === 'rejected' ? '❌ Rejected' : 'Updated');
    loadPosts();
  };

  const deletePost = async (id: string) => {
    await supabase.from('repurpose_scraped_posts').delete().eq('id', id);
    toast.success('Deleted');
    loadPosts();
  };

  const bulkApproveAll = async () => {
    const pendingIds = posts.filter(p => p.status === 'pending').map(p => p.id);
    if (pendingIds.length === 0) return;
    for (const id of pendingIds) {
      await supabase
        .from('repurpose_scraped_posts')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', id);
    }
    toast.success(`Approved ${pendingIds.length} posts`);
    loadPosts();
  };

  const repurposePost = async (postId: string, generateImage: boolean) => {
    setRepurposing(postId);
    try {
      const { data, error } = await supabase.functions.invoke('repurpose-content', {
        body: {
          post_id: postId,
          custom_instructions: customInstructions || undefined,
          generate_image: generateImage,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success('Content repurposed! Check the Drafts tab.');
      // Mark as repurposed
      await supabase.from('repurpose_scraped_posts').update({ is_repurposed: true }).eq('id', postId);
      loadPosts();
    } catch (err: any) {
      toast.error(err.message || 'Repurpose failed');
    } finally {
      setRepurposing(null);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-300',
    approved: 'bg-green-500/20 text-green-300',
    rejected: 'bg-red-500/20 text-red-300',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Scraped Posts ({posts.length})</span>
          <div className="flex gap-2">
            {filter === 'pending' && posts.length > 0 && (
              <Button size="sm" variant="secondary" onClick={bulkApproveAll}>
                <CheckCircle className="h-3 w-3 mr-1" /> Approve All
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={loadPosts} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="capitalize text-xs"
            >
              {f}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Custom AI Instructions (optional)</Label>
          <Input
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g. Focus on holder analysis angle, mention our bubble map tool..."
            className="text-xs"
          />
        </div>

        <ScrollArea className="h-[500px]">
          <div className="space-y-3 pr-3">
            {posts.map((post) => (
              <div key={post.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">@{post.username}</Badge>
                    <Badge className={statusColors[post.status] || 'bg-muted'}>
                      {post.status}
                    </Badge>
                    {post.is_repurposed && (
                      <Badge className="bg-orange-500/20 text-orange-300 text-xs">
                        <Sparkles className="h-3 w-3 mr-1" /> Repurposed
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {post.posted_at ? new Date(post.posted_at).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>

                <p className="text-sm line-clamp-4">{post.tweet_text}</p>

                {post.image_urls?.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {post.image_urls.map((url: string, i: number) => (
                      <img
                        key={i}
                        src={url}
                        alt="Tweet media"
                        className="h-20 w-20 object-cover rounded border"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {post.engagement && (
                    <>
                      <span>❤️ {post.engagement.likes || 0}</span>
                      <span>🔄 {post.engagement.retweets || 0}</span>
                      <span>👁️ {post.engagement.views || 0}</span>
                    </>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {/* Approve / Reject */}
                  {post.status === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => updatePostStatus(post.id, 'approved')} className="text-green-400">
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updatePostStatus(post.id, 'rejected')} className="text-red-400">
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </>
                  )}

                  {/* Repurpose (only approved) */}
                  {post.status === 'approved' && !post.is_repurposed && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => repurposePost(post.id, false)}
                        disabled={repurposing === post.id}
                      >
                        <Wand2 className="h-3 w-3 mr-1" />
                        {repurposing === post.id ? 'Working...' : 'Repurpose Text'}
                      </Button>
                      {post.image_urls?.length > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => repurposePost(post.id, true)}
                          disabled={repurposing === post.id}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Text + Image
                        </Button>
                      )}
                    </>
                  )}

                  {/* Delete */}
                  <Button size="sm" variant="ghost" onClick={() => deletePost(post.id)}>
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>

                  {post.tweet_url && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={post.tweet_url} target="_blank" rel="noopener">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {posts.length === 0 && (
              <p className="text-muted-foreground text-center py-8 text-sm">
                No posts matching filter. Try scraping some accounts first!
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Content Drafts (with scheduling & multi-platform) ────────────────────────────
function ContentDrafts() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState<string | null>(null);

  const loadDrafts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('content_drafts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setDrafts(data || []);
    setLoading(false);
  };

  useEffect(() => { loadDrafts(); }, []);

  const updateDraftText = async (id: string, text: string) => {
    await supabase.from('content_drafts').update({
      repurposed_text: text,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from('content_drafts').update({ status }).eq('id', id);
    toast.success(`Draft ${status}`);
    loadDrafts();
  };

  const lockForPosting = async (id: string, hoursFromNow: number) => {
    const scheduleAt = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
    await supabase.from('content_drafts').update({
      status: 'approved',
      schedule_post_at: scheduleAt,
      locked_at: new Date().toISOString(),
    }).eq('id', id);
    toast.success(`🔒 Locked for posting at ${new Date(scheduleAt).toLocaleString()}`);
    loadDrafts();
  };

  const postDraft = async (draft: any, platform: string) => {
    setPosting(draft.id);
    try {
      const [shortText] = (draft.repurposed_text || '').split('\n\n---\n\n');
      const longText = (draft.repurposed_text || '').split('\n\n---\n\n')[1] || shortText;

      if (platform === 'threads') {
        const { data, error } = await supabase.functions.invoke('post-to-threads', {
          body: {
            text: shortText,
            imageUrl: draft.repurposed_image_url || draft.original_image_url || undefined,
          },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error);
        toast.success(`Posted to Threads! ID: ${data.postId}`);
      } else if (platform === 'instagram') {
        const imageUrl = draft.repurposed_image_url || draft.original_image_url;
        if (!imageUrl) throw new Error('Instagram requires an image');
        const { data, error } = await supabase.functions.invoke('post-to-instagram', {
          body: { caption: longText, imageUrl },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error);
        toast.success(`Posted to Instagram! ID: ${data.postId}`);
      } else if (platform === 'facebook') {
        const { data, error } = await supabase.functions.invoke('post-to-facebook', {
          body: {
            message: longText,
            imageUrl: draft.repurposed_image_url || draft.original_image_url || undefined,
          },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error);
        toast.success(`Posted to Facebook! ID: ${data.postId}`);
      } else if (platform === 'twitter') {
        const { data, error } = await supabase.functions.invoke('post-share-card-twitter', {
          body: { text: shortText },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error);
        toast.success(`Posted to X!`);
      }

      // Update draft
      const postedPlatforms = [...(draft.posted_platforms || []), platform];
      await supabase.from('content_drafts').update({
        posted_platforms: postedPlatforms,
        status: 'posted',
      }).eq('id', draft.id);

      loadDrafts();
    } catch (err: any) {
      toast.error(err.message || `Failed to post to ${platform}`);
    } finally {
      setPosting(null);
    }
  };

  const reRequestAI = async (draftId: string, type: 'text' | 'image') => {
    setPosting(draftId);
    try {
      const { data, error } = await supabase.functions.invoke('repurpose-content', {
        body: {
          draft_id: draftId,
          regenerate: type,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success(`${type === 'text' ? 'Text' : 'Image'} regenerated!`);
      loadDrafts();
    } catch (err: any) {
      toast.error(err.message || 'Regeneration failed');
    } finally {
      setPosting(null);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Content Drafts ({drafts.length})</span>
          <Button size="sm" variant="outline" onClick={loadDrafts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <div className="space-y-4 pr-3">
            {drafts.map((draft) => {
              const [shortText, longText] = (draft.repurposed_text || '').split('\n\n---\n\n');
              const isLocked = !!draft.locked_at;
              return (
                <div key={draft.id} className={`border rounded-lg p-4 space-y-3 ${isLocked ? 'border-orange-500/50 bg-orange-500/5' : ''}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          draft.status === 'posted' ? 'bg-green-500/20 text-green-300' :
                          draft.status === 'approved' ? 'bg-blue-500/20 text-blue-300' :
                          draft.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                          'bg-yellow-500/20 text-yellow-300'
                        }
                      >
                        {draft.status}
                      </Badge>
                      {isLocked && (
                        <Badge className="bg-orange-500/20 text-orange-300">
                          <Lock className="h-3 w-3 mr-1" /> Locked
                        </Badge>
                      )}
                      {draft.schedule_post_at && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {new Date(draft.schedule_post_at).toLocaleString()}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(draft.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Original vs Repurposed */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Original</Label>
                      <p className="text-xs bg-muted/30 p-2 rounded line-clamp-4">{draft.original_text}</p>
                      {draft.original_image_url && (
                        <img src={draft.original_image_url} alt="Original" className="h-16 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-orange-400">Repurposed (Short / Threads)</Label>
                      <Textarea
                        defaultValue={shortText}
                        onBlur={(e) => updateDraftText(draft.id, `${e.target.value}\n\n---\n\n${longText || ''}`)}
                        className="text-xs min-h-[80px] resize-none"
                      />
                      {draft.repurposed_image_url && (
                        <img src={draft.repurposed_image_url} alt="Repurposed" className="h-16 rounded border-2 border-orange-500/30" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      )}
                    </div>
                  </div>

                  {longText && (
                    <div className="space-y-1">
                      <Label className="text-xs text-pink-400">Long Version (Instagram / Facebook)</Label>
                      <Textarea
                        defaultValue={longText}
                        onBlur={(e) => updateDraftText(draft.id, `${shortText}\n\n---\n\n${e.target.value}`)}
                        className="text-xs min-h-[60px] resize-none"
                      />
                    </div>
                  )}

                  {/* Re-request AI */}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => reRequestAI(draft.id, 'text')} disabled={posting === draft.id}>
                      <Wand2 className="h-3 w-3 mr-1" /> Re-gen Text
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reRequestAI(draft.id, 'image')} disabled={posting === draft.id}>
                      <Sparkles className="h-3 w-3 mr-1" /> Re-gen Image
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyText(shortText)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy Short
                    </Button>
                  </div>

                  {/* Schedule / Lock */}
                  {draft.status !== 'posted' && !isLocked && (
                    <div className="flex gap-2 items-center flex-wrap">
                      <Label className="text-xs">Schedule:</Label>
                      {[1, 2, 4, 8, 24].map((h) => (
                        <Button key={h} size="sm" variant="outline" className="text-xs" onClick={() => lockForPosting(draft.id, h)}>
                          <Calendar className="h-3 w-3 mr-1" /> {h}h
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Post buttons - all platforms */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700"
                      onClick={() => postDraft(draft, 'threads')}
                      disabled={posting === draft.id}
                    >
                      <Send className="h-3 w-3 mr-1" /> Threads
                    </Button>
                    <Button
                      size="sm"
                      className="bg-pink-600 hover:bg-pink-700"
                      onClick={() => postDraft(draft, 'instagram')}
                      disabled={posting === draft.id || !(draft.repurposed_image_url || draft.original_image_url)}
                    >
                      <Image className="h-3 w-3 mr-1" /> Instagram
                    </Button>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => postDraft(draft, 'facebook')}
                      disabled={posting === draft.id}
                    >
                      <Send className="h-3 w-3 mr-1" /> Facebook
                    </Button>
                    <Button
                      size="sm"
                      className="bg-sky-600 hover:bg-sky-700"
                      onClick={() => postDraft(draft, 'twitter')}
                      disabled={posting === draft.id}
                    >
                      <Send className="h-3 w-3 mr-1" /> X / Twitter
                    </Button>
                    <div className="flex-1" />
                    {draft.status === 'draft' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(draft.id, 'approved')}>
                          <CheckCircle className="h-3 w-3 mr-1 text-green-400" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(draft.id, 'rejected')}>
                          <XCircle className="h-3 w-3 mr-1 text-red-400" /> Reject
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Posted platforms */}
                  {draft.posted_platforms?.length > 0 && (
                    <div className="flex gap-1">
                      {draft.posted_platforms.map((p: string) => (
                        <Badge key={p} variant="outline" className="text-xs capitalize">{p} ✓</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {drafts.length === 0 && (
              <p className="text-muted-foreground text-center py-8 text-sm">
                No drafts yet. Approve scraped posts then repurpose them!
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Main Export ────────────────────────────
export function ContentRepurposer() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-orange-400" />
          Content Repurposer
        </h3>
        <p className="text-xs text-muted-foreground">
          Scrape tweets → Approve → AI repurpose → Schedule & Post to all platforms
        </p>
      </div>

      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">📋 Source Accounts</TabsTrigger>
          <TabsTrigger value="posts">🐦 Scraped Posts</TabsTrigger>
          <TabsTrigger value="drafts">✨ Drafts & Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts"><SourceAccountsPanel /></TabsContent>
        <TabsContent value="posts"><ScrapedPostsBrowser /></TabsContent>
        <TabsContent value="drafts"><ContentDrafts /></TabsContent>
      </Tabs>
    </div>
  );
}
