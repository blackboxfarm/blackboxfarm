import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, CreditCard, Receipt, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
  email?: string;
  displayName?: string;
}

const fmtCents = (cents: number | null | undefined, currency = "usd") => {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

const statusBadge = (status: string) => {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    active: { cls: "bg-green-500/20 text-green-400 border-green-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    trialing: { cls: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Clock className="h-3 w-3" /> },
    past_due: { cls: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: <AlertCircle className="h-3 w-3" /> },
    canceled: { cls: "bg-muted text-muted-foreground", icon: <XCircle className="h-3 w-3" /> },
    unpaid: { cls: "bg-red-500/20 text-red-400 border-red-500/30", icon: <AlertCircle className="h-3 w-3" /> },
    paid: { cls: "bg-green-500/20 text-green-400 border-green-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    open: { cls: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: <Clock className="h-3 w-3" /> },
    void: { cls: "bg-muted text-muted-foreground", icon: <XCircle className="h-3 w-3" /> },
    uncollectible: { cls: "bg-red-500/20 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" /> },
  };
  const { cls, icon } = map[status] || { cls: "bg-muted text-muted-foreground", icon: null };
  return (
    <Badge className={`${cls} gap-1 text-[10px]`}>
      {icon}
      {status}
    </Badge>
  );
};

export function StripeCustomerDialog({ open, onOpenChange, userId, email, displayName }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-stripe-customer", userId, email],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-stripe-customer-details", {
        body: { user_id: userId, email },
      });
      if (error) throw error;
      return data;
    },
    enabled: open && (!!userId || !!email),
    staleTime: 60_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Stripe Customer
            {displayName && <span className="text-muted-foreground font-normal text-sm">· {displayName}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="py-8 text-center text-muted-foreground animate-pulse">Loading Stripe data…</div>}

        {error && (
          <div className="py-6 text-center text-red-400">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            Failed to load: {(error as Error).message}
          </div>
        )}

        {data && !data.found && (
          <div className="py-8 text-center text-muted-foreground">
            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No Stripe customer found for <span className="font-mono">{data.email}</span>
          </div>
        )}

        {data && data.found && (
          <div className="space-y-5">
            {/* Customer header */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold">{data.customer.name || data.customer.email}</div>
                    <div className="text-xs text-muted-foreground font-mono">{data.customer.id}</div>
                    <div className="text-xs text-muted-foreground">
                      Customer since {fmtDate(data.customer.created)}
                      {data.customer.delinquent && (
                        <Badge className="ml-2 bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Delinquent</Badge>
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={data.customer.dashboard_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" /> Stripe
                    </a>
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                  <div>
                    <div className="text-xs text-muted-foreground">Lifetime Spend</div>
                    <div className="font-bold text-green-400">{fmtCents(data.lifetime_spend, data.customer.currency || "usd")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Refunded</div>
                    <div className="font-bold text-orange-400">{fmtCents(data.total_refunded, data.customer.currency || "usd")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Invoices</div>
                    <div className="font-bold">{data.invoice_count}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscriptions */}
            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">📋 Subscriptions ({data.subscriptions.length})</div>
              {data.subscriptions.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No subscriptions on record</div>
              ) : (
                <div className="space-y-2">
                  {data.subscriptions.map((s: any) => (
                    <Card key={s.id}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                              {fmtCents(s.amount, s.currency)} / {s.interval}
                            </span>
                            {statusBadge(s.status)}
                            {s.cancel_at_period_end && (
                              <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-500/30">
                                Cancels at period end
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{s.id.slice(0, 14)}…</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div>Period: {fmtDate(s.current_period_start)} → {fmtDate(s.current_period_end)}</div>
                          {s.trial_end && <div>Trial ends: {fmtDate(s.trial_end)}</div>}
                          {s.canceled_at && <div>Canceled: {fmtDate(s.canceled_at)}</div>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Payment methods */}
            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">💳 Payment Methods</div>
              {data.payment_methods.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No cards on file</div>
              ) : (
                <div className="space-y-1">
                  {data.payment_methods.map((pm: any) => (
                    <div key={pm.id} className="flex items-center gap-3 text-sm bg-muted/40 rounded px-3 py-2">
                      <span className="uppercase font-semibold text-xs">{pm.brand}</span>
                      <span className="font-mono">•••• {pm.last4}</span>
                      <span className="text-xs text-muted-foreground">exp {pm.exp_month}/{String(pm.exp_year).slice(-2)}</span>
                      {pm.is_default && <Badge className="ml-auto bg-primary/20 text-primary border-primary/30 text-[10px]">Default</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices */}
            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Receipt className="h-4 w-4" /> Recent Invoices</div>
              {data.invoices.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No invoices yet</div>
              ) : (
                <div className="space-y-1">
                  {data.invoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center gap-3 text-xs bg-muted/40 rounded px-3 py-2">
                      <span className="text-muted-foreground w-20">{fmtDate(inv.created)}</span>
                      <span className="font-semibold w-20">{fmtCents(inv.amount_paid || inv.amount_due, inv.currency)}</span>
                      {statusBadge(inv.status)}
                      {inv.attempt_count > 1 && (
                        <span className="text-orange-400">↻ {inv.attempt_count} attempts</span>
                      )}
                      <span className="ml-auto flex gap-2">
                        {inv.hosted_invoice_url && (
                          <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">View</a>
                        )}
                        {inv.invoice_pdf && (
                          <a href={inv.invoice_pdf} target="_blank" rel="noreferrer" className="text-primary hover:underline">PDF</a>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}