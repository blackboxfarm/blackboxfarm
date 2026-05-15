import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, RefreshCw, Search, UserPlus, Check, Sparkles, Database } from 'lucide-react';
import { toast } from 'sonner';

export function MissingAdminPanel() {
  const [search, setSearch] = useState('');
  const [adminInput, setAdminInput] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const { data: communities, isLoading, refetch } = useQuery({
    queryKey: ['missing-admin-communities'],
    queryFn: async () => {
      // Fetch communities with empty admin_usernames
      const { data, error } = await supabase
        .from('x_communities')
        .select('id, community_id, community_url, name, member_count, linked_token_mints, scrape_status, last_scraped_at, is_deleted')
        .or('admin_usernames.is.null,admin_usernames.eq.{}')
        .eq('is_deleted', false)
        .order('last_scraped_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // DB-MESH SUGGESTIONS — never triggers a new X scrape.
  // Path: x_communities.community_id  →  token_social_links (community_id)
  //       → token_mint  →  tokens.creator_wallet
  //       → allstar_dev_registry (master_wallet)  →  twitter_handle
  // Also falls back to v_community_admin_dev_link when present.
  const communityIds = (communities || []).map(c => c.community_id).filter(Boolean);

  const { data: suggestions } = useQuery({
    queryKey: ['missing-admin-suggestions', communityIds.length, communityIds.slice(0, 5).join(',')],
    enabled: communityIds.length > 0,
    queryFn: async () => {
      const map: Record<string, { handle: string; tier: number | null; source: string; wallet?: string }> = {};

      // 1) Fast path — curated view
      try {
        const { data: viewRows } = await supabase
          .from('v_community_admin_dev_link' as any)
          .select('community_id, admin_handle, admin_wallet')
          .in('community_id', communityIds);
        for (const r of (viewRows as any[]) || []) {
          if (r.community_id && r.admin_handle && !map[r.community_id]) {
            map[r.community_id] = { handle: r.admin_handle, tier: null, source: 'mesh-view', wallet: r.admin_wallet };
          }
        }
      } catch { /* view optional */ }

      // 2) Mesh path — token_social_links → tokens → registry
      const { data: links } = await supabase
        .from('token_social_links')
        .select('community_id, token_mint')
        .in('community_id', communityIds)
        .not('token_mint', 'is', null);

      const mints = [...new Set((links || []).map(l => l.token_mint).filter(Boolean))] as string[];
      if (mints.length) {
        const { data: toks } = await supabase
          .from('tokens')
          .select('mint_address, creator_wallet')
          .in('mint_address', mints)
          .not('creator_wallet', 'is', null);
        const mintToWallet = new Map((toks || []).map(t => [t.mint_address, t.creator_wallet]));

        const wallets = [...new Set((toks || []).map(t => t.creator_wallet).filter(Boolean))] as string[];
        if (wallets.length) {
          const { data: regs } = await supabase
            .from('allstar_dev_registry')
            .select('master_wallet, twitter_handle, best_tier')
            .in('master_wallet', wallets)
            .not('twitter_handle', 'is', null);
          const walletToReg = new Map((regs || []).map(r => [r.master_wallet, r]));

          for (const link of links || []) {
            if (!link.community_id || map[link.community_id]) continue;
            const wallet = mintToWallet.get(link.token_mint!);
            if (!wallet) continue;
            const reg = walletToReg.get(wallet);
            if (reg?.twitter_handle) {
              map[link.community_id] = {
                handle: reg.twitter_handle.replace(/^@/, ''),
                tier: reg.best_tier ?? null,
                source: 'registry',
                wallet,
              };
            }
          }
        }
      }
      return map;
    },
  });

  const applyAllSuggestions = useMutation({
    mutationFn: async () => {
      if (!suggestions) return 0;
      const targets = (communities || []).filter(c => suggestions[c.community_id]);
      let applied = 0;
      for (const c of targets) {
        const s = suggestions[c.community_id];
        const { error } = await supabase
          .from('x_communities')
          .update({ admin_usernames: [s.handle] })
          .eq('id', c.id);
        if (!error) applied++;
      }
      return applied;
    },
    onSuccess: (n) => {
      toast.success(`Applied ${n} suggested admins from DB mesh`);
      queryClient.invalidateQueries({ queryKey: ['missing-admin-communities'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveAdmin = useMutation({
    mutationFn: async ({ id, username }: { id: string; username: string }) => {
      const clean = username.replace(/^@/, '').trim();
      if (!clean) throw new Error('Enter a username');
      const { error } = await supabase
        .from('x_communities')
        .update({ admin_usernames: [clean] })
        .eq('id', id);
      if (error) throw error;
      return clean;
    },
    onSuccess: (username) => {
      toast.success(`Admin @${username} saved`);
      queryClient.invalidateQueries({ queryKey: ['missing-admin-communities'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = (communities || []).filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(s) ||
      c.community_id?.toLowerCase().includes(s) ||
      c.community_url?.toLowerCase().includes(s)
    );
  });

  const suggestionCount = suggestions
    ? Object.keys(suggestions).filter(cid => filtered.some(c => c.community_id === cid)).length
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-orange-400" />
            Communities Missing Admin ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={suggestionCount === 0 || applyAllSuggestions.isPending}
              onClick={() => applyAllSuggestions.mutate()}
              className="gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Apply {suggestionCount} mesh suggestion{suggestionCount === 1 ? '' : 's'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Communities missing an Admin. Suggestions are pulled from the Allstar Registry and DB mesh (creator wallet → twitter handle) — no new X scrapes are triggered.
        </p>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, community ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mesh Suggestion</TableHead>
                <TableHead>Visit Link</TableHead>
                <TableHead className="min-w-[220px]">Tag Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No communities missing admins</TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const sug = suggestions?.[c.community_id];
                  return (
                  <TableRow key={c.id} className="text-xs">
                    <TableCell>
                      <code className="text-[10px] font-mono">{c.community_id}</code>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{c.name || <span className="text-muted-foreground italic">unnamed</span>}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {c.member_count || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.scrape_status === 'scraped' ? 'default' : 'secondary'} className="text-[10px]">
                        {c.scrape_status || 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sug ? (
                        <div className="flex items-center gap-1.5">
                          <Database className="h-3 w-3 text-emerald-400" />
                          <a
                            href={`https://x.com/${sug.handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline font-medium"
                          >@{sug.handle}</a>
                          {sug.tier != null && (
                            <Badge variant="outline" className="text-[9px]">T{sug.tier}</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Apply suggestion"
                            onClick={() => saveAdmin.mutate({ id: c.id, username: sug.handle })}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <a
                        href={c.community_url || `https://x.com/i/communities/${c.community_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Visit
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          placeholder="@admin_handle"
                          value={adminInput[c.id] || ''}
                          onChange={(e) => setAdminInput(prev => ({ ...prev, [c.id]: e.target.value }))}
                          className="h-7 text-xs w-32"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!adminInput[c.id]?.trim()}
                          onClick={() => {
                            saveAdmin.mutate({ id: c.id, username: adminInput[c.id] });
                            setAdminInput(prev => ({ ...prev, [c.id]: '' }));
                          }}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
