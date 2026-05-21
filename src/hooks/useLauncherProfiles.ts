import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LauncherProfile {
  id: string;
  name: string;
  x_handle: string | null;
  x_user_id: string | null;
  primary_dev_wallet: string | null;
  linked_wallets: string[];
  kyc_root_wallet: string | null;
  is_active: boolean;
  last_spidered_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface LauncherTradeRule {
  id: string;
  launcher_profile_id: string;
  mode: string;
  buy_amount_sol: number;
  slippage_bps: number;
  priority_fee_lamports: number;
  jito_tip_lamports: number;
  target_factor: number;
  min_seconds_after_mint: number;
  require_dev_buy_min_sol: number;
  max_daily_spend_sol: number;
  max_hold_seconds: number;
  funding_wallet_id: string | null;
  enabled: boolean;
}

export interface LauncherMintEvent {
  id: string;
  launcher_profile_id: string;
  mint_address: string;
  symbol: string | null;
  name: string | null;
  dev_wallet_used: string | null;
  detected_at: string;
  dev_initial_buy_sol: number | null;
  initial_mcap_usd: number | null;
  status: string;
  skip_reason: string | null;
  buy_tx_sig: string | null;
  buy_amount_sol: number | null;
  entry_mcap_usd: number | null;
  highest_mcap_usd: number | null;
  exit_mcap_usd: number | null;
  sell_tx_sig: string | null;
  realized_pnl_sol: number | null;
  multiple_realized: number | null;
}

export function useLauncherProfiles() {
  return useQuery({
    queryKey: ["launcher-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("launcher_profiles" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LauncherProfile[];
    },
  });
}

export function useLauncherTradeRule(profileId?: string) {
  return useQuery({
    queryKey: ["launcher-trade-rule", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("launcher_trade_rules" as any)
        .select("*")
        .eq("launcher_profile_id", profileId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as LauncherTradeRule | null;
    },
  });
}

export function useLauncherMintEvents(profileId?: string) {
  return useQuery({
    queryKey: ["launcher-mint-events", profileId],
    enabled: !!profileId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("launcher_mint_events" as any)
        .select("*")
        .eq("launcher_profile_id", profileId!)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as LauncherMintEvent[];
    },
  });
}

export function useUpdateTradeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<LauncherTradeRule> & { launcher_profile_id: string }) => {
      const { data, error } = await (supabase
        .from("launcher_trade_rules" as any) as any)
        .upsert(rule, { onConflict: "launcher_profile_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["launcher-trade-rule", vars.launcher_profile_id] });
    },
  });
}

export function useToggleProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase.from("launcher_profiles" as any) as any).update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["launcher-profiles"] }),
  });
}

export function useKillSwitch() {
  return useQuery({
    queryKey: ["launcher-kill-switch"],
    queryFn: async () => {
      const { data, error } = await supabase.from("launcher_global_kill_switch" as any).select("*").maybeSingle();
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 10_000,
  });
}

export function useSetKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (killed: boolean) => {
      const { error } = await (supabase.from("launcher_global_kill_switch" as any) as any)
        .update({ killed, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["launcher-kill-switch"] }),
  });
}

export function useBlackboxWallets() {
  return useQuery({
    queryKey: ["blackbox-wallets-for-launchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blackbox_wallets" as any)
        .select("id, pubkey, nickname, sol_balance, is_active")
        .eq("is_active", true)
        .order("nickname", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export async function invokeSpider(input: { xHandle?: string; devWallet?: string; tokenMint?: string; profileId?: string }) {
  const { data, error } = await supabase.functions.invoke("launcher-profile-spider", { body: input });
  if (error) throw error;
  return data;
}

export interface WalletMint {
  mint_address: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
  mint_date: string | null;
  source: "developer_tokens" | "launcher_mint_events";
}

export function useWalletMints(wallet?: string) {
  return useQuery({
    queryKey: ["wallet-mints", wallet],
    enabled: !!wallet,
    queryFn: async (): Promise<WalletMint[]> => {
      const w = wallet!;
      const [devTokensRes, launcherRes] = await Promise.all([
        (supabase.from("developer_tokens" as any) as any)
          .select("token_mint, launch_date")
          .eq("creator_wallet", w)
          .order("launch_date", { ascending: false })
          .limit(100),
        (supabase.from("launcher_mint_events" as any) as any)
          .select("mint_address, symbol, name, detected_at, metadata")
          .eq("dev_wallet_used", w)
          .order("detected_at", { ascending: false })
          .limit(100),
      ]);

      const map = new Map<string, WalletMint>();
      for (const r of (devTokensRes.data || []) as any[]) {
        if (!r.token_mint) continue;
        map.set(r.token_mint, {
          mint_address: r.token_mint,
          symbol: null,
          name: null,
          image: null,
          mint_date: r.launch_date,
          source: "developer_tokens",
        });
      }
      for (const r of (launcherRes.data || []) as any[]) {
        if (!r.mint_address) continue;
        const prev = map.get(r.mint_address);
        map.set(r.mint_address, {
          mint_address: r.mint_address,
          symbol: r.symbol ?? prev?.symbol ?? null,
          name: r.name ?? prev?.name ?? null,
          image: (r.metadata?.image as string) ?? prev?.image ?? null,
          mint_date: prev?.mint_date ?? r.detected_at,
          source: prev?.source ?? "launcher_mint_events",
        });
      }

      const mints = Array.from(map.keys());
      if (mints.length) {
        const { data: metas } = await (supabase.from("token_metadata" as any) as any)
          .select("mint_address, symbol, name, logo_uri")
          .in("mint_address", mints);
        for (const m of (metas || []) as any[]) {
          const existing = map.get(m.mint_address);
          if (!existing) continue;
          map.set(m.mint_address, {
            ...existing,
            symbol: existing.symbol || m.symbol,
            name: existing.name || m.name,
            image: existing.image || m.logo_uri,
          });
        }
      }

      return Array.from(map.values()).sort((a, b) => {
        const ad = a.mint_date ? new Date(a.mint_date).getTime() : 0;
        const bd = b.mint_date ? new Date(b.mint_date).getTime() : 0;
        return bd - ad;
      });
    },
  });
}