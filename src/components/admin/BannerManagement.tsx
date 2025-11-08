import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: number;
  is_active: boolean;
  weight: number;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

interface BannerAnalytics {
  impressions: number;
  clicks: number;
  ctr: number;
}


export function BannerManagement() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBanner, setEditBanner] = useState<Banner | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, BannerAnalytics>>({});
  const [formData, setFormData] = useState({
    title: '',
    image_url: '',
    link_url: '',
    position: 1,
    is_active: true,
    weight: 5,
    start_date: '',
    end_date: '',
    notes: '',
  });
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Auth + permission state (server-verified)
  const [isSuperAdminServer, setIsSuperAdminServer] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [grantLoading, setGrantLoading] = useState(false);

  useEffect(() => {
    fetchBanners();
    fetchAnalytics();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('banner_ads')
      .select('*')
      .order('position', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setBanners(data || []);
    }
    setLoading(false);
  };

  const fetchAnalytics = async () => {
    const { data: impressionsData } = await supabase
      .from('banner_impressions')
      .select('banner_id');
    
    const { data: clicksData } = await supabase
      .from('banner_clicks')
      .select('banner_id');

    const analyticsMap: Record<string, BannerAnalytics> = {};

    // Count impressions per banner
    const impressionCounts: Record<string, number> = {};
    impressionsData?.forEach(imp => {
      impressionCounts[imp.banner_id] = (impressionCounts[imp.banner_id] || 0) + 1;
    });

    // Count clicks per banner
    const clickCounts: Record<string, number> = {};
    clicksData?.forEach(click => {
      clickCounts[click.banner_id] = (clickCounts[click.banner_id] || 0) + 1;
    });

    // Calculate CTR per banner
    Object.keys(impressionCounts).forEach(bannerId => {
      const impressions = impressionCounts[bannerId] || 0;
      const clicks = clickCounts[bannerId] || 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      
      analyticsMap[bannerId] = {
        impressions,
        clicks,
        ctr
      };
    });

    setAnalytics(analyticsMap);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isLovablePreview = typeof window !== 'undefined' && /(lovable\.(dev|app)|lovableproject\.com)$/.test(window.location.hostname);
    
    // In preview, skip auth and just insert
    const { data: { user } } = await supabase.auth.getUser();
    
    const payload = {
      ...formData,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      notes: formData.notes || null,
      created_by: user?.id || null, // Allow null in preview
    };

    if (editBanner) {
      const { data, error } = await supabase.functions.invoke('manage-banner-ad', {
        body: { action: 'update', payload: { ...payload, id: editBanner.id } }
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Banner updated successfully' });
        setEditBanner(null);
        resetForm();
        setIsDialogOpen(false);
        fetchBanners();
      }
    } else {
      const { data, error } = await supabase.functions.invoke('manage-banner-ad', {
        body: { action: 'create', payload }
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Banner created successfully' });
        resetForm();
        setIsDialogOpen(false);
        fetchBanners();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this banner?')) return;

    const { data, error } = await supabase.functions.invoke('manage-banner-ad', {
      body: { action: 'delete', payload: { id } }
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Banner deleted successfully' });
      fetchBanners();
    }
  };

  const handleEdit = (banner: Banner) => {
    setEditBanner(banner);
    setFormData({
      title: banner.title,
      image_url: banner.image_url,
      link_url: banner.link_url,
      position: banner.position,
      is_active: banner.is_active,
      weight: banner.weight,
      start_date: banner.start_date || '',
      end_date: banner.end_date || '',
      notes: banner.notes || '',
    });
  };

  const resetForm = () => {
    setFormData({
      title: '',
      image_url: '',
      link_url: '',
      position: 1,
      is_active: true,
      weight: 5,
      start_date: '',
      end_date: '',
      notes: '',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Banner Advertisement Management</CardTitle>
          <CardDescription>Create and manage banner ads displayed across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditBanner(null); resetForm(); } }}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Create Banner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editBanner ? 'Edit Banner' : 'Create Banner'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pb-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Image URL</Label>
                  <Input
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://example.com/banner.png"
                    required
                  />
                </div>
                <div>
                  <Label>Link URL</Label>
                  <Input
                    value={formData.link_url}
                    onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Position Slot (1-10)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Weight (1-10)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>End Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">{editBanner ? 'Update' : 'Create'} Banner</Button>
                  {editBanner && (
                    <Button type="button" variant="outline" onClick={() => { setEditBanner(null); resetForm(); setIsDialogOpen(false); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Preview</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" />
                      Analytics
                    </div>
                  </TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banners.map((banner) => (
                  <TableRow key={banner.id}>
                    <TableCell>
                      <div className="relative w-24 h-16">
                        <img 
                          src={banner.image_url} 
                          alt={banner.title}
                          className="w-full h-full object-cover rounded"
                        />
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground font-bold text-lg px-2 py-1 rounded shadow-lg">
                          #{banner.position}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{banner.title}</TableCell>
                    <TableCell>{banner.position}</TableCell>
                    <TableCell>{banner.weight}</TableCell>
                    <TableCell>
                      <Badge variant={banner.is_active ? 'default' : 'secondary'}>
                        {banner.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {analytics[banner.id] ? (
                        <div className="text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Impressions:</span>
                            <span className="font-semibold">{analytics[banner.id].impressions.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Clicks:</span>
                            <span className="font-semibold">{analytics[banner.id].clicks.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">CTR:</span>
                            <Badge variant="outline">{analytics[banner.id].ctr.toFixed(2)}%</Badge>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No data yet</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {banner.start_date && `From ${new Date(banner.start_date).toLocaleDateString()}`}
                      {banner.end_date && ` to ${new Date(banner.end_date).toLocaleDateString()}`}
                      {!banner.start_date && !banner.end_date && 'No schedule'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { handleEdit(banner); setIsDialogOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(banner.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
