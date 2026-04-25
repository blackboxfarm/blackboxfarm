import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MarketingProfile, MarketingSection } from "./types";

export function useMarketingProfiles(section?: MarketingSection) {
  const [data, setData] = useState<MarketingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = (supabase as any).from("marketing_profiles").select("*").order("sort_order", { ascending: true });
    if (section) q = q.eq("section", section);
    const { data: rows, error: err } = await q;
    if (err) setError(err.message);
    else setData((rows ?? []) as MarketingProfile[]);
    setLoading(false);
  }, [section]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export async function updateMarketingProfile(id: string, patch: Partial<MarketingProfile>) {
  const { error } = await (supabase as any)
    .from("marketing_profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function insertMarketingProfile(row: Omit<MarketingProfile, "id" | "created_at" | "updated_at">) {
  const { error } = await (supabase as any).from("marketing_profiles").insert(row);
  if (error) throw error;
}

export async function deleteMarketingProfile(id: string) {
  const { error } = await (supabase as any).from("marketing_profiles").delete().eq("id", id);
  if (error) throw error;
}