import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Loader2,
  UserPlus,
  BadgeCheck,
  Crown,
  Shield,
  Users,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface FollowTarget {
  id: string;
  target_handle: string;
  target_x_user_id: string | null;
  is_blue_verified: boolean;
  community_role: string;
  followers_count: number | null;
  follow_status: string;
  followed_at: string | null;
  error_message: string | null;
}

interface CommunityFollowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  communityName: string | null;
}

export function CommunityFollowDialog({
  open,
  onOpenChange,
  communityId,
  communityName,
}: CommunityFollowDialogProps) {
  const [targets, setTargets] = useState<FollowTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [following, setFollowing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Load existing targets when dialog opens
  useEffect(() => {
    if (open && communityId) {
      loadTargets();
    }
  }, [open, communityId]);

  const loadTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('x-community-follow', {
        body: { action: 'get_targets', communityId },
      });
      if (error) throw error;
      const loadedTargets = data.targets || [];
      
      // If no targets exist, try to backfill from existing x_communities raw_data
      // This avoids a second Apify scrape when the enricher already ran
      if (loadedTargets.length === 0) {
        console.log('[FollowDialog] No targets found, attempting backfill from enricher data...');
        const { data: backfillData, error: backfillErr } = await supabase.functions.invoke('x-community-follow', {
          body: { action: 'backfill_from_enricher', communityId },
        });
        if (!backfillErr && backfillData?.backfilled > 0) {
          toast.success(`📋 Auto-indexed ${backfillData.backfilled} blue checks from previous enricher scrape`);
          // Reload targets after backfill
          const { data: reloadData } = await supabase.functions.invoke('x-community-follow', {
            body: { action: 'get_targets', communityId },
          });
          setTargets(reloadData?.targets || []);
          const unfollowed = (reloadData?.targets || [])
            .filter((t: FollowTarget) => t.follow_status === 'not_followed' && t.target_x_user_id)
            .map((t: FollowTarget) => t.target_handle);
          setSelected(new Set(unfollowed));
          setLoading(false);
          return;
        }
      }
      
      setTargets(loadedTargets);
      // Pre-select unfollowed targets
      const unfollowed = loadedTargets
        .filter((t: FollowTarget) => t.follow_status === 'not_followed' && t.target_x_user_id)
        .map((t: FollowTarget) => t.target_handle);
      setSelected(new Set(unfollowed));
    } catch (err: any) {
      toast.error(`Failed to load targets: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const scrapeBlueChecks = async () => {
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('x-community-follow', {
        body: { action: 'scrape_blue_checks', communityId },
      });
      if (error) throw error;
      toast.success(`Found ${data.blueChecked} blue-checked members out of ${data.totalMembers}`);
      await loadTargets();
    } catch (err: any) {
      toast.error(`Scrape failed: ${err.message}`);
    } finally {
      setScraping(false);
    }
  };

  const followSelected = async () => {
    const handles = Array.from(selected);
    if (handles.length === 0) {
      toast.error('Select at least one account to follow');
      return;
    }

    setFollowing(true);
    try {
      const { data, error } = await supabase.functions.invoke('x-community-follow', {
        body: { action: 'follow', communityId, targetHandles: handles },
      });
      if (error) throw error;
      toast.success(`Followed ${data.followed} accounts (${data.errors} errors)`);
      await loadTargets();
      setSelected(new Set());
    } catch (err: any) {
      toast.error(`Follow failed: ${err.message}`);
    } finally {
      setFollowing(false);
    }
  };

  const toggleSelect = (handle: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  const selectAll = () => {
    const eligible = targets
      .filter(t => t.follow_status === 'not_followed' && t.target_x_user_id)
      .map(t => t.target_handle);
    setSelected(new Set(eligible));
  };

  const selectNone = () => setSelected(new Set());

  const getRoleBadge = (role: string) => {
    if (role === 'Admin') return <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/30 gap-1"><Crown className="h-2.5 w-2.5" />Admin</Badge>;
    if (role === 'Moderator') return <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30 gap-1"><Shield className="h-2.5 w-2.5" />Mod</Badge>;
    return <Badge variant="outline" className="text-xs text-muted-foreground gap-1"><Users className="h-2.5 w-2.5" />Member</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'followed': return <Badge className="bg-green-600/20 text-green-400 text-xs gap-1"><CheckCircle className="h-2.5 w-2.5" />Followed</Badge>;
      case 'pending': return <Badge className="bg-yellow-600/20 text-yellow-400 text-xs gap-1"><Clock className="h-2.5 w-2.5" />Pending</Badge>;
      case 'follow_back': return <Badge className="bg-emerald-600/20 text-emerald-400 text-xs gap-1"><CheckCircle className="h-2.5 w-2.5" />Followed Back!</Badge>;
      case 'error': return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="h-2.5 w-2.5" />Error</Badge>;
      default: return <Badge variant="outline" className="text-xs text-muted-foreground">Not Followed</Badge>;
    }
  };

  const unfollowedCount = targets.filter(t => t.follow_status === 'not_followed' && t.target_x_user_id).length;
  const followedCount = targets.filter(t => ['followed', 'pending', 'follow_back'].includes(t.follow_status)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-sky-400" />
            Follow Blue Checks — {communityName || `#${communityId}`}
          </DialogTitle>
          <DialogDescription>
            Scrape blue-verified members and follow them from @HoldersIntel
          </DialogDescription>
        </DialogHeader>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{targets.length} blue checks indexed</span>
          <span className="text-green-400">{followedCount} followed</span>
          <span className="text-muted-foreground">{unfollowedCount} unfollowed</span>
          <span className="text-primary">{selected.size} selected</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={scrapeBlueChecks} disabled={scraping}>
            {scraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BadgeCheck className="h-4 w-4 mr-2" />}
            {targets.length > 0 ? 'Rescrape' : 'Scan Blue Checks'}
          </Button>
          {targets.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="ghost" size="sm" onClick={selectNone}>Deselect</Button>
            </>
          )}
        </div>

        {/* Targets list */}
        <ScrollArea className="h-[400px] border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : targets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8">
              <BadgeCheck className="h-8 w-8" />
              <p className="text-sm">No blue-checked members indexed yet</p>
              <p className="text-xs">Click "Scan Blue Checks" to find verified members</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {targets.map(target => (
                <div
                  key={target.id}
                  className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 ${
                    target.follow_status !== 'not_followed' ? 'opacity-60' : ''
                  }`}
                >
                  <Checkbox
                    checked={selected.has(target.target_handle)}
                    onCheckedChange={() => toggleSelect(target.target_handle)}
                    disabled={target.follow_status !== 'not_followed' || !target.target_x_user_id}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://x.com/${target.target_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm text-sky-400 hover:underline truncate"
                      >
                        @{target.target_handle}
                      </a>
                      <BadgeCheck className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                    </div>
                    {target.followers_count != null && (
                      <span className="text-xs text-muted-foreground">
                        {target.followers_count.toLocaleString()} followers
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getRoleBadge(target.community_role)}
                    {getStatusBadge(target.follow_status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Error messages */}
        {targets.some(t => t.error_message) && (
          <details className="text-xs">
            <summary className="text-destructive cursor-pointer">View errors</summary>
            <div className="mt-1 space-y-1 max-h-20 overflow-y-auto">
              {targets.filter(t => t.error_message).map(t => (
                <div key={t.id} className="text-muted-foreground">@{t.target_handle}: {t.error_message}</div>
              ))}
            </div>
          </details>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={followSelected}
            disabled={following || selected.size === 0}
            className="gap-2"
          >
            {following ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Follow {selected.size} Account{selected.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
