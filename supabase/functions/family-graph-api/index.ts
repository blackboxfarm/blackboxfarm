import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { family_id, seed_wallet, action } = body;

    // Action: list all families
    if (action === 'list') {
      const { data: families, error } = await supabase
        .from('wallet_families')
        .select(`
          *,
          wallet_family_members(wallet_address, label, tier, confidence_score, status, last_activity_at),
          wallet_family_mint_events(id, mint_address, event_type, confidence, token_name, token_symbol, launchpad, created_at, is_acknowledged)
        `)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Compute tier counts per family
      const enriched = (families || []).map(f => {
        const members = f.wallet_family_members || [];
        return {
          ...f,
          tier_counts: {
            A: members.filter((m: any) => m.tier === 'A').length,
            B: members.filter((m: any) => m.tier === 'B').length,
            C: members.filter((m: any) => m.tier === 'C').length,
          },
          active_members: members.filter((m: any) => m.status === 'active').length,
          mint_count: (f.wallet_family_mint_events || []).length,
        };
      });

      return new Response(JSON.stringify({ families: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: get full graph for one family
    let resolvedFamilyId = family_id;
    if (!resolvedFamilyId && seed_wallet) {
      const { data } = await supabase
        .from('wallet_families')
        .select('id')
        .eq('seed_wallet', seed_wallet)
        .single();
      resolvedFamilyId = data?.id;
    }

    if (!resolvedFamilyId) {
      return new Response(JSON.stringify({ error: 'family_id or seed_wallet required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all data in parallel
    const [familyRes, membersRes, edgesRes, mintsRes, evidenceRes] = await Promise.all([
      supabase.from('wallet_families').select('*').eq('id', resolvedFamilyId).single(),
      supabase.from('wallet_family_members').select('*').eq('family_id', resolvedFamilyId),
      supabase.from('wallet_family_edges').select('*').eq('family_id', resolvedFamilyId),
      supabase.from('wallet_family_mint_events').select('*').eq('family_id', resolvedFamilyId).order('created_at', { ascending: false }).limit(50),
      supabase.from('wallet_family_evidence').select('evidence_type, wallet, related_wallet, score_delta, tx_signature, amount_sol, timestamp').eq('family_id', resolvedFamilyId).order('timestamp', { ascending: false }).limit(100),
    ]);

    if (familyRes.error) throw familyRes.error;

    const graph = {
      family: familyRes.data,
      nodes: (membersRes.data || []).map((m: any) => ({
        id: m.wallet_address,
        label: m.label,
        tier: m.tier,
        confidence: m.confidence_score,
        status: m.status,
        lastActivity: m.last_activity_at,
      })),
      edges: (edgesRes.data || []).map((e: any) => ({
        source: e.from_wallet,
        target: e.to_wallet,
        type: e.edge_type,
        weight: e.weight,
        confidence: e.confidence,
        evidenceCount: e.evidence_count,
      })),
      mintEvents: mintsRes.data || [],
      recentEvidence: evidenceRes.data || [],
      stats: {
        totalMembers: membersRes.data?.length || 0,
        tierA: membersRes.data?.filter((m: any) => m.tier === 'A').length || 0,
        tierB: membersRes.data?.filter((m: any) => m.tier === 'B').length || 0,
        tierC: membersRes.data?.filter((m: any) => m.tier === 'C').length || 0,
        totalMints: mintsRes.data?.length || 0,
        activeMembers: membersRes.data?.filter((m: any) => m.status === 'active').length || 0,
      },
    };

    return new Response(JSON.stringify(graph), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[FamilyGraphAPI] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
