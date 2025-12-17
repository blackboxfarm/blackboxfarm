import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ExternalLink, Clock, Calendar, Eye, Check, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface BannerOrder {
  id: string;
  image_url: string;
  link_url: string;
  title: string;
  duration_hours: number;
  price_usd: number;
  price_sol: number;
  start_time: string;
  end_time: string;
  payment_status: string;
  is_active: boolean;
}

export default function BannerPreview() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<BannerOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('banner_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (error: any) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load banner preview');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (order: BannerOrder) => {
    if (order.is_active) {
      return <Badge className="bg-green-500">Live Now</Badge>;
    }
    if (order.payment_status === 'paid') {
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">Scheduled</Badge>;
    }
    if (order.payment_status === 'pending') {
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Awaiting Payment</Badge>;
    }
    return <Badge variant="outline">{order.payment_status}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Banner Not Found</h2>
            <p className="text-muted-foreground mb-4">This banner order doesn't exist or you don't have access to it.</p>
            <Button onClick={() => navigate('/buy-banner')}>Create New Banner</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="font-bold">{order.title}</h1>
              <p className="text-sm text-muted-foreground">Banner Preview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(order)}
            {order.payment_status === 'pending' && (
              <Button size="sm" onClick={() => navigate(`/banner-checkout/${orderId}`)}>
                Complete Payment
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Preview */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Simulated Report Header */}
                <div className="bg-muted rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-lg">Bagless Holders Report</h3>
                      <p className="text-sm text-muted-foreground">Token Analysis Dashboard</p>
                    </div>
                    <Badge variant="outline">Demo</Badge>
                  </div>

                  {/* Banner Position 1 - Your Ad Here */}
                  <div className="mb-4">
                    <a
                      href={order.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <div className="relative overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-shadow">
                        <img
                          src={order.image_url}
                          alt={order.title}
                          className="w-full"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
                            Visit <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </a>
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                      Your banner in Position 1 (Premium Placement)
                    </p>
                  </div>

                  {/* Simulated Report Content */}
                  <div className="space-y-3 opacity-50">
                    <div className="h-8 bg-background/50 rounded w-3/4"></div>
                    <div className="h-4 bg-background/50 rounded w-1/2"></div>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="h-24 bg-background/50 rounded"></div>
                      <div className="h-24 bg-background/50 rounded"></div>
                      <div className="h-24 bg-background/50 rounded"></div>
                    </div>
                    <div className="h-32 bg-background/50 rounded mt-4"></div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground text-center">
                  This is how your banner will appear on the Bagless Holders Report page
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Order Details Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    {getStatusBadge(order)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{order.duration_hours} hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-medium">${order.price_usd} USD</span>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Schedule</span>
                  </div>
                  <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Start:</span>
                      <span className="font-mono">{format(new Date(order.start_time), 'PPp')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>End:</span>
                      <span className="font-mono">{format(new Date(order.end_time), 'PPp')}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Destination</span>
                  </div>
                  <a
                    href={order.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm break-all"
                  >
                    {order.link_url}
                  </a>
                </div>
              </CardContent>
            </Card>

            {order.payment_status === 'paid' && (
              <Card className="border-green-500 bg-green-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-green-500 mb-2">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">Payment Confirmed</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your banner will automatically go live at the scheduled start time.
                  </p>
                </CardContent>
              </Card>
            )}

            {order.payment_status === 'pending' && (
              <Card className="border-yellow-500 bg-yellow-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-yellow-500 mb-2">
                    <Clock className="h-5 w-5" />
                    <span className="font-medium">Awaiting Payment</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Complete your payment to activate this banner.
                  </p>
                  <Button
                    className="w-full"
                    onClick={() => navigate(`/banner-checkout/${orderId}`)}
                  >
                    Complete Payment
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="text-center">
              <Link to="/buy-banner" className="text-sm text-muted-foreground hover:text-primary">
                Want to create another banner?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}