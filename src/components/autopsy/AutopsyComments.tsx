import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, MessageSquare, Loader2, MoreVertical, Pin, EyeOff, Eye, Trash2, LogIn, Link2 } from 'lucide-react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ForumIdentityPicker } from '@/components/profile/ForumIdentityPicker';

type Rank = { slug: string; label: string; icon_emoji: string };
type Profile = {
  user_id: string;
  nickname: string | null;
  display_name: string | null;
  avatar_url: string | null;
  rank_slug: string | null;
  forum_identity_source: 'x' | 'google' | 'custom' | null;
  forum_display_name_cached: string | null;
  forum_avatar_url_cached: string | null;
};
type Comment = {
  id: string; autopsy_slug: string; user_id: string; parent_id: string | null;
  body_clean: string; upvote_count: number; is_hidden: boolean; is_pinned: boolean;
  created_at: string;
};

const TURNSTILE_KEY = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
const MAX = 1000;

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function linkify(text: string) {
  const parts = text.split(/(\s+)/);
  return parts.map((p, i) => {
    if (/^https?:\/\/[^\s]+$/i.test(p)) {
      return (
        <a key={i} href={p} target="_blank" rel="nofollow ugc noopener noreferrer" className="text-primary underline break-all">
          {p}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function AutopsyComments({ slug }: { slug: string }) {
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const [ranks, setRanks] = useState<Record<string, Rank>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [sort, setSort] = useState<'top' | 'new'>('new');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const tsRef = useRef<TurnstileInstance>(null);
  const [myIdentitySource, setMyIdentitySource] = useState<string | null | undefined>(undefined);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: rk }, { data: cs }] = await Promise.all([
      supabase.from('user_ranks').select('slug,label,icon_emoji'),
      supabase.from('autopsy_comments').select('*').eq('autopsy_slug', slug).order('created_at', { ascending: false }),
    ]);
    const rankMap: Record<string, Rank> = {};
    (rk || []).forEach((r: any) => { rankMap[r.slug] = r; });
    setRanks(rankMap);
    const list = (cs || []) as Comment[];
    setComments(list);
    const ids = Array.from(new Set(list.map((c) => c.user_id)));
    if (ids.length) {
      const { data: pr } = await supabase
        .from('profiles')
        .select('user_id, nickname, display_name, avatar_url, rank_slug, forum_identity_source, forum_display_name_cached, forum_avatar_url_cached')
        .in('user_id', ids);
      const pMap: Record<string, Profile> = {};
      (pr || []).forEach((p: any) => { pMap[p.user_id] = p; });
      setProfiles(pMap);
    }
    if (user) {
      const { data: vs } = await supabase
        .from('autopsy_comment_votes')
        .select('comment_id')
        .eq('user_id', user.id);
      setVoted(new Set((vs || []).map((v: any) => v.comment_id)));
      const { data: me } = await supabase
        .from('profiles')
        .select('forum_identity_source')
        .eq('user_id', user.id)
        .maybeSingle();
      setMyIdentitySource(me?.forum_identity_source ?? null);
    } else {
      setVoted(new Set());
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug, user?.id]);

  const sorted = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id);
    if (sort === 'top') top.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || b.upvote_count - a.upvote_count);
    else top.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || +new Date(b.created_at) - +new Date(a.created_at));
    return top;
  }, [comments, sort]);

  const childrenOf = (id: string) =>
    comments.filter((c) => c.parent_id === id).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const post = async () => {
    if (!user) return;
    if (!body.trim()) return;
    if (!tsToken) { toast.error('Please complete the verification'); return; }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('autopsy-comment-post', {
        body: { autopsy_slug: slug, body, parent_id: replyTo, cf_turnstile_token: tsToken },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setBody('');
      setReplyTo(null);
      setTsToken(null);
      tsRef.current?.reset();
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'Post failed');
    } finally {
      setPosting(false);
    }
  };

  const toggleVote = async (c: Comment) => {
    if (!user) { toast.info('Sign in to upvote'); return; }
    const has = voted.has(c.id);
    // Optimistic
    setVoted((s) => { const n = new Set(s); has ? n.delete(c.id) : n.add(c.id); return n; });
    setComments((cs) => cs.map((x) => x.id === c.id ? { ...x, upvote_count: x.upvote_count + (has ? -1 : 1) } : x));
    if (has) {
      await supabase.from('autopsy_comment_votes').delete().eq('comment_id', c.id).eq('user_id', user.id);
    } else {
      await supabase.from('autopsy_comment_votes').insert({ comment_id: c.id, user_id: user.id, value: 1 });
    }
  };

  const moderate = async (id: string, action: 'hide' | 'unhide' | 'pin' | 'unpin' | 'delete') => {
    const { error } = await supabase.functions.invoke('autopsy-comment-moderate', { body: { comment_id: id, action } });
    if (error) toast.error(error.message); else { toast.success('Done'); load(); }
  };

  const shareComment = async (c: Comment) => {
    const url = `${window.location.origin}/autopsy/${slug}#c-${c.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Comment link copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const resolveIdentity = (p?: Profile) => {
    if (!p) return { name: 'anon', avatar: null as string | null };
    if (p.forum_identity_source === 'x' || p.forum_identity_source === 'google') {
      return {
        name: p.forum_display_name_cached || p.nickname || p.display_name || 'anon',
        avatar: p.forum_avatar_url_cached || p.avatar_url,
      };
    }
    return {
      name: p.nickname || p.display_name || 'anon',
      avatar: p.avatar_url,
    };
  };

  const renderOne = (c: Comment, isReply = false) => {
    const p = profiles[c.user_id];
    const rank = p?.rank_slug ? ranks[p.rank_slug] : ranks['newbie'];
    const { name, avatar } = resolveIdentity(p);
    return (
      <div key={c.id} id={`c-${c.id}`} className={`flex gap-3 scroll-mt-24 ${isReply ? 'ml-10' : ''} ${c.is_hidden ? 'opacity-50' : ''}`}>
        <div className="h-9 w-9 rounded-full bg-muted overflow-hidden flex-shrink-0 border border-border">
          {avatar ? <img src={avatar} alt={name} referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-xs">{name[0]?.toUpperCase()}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{name}</span>
            {rank && <span title={rank.label}>{rank.icon_emoji}</span>}
            <span>· {timeAgo(c.created_at)}</span>
            {c.is_pinned && <Badge variant="secondary" className="h-4 px-1 text-[10px]">PINNED</Badge>}
            {c.is_hidden && <Badge variant="destructive" className="h-4 px-1 text-[10px]">HIDDEN</Badge>}
          </div>
          <div className="text-sm whitespace-pre-wrap break-words mt-0.5">{linkify(c.body_clean)}</div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <button onClick={() => toggleVote(c)} className={`flex items-center gap-1 hover:text-primary ${voted.has(c.id) ? 'text-primary font-semibold' : ''}`}>
              <ArrowUp className="h-3.5 w-3.5" /> {c.upvote_count}
            </button>
            {!isReply && user && (
              <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="hover:text-foreground">
                Reply
              </button>
            )}
            <button onClick={() => shareComment(c)} className="hover:text-foreground inline-flex items-center gap-1" title="Copy link to this comment">
              <Link2 className="h-3.5 w-3.5" /> Share
            </button>
            {isSuperAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger className="ml-auto"><MoreVertical className="h-3.5 w-3.5" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => moderate(c.id, c.is_pinned ? 'unpin' : 'pin')}><Pin className="h-3.5 w-3.5 mr-2" />{c.is_pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => moderate(c.id, c.is_hidden ? 'unhide' : 'hide')}>
                    {c.is_hidden ? <><Eye className="h-3.5 w-3.5 mr-2" />Unhide</> : <><EyeOff className="h-3.5 w-3.5 mr-2" />Hide</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => moderate(c.id, 'delete')}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {!isReply && replyTo === c.id && user && (
            <div className="mt-3 space-y-2">
              <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, MAX))} placeholder={`Reply to ${name}…`} rows={3} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setReplyTo(null); setBody(''); }}>Cancel</Button>
                <Button size="sm" onClick={post} disabled={posting || !tsToken || !body.trim()}>{posting ? 'Posting…' : 'Reply'}</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section id="comments" className="mt-12 max-w-3xl mx-auto scroll-mt-24">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-gold">
            <MessageSquare className="h-5 w-5 text-gold" /> WTF Happened?
          </h2>
          <p className="text-sm text-gold/70">Front-row holders, weigh in. Opinions aren't facts — but they make for a good story.</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" className={sort === 'new' ? 'bg-gold text-gold-foreground hover:bg-gold/90' : ''} variant={sort === 'new' ? 'default' : 'ghost'} onClick={() => setSort('new')}>New</Button>
          <Button size="sm" className={sort === 'top' ? 'bg-gold text-gold-foreground hover:bg-gold/90' : ''} variant={sort === 'top' ? 'default' : 'ghost'} onClick={() => setSort('top')}>Top</Button>
        </div>
      </div>

      <Card className="p-4 mb-4 border-gold/40 bg-gold/5">
        {user ? (
          myIdentitySource === null && !showIdentityPicker ? (
            <div className="space-y-3">
              <p className="text-sm">
                Before your first comment, choose how you want to appear in the WTF Forum.
              </p>
              <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => setShowIdentityPicker(true)}>Choose forum identity</Button>
            </div>
          ) : showIdentityPicker ? (
            <div className="space-y-3">
              <ForumIdentityPicker compact />
              <Button size="sm" variant="ghost" onClick={async () => {
                const { data } = await supabase.from('profiles').select('forum_identity_source').eq('user_id', user.id).maybeSingle();
                setMyIdentitySource(data?.forum_identity_source ?? null);
                if (data?.forum_identity_source) setShowIdentityPicker(false);
              }}>Done</Button>
            </div>
          ) : replyTo ? null : (
            <div className="space-y-2">
              <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, MAX))} placeholder="Share what you saw, heard, or held…" rows={4} />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Turnstile ref={tsRef} siteKey={TURNSTILE_KEY} onSuccess={setTsToken} options={{ size: 'compact' }} />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{body.length}/{MAX}</span>
                  <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={post} disabled={posting || !body.trim() || !tsToken}>
                    {posting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Posting…</> : 'Post'}
                  </Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Posting as <strong>{myIdentitySource ?? 'custom'}</strong> identity ·{' '}
                <button className="underline hover:text-foreground" onClick={() => setShowIdentityPicker(true)}>switch identity</button>
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Sign in to share what really happened.</p>
            <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90" asChild><Link to="/auth"><LogIn className="h-3.5 w-3.5 mr-1.5" />Sign in</Link></Button>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : sorted.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No comments yet — be the first.</p>
      ) : (
        <div className="space-y-6">
          {sorted.map((c) => (
            <div key={c.id} className="space-y-3">
              {renderOne(c)}
              {childrenOf(c.id).map((r) => renderOne(r, true))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}