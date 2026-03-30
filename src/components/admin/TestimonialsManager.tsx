import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquareQuote, Plus, Copy, Trash2, Check, X, Link2, 
  RefreshCw, ArrowUp, ArrowDown, Twitter
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Testimonial {
  id: string;
  twitter_handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  testimonial_text: string;
  role_label: string | null;
  is_approved: boolean;
  is_internal: boolean;
  sort_order: number;
  submitted_at: string;
  twitter_account_id: string | null;
}

interface Invite {
  id: string;
  token: string;
  label: string | null;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export function TestimonialsManager() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [twitterAccounts, setTwitterAccounts] = useState<{ id: string; username: string; display_name: string | null; profile_image_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInviteLabel, setNewInviteLabel] = useState('');
  const [newInviteMaxUses, setNewInviteMaxUses] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editRole, setEditRole] = useState('');
  const { toast } = useToast();

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: t }, { data: i }, { data: tw }] = await Promise.all([
      supabase.from('testimonials').select('*').order('sort_order').order('submitted_at', { ascending: false }),
      supabase.from('testimonial_invites').select('*').order('created_at', { ascending: false }),
      supabase.from('twitter_accounts').select('id, username, display_name, profile_image_url').order('position'),
    ]);
    setTestimonials((t as any[]) || []);
    setInvites((i as any[]) || []);
    setTwitterAccounts(tw || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const toggleApproval = async (id: string, current: boolean) => {
    await supabase.from('testimonials').update({ 
      is_approved: !current, 
      approved_at: !current ? new Date().toISOString() : null 
    }).eq('id', id);
    setTestimonials(ts => ts.map(t => t.id === id ? { ...t, is_approved: !current } : t));
  };

  const deleteTestimonial = async (id: string) => {
    await supabase.from('testimonials').delete().eq('id', id);
    setTestimonials(ts => ts.filter(t => t.id !== id));
    toast({ title: 'Testimonial deleted' });
  };

  const saveEdit = async (id: string) => {
    await supabase.from('testimonials').update({ 
      testimonial_text: editText, 
      role_label: editRole || 'Community Member' 
    }).eq('id', id);
    setTestimonials(ts => ts.map(t => t.id === id ? { ...t, testimonial_text: editText, role_label: editRole } : t));
    setEditingId(null);
    toast({ title: 'Saved' });
  };

  const moveOrder = async (id: string, dir: 'up' | 'down') => {
    const idx = testimonials.findIndex(t => t.id === id);
    if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === testimonials.length - 1)) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    const a = testimonials[idx], b = testimonials[swapIdx];
    await Promise.all([
      supabase.from('testimonials').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('testimonials').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    fetchAll();
  };

  const createFromTwitter = async (acc: { id: string; username: string; display_name: string | null; profile_image_url: string | null }) => {
    const { error } = await supabase.from('testimonials').insert({
      twitter_account_id: acc.id,
      twitter_handle: acc.username,
      display_name: acc.display_name || acc.username,
      avatar_url: acc.profile_image_url,
      testimonial_text: `BlackBox Farm has been an incredible tool for our trading strategy.`,
      role_label: 'BlackBox Team',
      is_approved: false,
      is_internal: true,
      sort_order: testimonials.length,
    });
    if (!error) { toast({ title: `Draft created for @${acc.username}` }); fetchAll(); }
  };

  const createInvite = async () => {
    const { error } = await supabase.from('testimonial_invites').insert({
      label: newInviteLabel || null,
      max_uses: newInviteMaxUses,
    });
    if (!error) { toast({ title: 'Invite link created' }); setShowCreateDialog(false); setNewInviteLabel(''); fetchAll(); }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/testimonial-submit?token=${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Invite link copied' });
  };

  const deactivateInvite = async (id: string) => {
    await supabase.from('testimonial_invites').update({ is_active: false }).eq('id', id);
    fetchAll();
  };

  if (loading) return <p className="text-muted-foreground animate-pulse p-4">Loading testimonials...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquareQuote className="h-5 w-5 text-primary" />
          Testimonials Manager
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Quick Create from Twitter Accounts */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Twitter className="h-4 w-4" />
            Create from Managed Accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {twitterAccounts.slice(0, 20).map(acc => {
            const exists = testimonials.some(t => t.twitter_account_id === acc.id);
            return (
              <Button
                key={acc.id}
                variant={exists ? "secondary" : "outline"}
                size="sm"
                disabled={exists}
                onClick={() => createFromTwitter(acc)}
                className="gap-1 text-xs"
              >
                {acc.profile_image_url && (
                  <img src={acc.profile_image_url} className="w-4 h-4 rounded-full" alt="" />
                )}
                @{acc.username}
                {exists && <Check className="h-3 w-3 ml-1" />}
              </Button>
            );
          })}
        </CardContent>
      </Card>

      {/* Testimonials List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {testimonials.length} Testimonials ({testimonials.filter(t => t.is_approved).length} approved)
        </h3>
        {testimonials.map((t, idx) => (
          <Card key={t.id} className={t.is_approved ? 'border-green-500/20' : 'border-muted/30'}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="shrink-0">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} className="w-8 h-8 rounded-full" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">?</div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{t.display_name}</span>
                    {t.twitter_handle && <span className="text-xs text-primary">@{t.twitter_handle}</span>}
                    <Badge variant={t.is_approved ? "default" : "secondary"} className="text-[10px]">
                      {t.is_approved ? 'Live' : 'Draft'}
                    </Badge>
                    {t.is_internal && <Badge variant="outline" className="text-[10px]">Internal</Badge>}
                  </div>

                  {editingId === t.id ? (
                    <div className="space-y-2">
                      <Textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} maxLength={500} />
                      <Input value={editRole} onChange={e => setEditRole(e.target.value)} placeholder="Role label" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(t.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p 
                      className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => { setEditingId(t.id); setEditText(t.testimonial_text); setEditRole(t.role_label || ''); }}
                    >
                      "{t.testimonial_text}"
                      <span className="text-xs ml-2">· {t.role_label} (click to edit)</span>
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => moveOrder(t.id, 'up')} disabled={idx === 0}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => moveOrder(t.id, 'down')} disabled={idx === testimonials.length - 1}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Switch checked={t.is_approved} onCheckedChange={() => toggleApproval(t.id, t.is_approved)} />
                  <Button variant="ghost" size="sm" onClick={() => deleteTestimonial(t.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invite Links */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Invite Links
          </CardTitle>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> New Invite</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Invite Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input 
                  value={newInviteLabel} 
                  onChange={e => setNewInviteLabel(e.target.value)} 
                  placeholder="Label (e.g. 'For CryptoKing')" 
                />
                <div>
                  <label className="text-sm">Max uses</label>
                  <Input 
                    type="number" 
                    value={newInviteMaxUses} 
                    onChange={e => setNewInviteMaxUses(parseInt(e.target.value) || 1)} 
                    min={1} 
                    max={100}
                  />
                </div>
                <Button onClick={createInvite} className="w-full">Create Invite</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {invites.length === 0 && <p className="text-xs text-muted-foreground">No invites yet</p>}
          {invites.map(inv => (
            <div key={inv.id} className="flex items-center justify-between text-sm border rounded p-2">
              <div>
                <span className="font-medium">{inv.label || 'Unnamed'}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {inv.use_count}/{inv.max_uses} uses
                </span>
                {!inv.is_active && <Badge variant="destructive" className="ml-2 text-[10px]">Disabled</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)}>
                  <Copy className="h-3 w-3" />
                </Button>
                {inv.is_active && (
                  <Button size="sm" variant="ghost" onClick={() => deactivateInvite(inv.id)} className="text-destructive">
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
