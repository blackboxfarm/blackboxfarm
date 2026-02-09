import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  RefreshCw, AlertTriangle, Check, Calendar, DollarSign, 
  Activity, ExternalLink, Clock, Key, Settings, TrendingUp,
  AlertCircle, CheckCircle2, XCircle
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { format, differenceInDays, parseISO } from 'date-fns';

interface ApiServiceConfig {
  id: string;
  service_name: string;
  display_name: string;
  description: string | null;
  rate_limit_per_minute: number;
  rate_limit_per_hour: number | null;
  rate_limit_per_day: number | null;
  monthly_quota: number | null;
  monthly_quota_used: number;
  billing_cycle_start: string | null;
  cost_per_unit: number;
  currency: string;
  monthly_cost_cap: number | null;
  api_key_rotation_date: string | null;
  api_key_last_rotated: string | null;
  api_key_rotation_reminder_days: number;
  alert_threshold_warning: number;
  alert_threshold_critical: number;
  alert_threshold_exceeded: number;
  is_enabled: boolean;
  is_paid_service: boolean;
  tier: string;
  last_request_at: string | null;
  last_error_at: string | null;
  error_count_today: number;
  success_count_today: number;
  documentation_url: string | null;
  dashboard_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ServiceAlert {
  service_name: string;
  display_name: string;
  alert_type: string;
  current_usage: number;
  limit_value: number;
  usage_percentage: number;
  days_until_rotation: number | null;
}

const TIER_COLORS: Record<string, string> = {
  free: 'bg-green-500/10 text-green-500 border-green-500/20',
  starter: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  pro: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  developer: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  enterprise: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export function ApiResourceManager() {
  const [services, setServices] = useState<ApiServiceConfig[]>([]);
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingService, setEditingService] = useState<ApiServiceConfig | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [servicesRes, alertsRes] = await Promise.all([
        supabase
          .from('api_service_config')
          .select('*')
          .order('is_paid_service', { ascending: false })
          .order('display_name'),
        supabase.rpc('check_api_service_alerts')
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (alertsRes.error) throw alertsRes.error;

      setServices(servicesRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (error: any) {
      toast({
        title: 'Error fetching API services',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const syncUsage = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.rpc('sync_api_service_usage');
      if (error) throw error;
      
      await fetchData();
      toast({
        title: 'Usage synced',
        description: 'API usage data has been refreshed from logs'
      });
    } catch (error: any) {
      toast({
        title: 'Error syncing usage',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  const toggleService = async (service: ApiServiceConfig) => {
    try {
      const { error } = await supabase
        .from('api_service_config')
        .update({ is_enabled: !service.is_enabled })
        .eq('id', service.id);

      if (error) throw error;

      setServices(prev => 
        prev.map(s => s.id === service.id ? { ...s, is_enabled: !s.is_enabled } : s)
      );

      toast({
        title: `${service.display_name} ${!service.is_enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error updating service',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const updateService = async (updates: Partial<ApiServiceConfig>) => {
    if (!editingService) return;

    try {
      const { error } = await supabase
        .from('api_service_config')
        .update(updates)
        .eq('id', editingService.id);

      if (error) throw error;

      await fetchData();
      setEditingService(null);
      toast({
        title: 'Service updated',
        description: `${editingService.display_name} configuration saved`
      });
    } catch (error: any) {
      toast({
        title: 'Error updating service',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getUsagePercentage = (service: ApiServiceConfig) => {
    if (!service.monthly_quota || service.monthly_quota === 0) return 0;
    return Math.min(100, (service.monthly_quota_used / service.monthly_quota) * 100);
  };

  const getUsageColor = (service: ApiServiceConfig) => {
    const pct = getUsagePercentage(service);
    if (pct >= service.alert_threshold_exceeded) return 'text-destructive';
    if (pct >= service.alert_threshold_critical) return 'text-orange-500';
    if (pct >= service.alert_threshold_warning) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getRotationStatus = (service: ApiServiceConfig) => {
    if (!service.api_key_rotation_date) return null;
    const days = differenceInDays(parseISO(service.api_key_rotation_date), new Date());
    if (days < 0) return { status: 'overdue', days: Math.abs(days), color: 'text-destructive' };
    if (days <= service.api_key_rotation_reminder_days) return { status: 'upcoming', days, color: 'text-yellow-500' };
    return { status: 'ok', days, color: 'text-muted-foreground' };
  };

  const totalMonthlyCost = services
    .filter(s => s.is_paid_service)
    .reduce((sum, s) => sum + (s.monthly_quota_used * s.cost_per_unit), 0);

  const paidServicesCount = services.filter(s => s.is_paid_service).length;
  const activeAlertsCount = alerts.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            API Resource Manager
          </h2>
          <p className="text-muted-foreground">
            Monitor quotas, billing cycles, and API key rotations across all services
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncUsage} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync Usage
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.length}</div>
            <p className="text-xs text-muted-foreground">
              {services.filter(s => s.is_enabled).length} enabled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paidServicesCount}</div>
            <p className="text-xs text-muted-foreground">
              ${totalMonthlyCost.toFixed(2)} est. this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${activeAlertsCount > 0 ? 'text-destructive' : 'text-green-500'}`}>
              {activeAlertsCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {activeAlertsCount === 0 ? 'All systems normal' : 'Requires attention'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Key Rotations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {services.filter(s => {
                const rotation = getRotationStatus(s);
                return rotation && (rotation.status === 'overdue' || rotation.status === 'upcoming');
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Due within reminder period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Active Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div className="flex items-center gap-3">
                    {alert.alert_type === 'quota_exceeded' && <XCircle className="h-5 w-5 text-destructive" />}
                    {alert.alert_type === 'quota_critical' && <AlertCircle className="h-5 w-5 text-orange-500" />}
                    {alert.alert_type === 'quota_warning' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                    {alert.alert_type === 'rotation_overdue' && <Key className="h-5 w-5 text-destructive" />}
                    {alert.alert_type === 'rotation_upcoming' && <Clock className="h-5 w-5 text-yellow-500" />}
                    <div>
                      <p className="font-medium">{alert.display_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {alert.alert_type === 'quota_exceeded' && `Quota exceeded: ${alert.current_usage?.toLocaleString()} / ${alert.limit_value?.toLocaleString()}`}
                        {alert.alert_type === 'quota_critical' && `Critical: ${alert.usage_percentage}% quota used`}
                        {alert.alert_type === 'quota_warning' && `Warning: ${alert.usage_percentage}% quota used`}
                        {alert.alert_type === 'rotation_overdue' && `Key rotation overdue by ${Math.abs(alert.days_until_rotation || 0)} days`}
                        {alert.alert_type === 'rotation_upcoming' && `Key rotation due in ${alert.days_until_rotation} days`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={alert.alert_type.includes('exceeded') || alert.alert_type.includes('overdue') ? 'destructive' : 'outline'}>
                    {alert.alert_type.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Services Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Services</CardTitle>
          <CardDescription>Configure quotas, billing, and rotation schedules</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Rate Limit</TableHead>
                <TableHead>Monthly Usage</TableHead>
                <TableHead>Est. Cost</TableHead>
                <TableHead>Key Rotation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => {
                const usagePct = getUsagePercentage(service);
                const rotation = getRotationStatus(service);
                
                return (
                  <TableRow key={service.id} className={!service.is_enabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{service.display_name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {service.description}
                          </p>
                        </div>
                        {service.documentation_url && (
                          <a href={service.documentation_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TIER_COLORS[service.tier] || ''}>
                        {service.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{service.rate_limit_per_minute}/min</span>
                    </TableCell>
                    <TableCell>
                      {service.monthly_quota ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={getUsageColor(service)}>
                              {service.monthly_quota_used.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                              / {service.monthly_quota.toLocaleString()}
                            </span>
                          </div>
                          <Progress value={usagePct} className="h-1.5" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlimited</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {service.is_paid_service ? (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {(service.monthly_quota_used * service.cost_per_unit).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Free</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {rotation ? (
                        <div className={`flex items-center gap-1 text-xs ${rotation.color}`}>
                          <Key className="h-3 w-3" />
                          {rotation.status === 'overdue' && `${rotation.days}d overdue`}
                          {rotation.status === 'upcoming' && `${rotation.days}d left`}
                          {rotation.status === 'ok' && `${rotation.days}d left`}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={service.is_enabled}
                        onCheckedChange={() => toggleService(service)}
                      />
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setEditingService(service)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Configure {service.display_name}</DialogTitle>
                            <DialogDescription>
                              Update quotas, billing cycle, and rotation schedule
                            </DialogDescription>
                          </DialogHeader>
                          <ServiceEditForm 
                            service={service} 
                            onSave={updateService}
                            onCancel={() => setEditingService(null)}
                          />
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceEditForm({ 
  service, 
  onSave,
  onCancel 
}: { 
  service: ApiServiceConfig;
  onSave: (updates: Partial<ApiServiceConfig>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    monthly_quota: service.monthly_quota || '',
    billing_cycle_start: service.billing_cycle_start || '',
    cost_per_unit: service.cost_per_unit || 0,
    monthly_cost_cap: service.monthly_cost_cap || '',
    api_key_rotation_date: service.api_key_rotation_date || '',
    api_key_rotation_reminder_days: service.api_key_rotation_reminder_days || 7,
    alert_threshold_warning: service.alert_threshold_warning || 80,
    alert_threshold_critical: service.alert_threshold_critical || 90,
    rate_limit_per_minute: service.rate_limit_per_minute || 60,
    notes: service.notes || '',
  });

  const handleSave = () => {
    onSave({
      monthly_quota: formData.monthly_quota ? Number(formData.monthly_quota) : null,
      billing_cycle_start: formData.billing_cycle_start || null,
      cost_per_unit: Number(formData.cost_per_unit),
      monthly_cost_cap: formData.monthly_cost_cap ? Number(formData.monthly_cost_cap) : null,
      api_key_rotation_date: formData.api_key_rotation_date || null,
      api_key_rotation_reminder_days: Number(formData.api_key_rotation_reminder_days),
      alert_threshold_warning: Number(formData.alert_threshold_warning),
      alert_threshold_critical: Number(formData.alert_threshold_critical),
      rate_limit_per_minute: Number(formData.rate_limit_per_minute),
      notes: formData.notes || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Monthly Quota</label>
          <Input
            type="number"
            placeholder="e.g., 10000"
            value={formData.monthly_quota}
            onChange={(e) => setFormData(prev => ({ ...prev, monthly_quota: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Rate Limit/min</label>
          <Input
            type="number"
            value={formData.rate_limit_per_minute}
            onChange={(e) => setFormData(prev => ({ ...prev, rate_limit_per_minute: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Billing Cycle Start</label>
          <Input
            type="date"
            value={formData.billing_cycle_start}
            onChange={(e) => setFormData(prev => ({ ...prev, billing_cycle_start: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Cost per Unit ($)</label>
          <Input
            type="number"
            step="0.000001"
            value={formData.cost_per_unit}
            onChange={(e) => setFormData(prev => ({ ...prev, cost_per_unit: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Key Rotation Date</label>
          <Input
            type="date"
            value={formData.api_key_rotation_date}
            onChange={(e) => setFormData(prev => ({ ...prev, api_key_rotation_date: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Reminder Days</label>
          <Input
            type="number"
            value={formData.api_key_rotation_reminder_days}
            onChange={(e) => setFormData(prev => ({ ...prev, api_key_rotation_reminder_days: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Warning Threshold (%)</label>
          <Input
            type="number"
            value={formData.alert_threshold_warning}
            onChange={(e) => setFormData(prev => ({ ...prev, alert_threshold_warning: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Critical Threshold (%)</label>
          <Input
            type="number"
            value={formData.alert_threshold_critical}
            onChange={(e) => setFormData(prev => ({ ...prev, alert_threshold_critical: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Input
          placeholder="Add notes about this service..."
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  );
}
