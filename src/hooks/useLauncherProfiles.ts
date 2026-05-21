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