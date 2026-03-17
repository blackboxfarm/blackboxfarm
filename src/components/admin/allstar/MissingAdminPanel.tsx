import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, RefreshCw, Search, UserPlus, Check } from 'lucide-react';
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-orange-400" />
            Communities Missing Admin ({filtered.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          These communities were scraped but no Admin was found in the first 4 members. Visit via link → tag admin manually.
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
                <TableHead>Visit Link</TableHead>
                <TableHead className="min-w-[220px]">Tag Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No communities missing admins</TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
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
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
