import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Users, Search, RefreshCw, Eye, Wallet, Mail, Twitter, 
  Calendar, DollarSign, Image, ExternalLink, Copy, CheckCircle,
  XCircle, Clock, Ban, MoreHorizontal
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Advertiser {
  id: string;
  email: string;
  twitter_handle: string | null;
  payment_wallet_pubkey: string;
  total_spent_sol: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
}

interface BannerOrder {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  duration_hours: number;
  price_usd: number;
  price_sol: number | null;
  payment_status: string | null;
  start_time: string;
  end_time: string | null;
  activation_key: string | null;
  created_at: string | null;
  is_active: boolean | null;
}

export default function AdvertiserManagement() {
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<Advertiser | null>(null);
  const [advertiserOrders, setAdvertiserOrders] = useState<BannerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchAdvertisers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('advertiser_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdvertisers(data || []);
    } catch (error: any) {
      toast.error('Failed to load advertisers: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvertiserOrders = async (advertiserId: string) => {
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('banner_orders')
        .select('*')
        .eq('advertiser_id', advertiserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdvertiserOrders(data || []);
    } catch (error: any) {
      toast.error('Failed to load orders: ' + error.message);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvertisers();
  }, []);

  const handleViewDetails = async (advertiser: Advertiser) => {
    setSelectedAdvertiser(advertiser);
    setDetailsOpen(true);
    await fetchAdvertiserOrders(advertiser.id);
  };

  const toggleAdvertiserStatus = async (advertiser: Advertiser) => {
    try {
      const { error } = await supabase
        .from('advertiser_accounts')
        .update({ is_active: !advertiser.is_active })
        .eq('id', advertiser.id);

      if (error) throw error;
      toast.success(`Advertiser ${advertiser.is_active ? 'disabled' : 'enabled'}`);
      fetchAdvertisers();
    } catch (error: any) {
      toast.error('Failed to update status: ' + error.message);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const filteredAdvertisers = advertisers.filter(a => 
    a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.twitter_handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.payment_wallet_pubkey.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPaymentStatusBadge = (status: string | null) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'partial':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30"><Clock className="w-3 h-3 mr-1" />Partial</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Advertiser Management
              </CardTitle>
              <CardDescription>
                Manage advertiser accounts, orders, and payments
              </CardDescription>
            </div>
            <Button onClick={fetchAdvertisers} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, twitter, or wallet..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="secondary">{filteredAdvertisers.length} advertisers</Badge>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="text-2xl font-bold">{advertisers.length}</div>
              <div className="text-sm text-muted-foreground">Total Advertisers</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-green-400">
                {advertisers.filter(a => a.is_active !== false).length}
              </div>
              <div className="text-sm text-muted-foreground">Active</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-primary">
                {advertisers.reduce((sum, a) => sum + (a.total_spent_sol || 0), 0).toFixed(2)} SOL
              </div>
              <div className="text-sm text-muted-foreground">Total Revenue</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold">
                {advertisers.filter(a => a.twitter_handle).length}
              </div>
              <div className="text-sm text-muted-foreground">With Twitter</div>
            </Card>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Twitter</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredAdvertisers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No advertisers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdvertisers.map((advertiser) => (
                    <TableRow key={advertiser.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{advertiser.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {advertiser.twitter_handle ? (
                          <a 
                            href={`https://twitter.com/${advertiser.twitter_handle.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Twitter className="h-4 w-4" />
                            {advertiser.twitter_handle}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">
                            {advertiser.payment_wallet_pubkey.slice(0, 4)}...{advertiser.payment_wallet_pubkey.slice(-4)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(advertiser.payment_wallet_pubkey, 'Wallet')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-primary">
                          {(advertiser.total_spent_sol || 0).toFixed(4)} SOL
                        </span>
                      </TableCell>
                      <TableCell>
                        {advertiser.is_active !== false ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {advertiser.created_at ? format(new Date(advertiser.created_at), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(advertiser)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => copyToClipboard(advertiser.payment_wallet_pubkey, 'Wallet')}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Wallet
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => toggleAdvertiserStatus(advertiser)}
                              className={advertiser.is_active !== false ? 'text-destructive' : 'text-green-400'}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              {advertiser.is_active !== false ? 'Disable' : 'Enable'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Advertiser Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Advertiser Details
            </DialogTitle>
            <DialogDescription>
              {selectedAdvertiser?.email}
            </DialogDescription>
          </DialogHeader>

          {selectedAdvertiser && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Account Info</TabsTrigger>
                <TabsTrigger value="orders">Orders ({advertiserOrders.length})</TabsTrigger>
                <TabsTrigger value="wallet">Wallet</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">Email</div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedAdvertiser.email}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(selectedAdvertiser.email, 'Email')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">Twitter</div>
                    <div className="flex items-center gap-2">
                      <Twitter className="h-4 w-4 text-muted-foreground" />
                      {selectedAdvertiser.twitter_handle ? (
                        <a 
                          href={`https://twitter.com/${selectedAdvertiser.twitter_handle.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {selectedAdvertiser.twitter_handle}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Not provided</span>
                      )}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">Total Spent</div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <span className="text-xl font-bold text-primary">
                        {(selectedAdvertiser.total_spent_sol || 0).toFixed(4)} SOL
                      </span>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">Account Status</div>
                    <div>
                      {selectedAdvertiser.is_active !== false ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">Created</div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {selectedAdvertiser.created_at 
                          ? format(new Date(selectedAdvertiser.created_at), 'PPpp') 
                          : '—'}
                      </span>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">User ID</div>
                    <div className="font-mono text-xs">
                      {selectedAdvertiser.user_id || 'Not linked'}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="orders">
                <ScrollArea className="h-[400px]">
                  {ordersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : advertiserOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No orders found
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {advertiserOrders.map((order) => (
                        <Card key={order.id} className="p-4">
                          <div className="flex gap-4">
                            <div className="w-32 h-20 rounded overflow-hidden bg-muted flex-shrink-0">
                              <img 
                                src={order.image_url} 
                                alt={order.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                                }}
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold">{order.title}</h4>
                                {getPaymentStatusBadge(order.payment_status)}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{order.duration_hours}h</span>
                                <span>${order.price_usd} USD</span>
                                {order.price_sol && <span>{order.price_sol.toFixed(4)} SOL</span>}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <a 
                                  href={order.link_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {order.link_url}
                                </a>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Start: {format(new Date(order.start_time), 'PPp')}</span>
                                {order.activation_key && (
                                  <span className="font-mono bg-muted px-2 py-0.5 rounded">
                                    {order.activation_key}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="wallet" className="space-y-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-2">Payment Wallet Address</div>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <code className="flex-1 font-mono text-sm bg-muted p-2 rounded">
                      {selectedAdvertiser.payment_wallet_pubkey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedAdvertiser.payment_wallet_pubkey, 'Wallet')}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </Card>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(`https://solscan.io/account/${selectedAdvertiser.payment_wallet_pubkey}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Solscan
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
