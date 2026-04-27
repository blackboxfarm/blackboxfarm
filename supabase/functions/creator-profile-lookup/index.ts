// Mesh-wide identity lookup. Resolves any signal (wallet, X handle, TG ID,
// Discord ID, KYC root, website domain) to its fused Creator Profile and
// returns the full picture: every wallet, every social, every token, every
// merge it absorbed.
//
// POST { query: string } — the function detects the alias_kind heuristically.
// POST { kind, value }   — explicit if you already know the type.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  resolveSignalToCreatorId,
  type AliasKind,
} from '../_shared/creator-fusion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Heuristically figure out what kind of alias `q` is.
 * Order matters — most specific first.
 */
function detectKind(q: string): { kind: AliasKind; value: string } | null {
  const raw = q.trim();
  if (!raw) return null;

  // Explicit prefixes the user can use in the search box.
  if (raw.startsWith('tg:'))      return { kind: 'telegram_user_id', value: raw.slice(3).trim() };
  if (raw.startsWith('discord:')) return { kind: 'discord_handle',   value: raw.slice(8).trim().toLowerCase() };
  if (raw.startsWith('kyc:'))     return { kind: 'kyc_root',         value: raw.slice(4).trim() };
  if (raw.startsWith('@'))        return { kind: 'x_handle',         value: raw.slice(1).trim().toLowerCase() };

  // Bare numeric → telegram user id
  if (/^\d{4,}$/.test(raw)) return { kind: 'telegram_user_id', value: raw };

  // Solana address (base58, 32-44 chars, no 0/O/I/l)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) return { kind: 'wallet', value: raw };

  // Domain
  if (/\./.test(raw) && /^[a-z0-9.-]+$/i.test(raw)) {
    return { kind: 'website_domain', value: raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') };
  }

  // Fallback: treat as X handle
  return { kind: 'x_handle', value: raw.toLowerCase().replace(/^@/, '') };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    let kind: AliasKind | null = body.kind || null;
    let value: string | null = body.value || null;

    if (!kind || !value) {
      const q = body.query;
      if (!q || typeof q !== 'string') throw new Error('Provide `query` or `{ kind, value }`');
      const detected = detectKind(q);
      if (!detected) throw new Error('Unrecognized query format');
      kind = detected.kind;
      value = detected.value;
    }

    // Try direct resolution. If x_handle misses, retry as wallet (handles
    // copy-paste of a wallet address into the search box).
    let creatorId = await resolveSignalToCreatorId(kind!, value!, supabase);
    if (!creatorId && kind === 'x_handle' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value!)) {
      creatorId = await resolveSignalToCreatorId('wallet', value!, supabase);
      if (creatorId) kind = 'wallet';
    }

    if (!creatorId) {
      return new Response(
        JSON.stringify({ ok: true, found: false, kind, value }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the fused profile in one round-trip.
    const [profileRes, aliasRes, tokenRes, mergeRes] = await Promise.all([
      supabase
        .from('developer_profiles')
        .select('id, master_wallet_address, display_name, twitter_handle, telegram_handle, discord_handle, website_url, reputation_score, trust_level, total_tokens_created, rug_pull_count, kyc_verified, kyc_source, integrity_score, tags, notes, created_at, updated_at')
        .eq('id', creatorId)
        .maybeSingle(),
      supabase
        .from('creator_identity_aliases')
        .select('alias_kind, alias_value, confidence, source, first_seen_at, last_seen_at')
        .eq('creator_id', creatorId)
        .order('alias_kind', { ascending: true }),
      // All known token wallets for this creator → tokens via lifecycle table.
      supabase
        .from('creator_identity_aliases')
        .select('alias_value')
        .eq('creator_id', creatorId)
        .eq('alias_kind', 'wallet'),
      supabase
        .from('creator_merge_log')
        .select('absorbed_id, trigger_kind, trigger_value, triggered_by, created_at')
        .eq('surviving_id', creatorId)
        .order('created_at', { ascending: false }),
    ]);

    const wallets = (tokenRes.data || []).map((r: any) => r.alias_value);
    let tokens: any[] = [];
    if (wallets.length > 0) {
      const { data: tokenRows } = await supabase
        .from('telegram_insider_token_lifecycle')
        .select('token_mint, token_symbol, peak_multiplier, is_rugged, mesh_promotion_status, first_called_at, creator_wallet')
        .in('creator_wallet', wallets)
        .order('first_called_at', { ascending: false })
        .limit(500);
      tokens = tokenRows || [];
    }

    // Aggregate verdict
    const winners = tokens.filter((t) => t.peak_multiplier >= 3 && !t.is_rugged).length;
    const rugs = tokens.filter((t) => t.is_rugged).length;
    const verdict =
      winners > 0 && rugs > 0 ? 'mixed'
      : winners >= Math.max(2, tokens.length - 1) && tokens.length > 0 ? 'green'
      : rugs >= Math.max(2, tokens.length - 1) && tokens.length > 0 ? 'red'
      : 'neutral';

    return new Response(
      JSON.stringify({
        ok: true,
        found: true,
        matchedKind: kind,
        matchedValue: value,
        creatorId,
        profile: profileRes.data,
        aliases: aliasRes.data || [],
        tokens,
        mergeHistory: mergeRes.data || [],
        stats: {
          totalAliases: (aliasRes.data || []).length,
          totalWallets: wallets.length,
          totalTokens: tokens.length,
          winners,
          rugs,
          verdict,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[creator-profile-lookup] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
