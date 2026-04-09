import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Mail, Plus, Edit, Trash2, Send, Eye, Users, Clock, Loader2, BarChart3, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { EmailTemplateEditor } from './EmailTemplateEditor';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  campaign_type: string;
  funnel_tag: string | null;
  target_intent_level: string | null;
  is_active: boolean;
  send_delay_hours: number;
  created_at: string;
}

interface QueueItem {
  id: string;
  campaign_id: string;
  recipient_email: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  error_message: string | null;
}

export function EmailCampaignsManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    html_content: '',
    campaign_type: 'one_time',
    funnel_tag: '',
    target_intent_level: '',
    send_delay_hours: 0,
    is_active: false,
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('marketing_email_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    setCampaigns((data as Campaign[]) || []);
    setLoading(false);
  };

  const loadQueue = async (campaignId: string) => {
    const { data } = await supabase
      .from('marketing_email_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('scheduled_at', { ascending: false })
      .limit(100);
    setQueue((data as QueueItem[]) || []);
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setFormData({
      name: '', subject: '', html_content: '', campaign_type: 'one_time',
      funnel_tag: '', target_intent_level: '', send_delay_hours: 0, is_active: false,
    });
    setEditOpen(true);
  };

  const handleEdit = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setFormData({
      name: campaign.name,
      subject: campaign.subject,
      html_content: campaign.html_content,
      campaign_type: campaign.campaign_type,
      funnel_tag: campaign.funnel_tag || '',
      target_intent_level: campaign.target_intent_level || '',
      send_delay_hours: campaign.send_delay_hours || 0,
      is_active: campaign.is_active,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.subject) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        funnel_tag: formData.funnel_tag || null,
        target_intent_level: formData.target_intent_level || null,
        updated_at: new Date().toISOString(),
      };

      if (selectedCampaign) {
        await supabase.from('marketing_email_campaigns').update(payload).eq('id', selectedCampaign.id);
      } else {
        await supabase.from('marketing_email_campaigns').insert(payload);
      }
      toast({ title: selectedCampaign ? 'Campaign updated' : 'Campaign created' });
      setEditOpen(false);
      loadCampaigns();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign? All queued sends will also be removed.')) return;
    await supabase.from('marketing_email_campaigns').delete().eq('id', id);
    loadCampaigns();
    toast({ title: 'Campaign deleted' });
  };

  const handleViewQueue = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    await loadQueue(campaign.id);
    setQueueOpen(true);
  };

  const getCampaignTypeLabel = (type: string) => {
    switch (type) {
      case 'drip': return 'Drip Sequence';
      case 'one_time': return 'One-time';
      case 'triggered': return 'Triggered';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-500/20 text-green-400';
      case 'scheduled': return 'bg-yellow-500/20 text-yellow-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'opened': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Tabs defaultValue="campaigns" className="space-y-4">
      <TabsList>
        <TabsTrigger value="campaigns" className="gap-1.5">
          <Mail className="h-3.5 w-3.5" /> Campaigns
        </TabsTrigger>
        <TabsTrigger value="templates" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Templates
        </TabsTrigger>
      </TabsList>

      <TabsContent value="campaigns">
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Email Campaigns
        </h3>
        <Button onClick={handleCreate} size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No campaigns yet. Create your first email campaign to get started.
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Funnel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium text-sm">{campaign.name}</span>
                      <p className="text-xs text-muted-foreground">{campaign.subject}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {getCampaignTypeLabel(campaign.campaign_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {campaign.funnel_tag && (
                      <Badge variant="secondary" className="text-[10px]">
                        {campaign.funnel_tag}
                      </Badge>
                    )}
                    {campaign.target_intent_level && (
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {campaign.target_intent_level}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={campaign.is_active ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}>
                      {campaign.is_active ? 'Active' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleViewQueue(campaign)}>
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEdit(campaign)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(campaign.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedCampaign ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Campaign Name</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Email Subject</Label>
              <Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">HTML Content</Label>
              <Textarea value={formData.html_content} onChange={(e) => setFormData({ ...formData, html_content: e.target.value })} rows={6} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Campaign Type</Label>
                <Select value={formData.campaign_type} onValueChange={(v) => setFormData({ ...formData, campaign_type: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">One-time</SelectItem>
                    <SelectItem value="drip">Drip Sequence</SelectItem>
                    <SelectItem value="triggered">Triggered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Send Delay (hours)</Label>
                <Input type="number" value={formData.send_delay_hours} onChange={(e) => setFormData({ ...formData, send_delay_hours: parseInt(e.target.value) || 0 })} className="h-8" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Funnel Tag</Label>
                <Select value={formData.funnel_tag} onValueChange={(v) => setFormData({ ...formData, funnel_tag: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="curious_reserved">Curious but Reserved</SelectItem>
                    <SelectItem value="abandoned_cart">Abandoned Cart</SelectItem>
                    <SelectItem value="win_back">Win-back</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Target Intent</Label>
                <Select value={formData.target_intent_level} onValueChange={(v) => setFormData({ ...formData, target_intent_level: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="browsing">Browsing</SelectItem>
                    <SelectItem value="considering">Considering</SelectItem>
                    <SelectItem value="almost_bought">Almost Bought</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Queue Stats Dialog */}
      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {selectedCampaign?.name} — Send Queue
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {['scheduled', 'sent', 'opened', 'failed'].map((status) => (
              <Card key={status}>
                <CardContent className="p-3 text-center">
                  <div className="text-lg font-bold">{queue.filter((q) => q.status === status || (status === 'opened' && q.opened_at)).length}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{status}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                      No sends queued for this campaign yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  queue.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.recipient_email}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${getStatusColor(item.status)}`}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(item.scheduled_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.sent_at ? format(new Date(item.sent_at), 'MMM d, HH:mm') : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
      </TabsContent>

      <TabsContent value="templates">
        <EmailTemplateEditor />
      </TabsContent>
    </Tabs>
  );
}
