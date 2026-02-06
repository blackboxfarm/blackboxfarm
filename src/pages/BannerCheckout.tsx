import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Copy, Check, Clock, AlertCircle, ExternalLink, RefreshCw, Wallet, Undo2, Share2, Twitter } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'qrcode';

interface BannerOrder {
  id: string;
  image_url: string;
  link_url: string;
  title: string;
  duration_hours: number;
  price_usd: number;
  price_sol: number;
  sol_price_at_order: number;
  start_time: string;
  end_time: string;
  payment_status: string;
  activation_key: string | null;
  created_at: string;
  paid_composite_url?: string | null;
}

interface AdvertiserAccount {
  payment_wallet_pubkey: string;
  email: string;
}

export default function BannerCheckout() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState<BannerOrder | null>(null);
  const [advertiser, setAdvertiser] = useState<AdvertiserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundWallet, setRefundWallet] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
      fetchSolPrice();
    }
  }, [orderId]);

  useEffect(() => {
    if (advertiser?.payment_wallet_pubkey && order?.price_sol) {
      generateQRCode();
    }
  }, [advertiser, order]);

  // Poll for payment status
  useEffect(() => {
    if (order?.payment_status === 'pending') {
      const interval = setInterval(() => {
        checkPaymentStatus();
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [order?.payment_status]);

  const fetchOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('banner_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      const { data: advertiserData, error: advertiserError } = await supabase
        .from('advertiser_accounts')
        .select('payment_wallet_pubkey, email')
        .eq('id', orderData.advertiser_id)
        .single();

      if (advertiserError) throw advertiserError;
      setAdvertiser(advertiserData);
    } catch (error: any) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const fetchSolPrice = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sol-price');
      if (!error && data?.price) {
        setSolPrice(data.price);
      }
    } catch (error) {
      console.error('Error fetching SOL price:', error);
    }
  };

  const generateQRCode = async () => {
    if (!advertiser?.payment_wallet_pubkey || !order?.price_sol) return;
    
    try {
      // Solana Pay URL format
      const solanaPayUrl = `solana:${advertiser.payment_wallet_pubkey}?amount=${order.price_sol}&label=Banner%20Ad&message=Order%20${orderId}`;
      const qr = await QRCode.toDataURL(solanaPayUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeUrl(qr);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const checkPaymentStatus = async () => {
    if (!orderId) return;
    
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-banner-payment', {
        body: { orderId },
      });

      if (error) throw error;

      if (data.status === 'paid') {
        toast.success('Payment confirmed! Your banner is scheduled.');
        fetchOrderDetails();
      } else if (data.status === 'partial') {
        toast.info(`Partial payment received: ${data.received} SOL of ${order?.price_sol} SOL`);
      }
    } catch (error: any) {
      console.error('Error checking payment:', error);
    } finally {
      setCheckingPayment(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const canRefund = order && order.payment_status === 'paid' && new Date(order.start_time) > new Date();

  const handleRefund = async () => {
    if (!refundWallet || !orderId) return;
    setProcessingRefund(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('banner-refund', {
        body: { orderId, refundWallet },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      toast.success(`Refund processed! ${data.refundAmount.toFixed(4)} SOL sent (minus $10 fee)`);
      setShowRefundModal(false);
      fetchOrderDetails();
    } catch (error: any) {
      toast.error(error.message || 'Refund failed');
    } finally {
      setProcessingRefund(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Awaiting Payment</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">Paid</Badge>;
      case 'active':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">Active</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">Expired</Badge>;
      case 'refunded':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">Refunded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order || !advertiser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-4">This order doesn't exist or you don't have access to it.</p>
            <Button onClick={() => navigate('/buy-banner')}>Create New Order</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = order.payment_status !== 'pending';

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isPaid ? 'Payment Confirmed!' : 'Complete Your Payment'}
          </h1>
          <p className="text-muted-foreground">
            Order #{orderId?.slice(0, 8)}...
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left - Order Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
                <div className="mt-2">{getStatusBadge(order.payment_status)}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <img
                    src={order.image_url}
                    alt={order.title}
                    className="w-full rounded-lg shadow-md"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Title</span>
                    <span className="font-medium">{order.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{order.duration_hours} hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Time</span>
                    <span className="font-medium">{format(new Date(order.start_time), 'PPp')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Time</span>
                    <span className="font-medium">{format(new Date(order.end_time), 'PPp')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Link URL</span>
                    <a href={order.link_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                      Visit <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between text-lg">
                    <span className="text-muted-foreground">Total</span>
                    <div className="text-right">
                      <p className="font-bold">${order.price_usd} USD</p>
                      <p className="text-sm text-primary">{order.price_sol?.toFixed(4)} SOL</p>
                    </div>
                  </div>
                  {order.sol_price_at_order && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Rate: 1 SOL = ${order.sol_price_at_order.toFixed(2)} USD
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {isPaid && order.activation_key && (
              <Card className="border-green-500">
                <CardHeader>
                  <CardTitle className="text-green-500">Activation Key</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg font-mono text-center text-lg">
                    {order.activation_key}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Your banner will automatically go live at the scheduled start time.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right - Payment */}
          <div className="space-y-6">
            {!isPaid ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Send Payment
                    </CardTitle>
                    <CardDescription>
                      Send exactly {order.price_sol?.toFixed(4)} SOL to the address below
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {qrCodeUrl && (
                      <div className="flex justify-center">
                        <div className="bg-white p-4 rounded-lg">
                          <img src={qrCodeUrl} alt="Payment QR Code" className="w-48 h-48" />
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-sm text-muted-foreground">Payment Address</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="flex-1 bg-muted p-3 rounded-lg text-sm font-mono break-all">
                          {advertiser.payment_wallet_pubkey}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(advertiser.payment_wallet_pubkey)}
                        >
                          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        This wallet was generated exclusively for your order and will only be used for this transaction.
                      </p>
                    </div>

                    <div className="bg-primary/10 p-4 rounded-lg">
                      <div className="flex items-center gap-2 text-primary font-bold text-xl justify-center">
                        <span>{order.price_sol?.toFixed(4)} SOL</span>
                      </div>
                      <p className="text-center text-sm text-muted-foreground mt-1">
                        ≈ ${order.price_usd} USD
                      </p>
                    </div>

                    <Button
                      onClick={checkPaymentStatus}
                      disabled={checkingPayment}
                      variant="outline"
                      className="w-full"
                    >
                      {checkingPayment ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Check Payment Status
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      Payment Instructions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>1. Send exactly <strong>{order.price_sol?.toFixed(4)} SOL</strong> to the address above</p>
                    <p>2. Use any Solana wallet (Phantom, Solflare, etc.)</p>
                    <p>3. Payment will be detected automatically within a few minutes</p>
                    <p>4. You'll receive a confirmation email once payment is confirmed</p>
                    <p>5. Your banner will go live at the scheduled start time</p>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Payment must be received within 24 hours or this order will expire.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <Card className="border-green-500 bg-green-500/5">
                  <CardContent className="pt-6 text-center">
                    <Check className="h-16 w-16 mx-auto text-green-500 mb-4" />
                    <h3 className="text-xl font-bold text-green-500 mb-2">Payment Complete!</h3>
                    <p className="text-muted-foreground mb-4">
                      Your banner is scheduled and will go live at the selected start time.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button onClick={() => navigate(`/banner-preview/${orderId}`)}>
                        View Preview
                      </Button>
                      {canRefund && (
                        <Button variant="outline" onClick={() => setShowRefundModal(true)}>
                          <Undo2 className="h-4 w-4 mr-2" />
                          Request Refund
                        </Button>
                      )}
                    </div>
                    {canRefund && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Refunds available before start time ($10 fee applies)
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Share Proof of Payment Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Share2 className="h-5 w-5" />
                      Share Proof of Payment
                    </CardTitle>
                    <CardDescription>
                      Let your community know you've invested in promoting on BlackBox
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {order.paid_composite_url && (
                      <div className="rounded-lg overflow-hidden border">
                        <img 
                          src={order.paid_composite_url} 
                          alt="Paid banner preview"
                          className="w-full"
                        />
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={async () => {
                          const shareUrl = `https://blackbox.farm/og/paid-og?order=${orderId}`;
                          await navigator.clipboard.writeText(shareUrl);
                          setCopiedShareLink(true);
                          toast.success('Share link copied!');
                          setTimeout(() => setCopiedShareLink(false), 2000);
                        }}
                      >
                        {copiedShareLink ? (
                          <>
                            <Check className="h-4 w-4 mr-2 text-green-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Link
                          </>
                        )}
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => {
                          const shareUrl = `https://blackbox.farm/og/paid-og?order=${orderId}`;
                          const tweetText = `Just paid for a banner ad on @BlackBoxFarm! 🔥\n\nCheck it out:\n${shareUrl}`;
                          window.open(
                            `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
                            '_blank'
                          );
                        }}
                      >
                        <Twitter className="h-4 w-4 mr-2" />
                        Post on X
                      </Button>
                    </div>
                    
                    <p className="text-xs text-muted-foreground text-center">
                      When shared, this link will display your banner with a "Paid" verification badge
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      <Dialog open={showRefundModal} onOpenChange={setShowRefundModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Refund</DialogTitle>
            <DialogDescription>
              Funds will be returned to the wallet that sent the payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                <strong>$10 clawback fee</strong> will be deducted from your refund amount.
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Your refund will be sent back to the original wallet that made the payment.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundModal(false)}>Cancel</Button>
            <Button onClick={handleRefund} disabled={processingRefund}>
              {processingRefund ? 'Processing...' : 'Confirm Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}