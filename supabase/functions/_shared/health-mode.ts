import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Check if a medium should use AI-enhanced health scoring.
 * Falls back to true (AI mode) if the setting can't be read.
 */
export async function getHealthMode(medium: 'telegram_bot' | 'holders_page' | 'x_posts'): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data, error } = await sb
      .from("platform_health_mode")
      .select("use_ai")
      .eq("medium", medium)
      .single();

    if (error || !data) {
      console.warn(`[health-mode] Could not read setting for ${medium}, defaulting to AI`);
      return true;
    }

    return data.use_ai;
  } catch (e) {
    console.warn(`[health-mode] Error reading setting: ${e}`);
    return true;
  }
}
