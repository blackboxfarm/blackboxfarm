import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, Download, Filter, Mail } from "lucide-react";
import { CreditCard } from "lucide-react";
import { StripeCustomerDialog } from "@/components/admin/StripeCustomerDialog";

type AccountRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  oauth_provider: string | null;
  cached_tier_key: string;
  cached_subscription_active: boolean;
  created_at: string;
  last_active_at: string | null;
  email_verified: boolean;
  has_telegram: boolean;
  telegram_username: string | null;
  login_count: number;
};

type PresetKey = "all" | "no_tg" | "has_tg" | "pro" | "free" | "email_unverified" | "inactive_7d";

const PRESETS: { key: PresetKey; label: string; emoji: string }[] = [
  { key: "all", label: "All", emoji: "👥" },
  { key: "no_tg", label: "No Telegram", emoji: "📵" },
  { key: "has_tg", label: "Has Telegram", emoji: "📱" },
  { key: "pro", label: "Pro/Paid", emoji: "⭐" },
  { key: "free", label: "Free Only", emoji: "🆓" },
  { key: "email_unverified", label: "Email Unverified", emoji: "📧" },
  { key: "inactive_7d", label: "Inactive 7d+", emoji: "💤" },
];

export default function AccountsTab() {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<PresetKey>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stripeTarget, setStripeTarget] = useState<{ userId: string; email: string; name: string | null } | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["admin-accounts-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_accounts_directory");
      if (error) throw error;
      return (data as AccountRow[]) || [];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    let list = accounts;

    // Apply preset filter
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    switch (preset) {
      case "no_tg": list = list.filter(a => !a.has_telegram); break;
      case "has_tg": list = list.filter(a => a.has_telegram); break;
      case "pro": list = list.filter(a => a.cached_subscription_active || (a.cached_tier_key && a.cached_tier_key !== "free")); break;
      case "free": list = list.filter(a => a.cached_tier_key === "free" && !a.cached_subscription_active); break;
      case "email_unverified": list = list.filter(a => !a.email_verified); break;
      case "inactive_7d": list = list.filter(a => !a.last_active_at || new Date(a.last_active_at) < sevenDaysAgo); break;
    }

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.email?.toLowerCase().includes(q) ||
        a.display_name?.toLowerCase().includes(q) ||
        a.telegram_username?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [accounts, preset, search]);

  const stats = useMemo(() => ({
    total: accounts.length,
    withTg: accounts.filter(a => a.has_telegram).length,
    noTg: accounts.filter(a => !a.has_telegram).length,
    pro: accounts.filter(a => a.cached_subscription_active || (a.cached_tier_key && a.cached_tier_key !== "free")).length,
    emailVerified: accounts.filter(a => a.email_verified).length,
  }), [accounts]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(a => a.user_id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const copySelectedEmails = () => {
    const emails = filtered
      .filter(a => selectedIds.has(a.user_id) && a.email)
      .map(a => a.email)
      .join("\n");
    navigator.clipboard.writeText(emails);
  };

  const exportCSV = () => {
    const rows = filtered.filter(a => selectedIds.size === 0 || selectedIds.has(a.user_id));
    const header = "email,display_name,tier,has_telegram,telegram_username,email_verified,created_at,last_active\n";
    const csv = header + rows.map(a =>
      `${a.email},${a.display_name || ""},${a.cached_tier_key},${a.has_telegram},${a.telegram_username || ""},${a.email_verified},${a.created_at},${a.last_active_at || ""}`
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `accounts_${preset}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tierBadge = (tier: string, active: boolean) => {
    if (active || (tier && tier !== "free")) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{tier?.toUpperCase() || "PRO"}</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">FREE</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">Total Accounts</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-green-400">{stats.withTg}</div><div className="text-xs text-muted-foreground">TG Linked</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-orange-400">{stats.noTg}</div><div className="text-xs text-muted-foreground">No Telegram</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-amber-400">{stats.pro}</div><div className="text-xs text-muted-foreground">Paid/Pro</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-400">{stats.emailVerified}</div><div className="text-xs text-muted-foreground">Email Verified</div></CardContent></Card>
      </div>

      {/* Preset segment buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Filter className="h-4 w-4" /> Quick Segments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => { setPreset(p.key); clearSelection(); }}
              className="text-xs"
            >
              {p.emoji} {p.label}
              {preset !== p.key && (
                <span className="ml-1 opacity-60">
                  ({p.key === "all" ? accounts.length :
                    p.key === "no_tg" ? stats.noTg :
                    p.key === "has_tg" ? stats.withTg :
                    p.key === "pro" ? stats.pro :
                    p.key === "free" ? accounts.length - stats.pro :
                    p.key === "email_unverified" ? accounts.length - stats.emailVerified :
                    "?"})
                </span>
              )}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Search + actions */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search email, name, or TG username..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" variant="outline" onClick={selectAllFiltered}>Select All ({filtered.length})</Button>
        {selectedIds.size > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={clearSelection}>Clear ({selectedIds.size})</Button>
            <Button size="sm" variant="outline" onClick={copySelectedEmails}>
              <Mail className="h-3 w-3 mr-1" /> Copy Emails
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={exportCSV}>
          <Download className="h-3 w-3 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Results info */}
      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} of {accounts.length} accounts
        {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-10">☑</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>TG</TableHead>
                  <TableHead>Email ✓</TableHead>
                  <TableHead>Logins</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="w-12">Stripe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8">Loading accounts...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8">No accounts match filters</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 500).map(a => (
                    <TableRow
                      key={a.user_id}
                      className={`cursor-pointer ${selectedIds.has(a.user_id) ? "bg-primary/10" : ""}`}
                      onClick={() => toggleSelect(a.user_id)}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.user_id)}
                          onChange={() => toggleSelect(a.user_id)}
                          className="accent-primary"
                        />
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[200px] truncate">{a.email}</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">{a.display_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{a.oauth_provider || "email"}</Badge>
                      </TableCell>
                      <TableCell>{tierBadge(a.cached_tier_key, a.cached_subscription_active)}</TableCell>
                      <TableCell>
                        {a.has_telegram ? (
                          <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[10px]">
                            @{a.telegram_username || "linked"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.email_verified ? (
                          <span className="text-green-400 text-xs">✓</span>
                        ) : (
                          <span className="text-orange-400 text-xs">✗</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.login_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.last_active_at ? new Date(a.last_active_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="View Stripe details"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStripeTarget({ userId: a.user_id, email: a.email, name: a.display_name });
                          }}
                        >
                          <CreditCard className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <StripeCustomerDialog
        open={!!stripeTarget}
        onOpenChange={(v) => !v && setStripeTarget(null)}
        userId={stripeTarget?.userId}
        email={stripeTarget?.email}
        displayName={stripeTarget?.name ?? undefined}
      />
    </div>
  );
}
