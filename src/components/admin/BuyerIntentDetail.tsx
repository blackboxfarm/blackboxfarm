import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, Eye, CreditCard, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface BuyerIntentDetailProps {
  userId: string;
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface JourneyEvent {
  id: string;
  event_name: string;
  page_path: string;
  created_at: string;
  event_type: string;
}

interface CheckoutIntent {
  id: string;
  price_id: string;
  status: string;
  created_at: string;
}

export function BuyerIntentDetail({ userId, email, open, onOpenChange }: BuyerIntentDetailProps) {
  const [journeyEvents, setJourneyEvents] = useState<JourneyEvent[]>([]);
  const [checkoutIntents, setCheckoutIntents] = useState<CheckoutIntent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);

    Promise.all([
      supabase
        .from('user_journey_events')
        .select('id, event_name, page_path, created_at, event_type')
        .eq('user_id', userId)
        .or('page_path.ilike.%subscriptions%,page_path.ilike.%pricing%,page_path.ilike.%onboarding%')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('checkout_intents')
        .select('id, price_id, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]).then(([journeyRes, checkoutRes]) => {
      setJourneyEvents((journeyRes.data as any[]) || []);
      setCheckoutIntents((checkoutRes.data as any[]) || []);
      setLoading(false);
    });
  }, [open, userId]);

  const allEvents = [
    ...journeyEvents.map(e => ({ type: 'page_view' as const, date: e.created_at, label: e.page_path, detail: e.event_name })),
    ...checkoutIntents.map(e => ({ type: 'checkout' as const, date: e.created_at, label: e.price_id, detail: e.status })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-orange-400" />
            Buyer Intent Timeline
          </DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : allEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pricing activity found.</p>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-2 pr-4">
              {allEvents.map((event, i) => (
                <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-border pl-3 py-1">
                  <div className="shrink-0 mt-0.5">
                    {event.type === 'checkout' ? (
                      <CreditCard className="h-4 w-4 text-red-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {event.type === 'checkout' ? 'Checkout Attempt' : event.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.type === 'checkout' ? (
                        <Badge variant="outline" className="text-[10px] mr-1">
                          {event.detail}
                        </Badge>
                      ) : null}
                      {event.detail}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(event.date), 'MMM d, HH:mm')}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
