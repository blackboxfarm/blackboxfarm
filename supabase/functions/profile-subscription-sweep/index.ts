import { withRunLog } from '../_shared/run-logger.ts';
import { assertUpdate } from '../_shared/db-assert.ts';
import {
  getSupabaseAdmin,
  loadKeypair,
  sweepAll,
} from '../_shared/profile-subscription.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('profile-subscription-sweep', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = getSupabaseAdmin();
    const { subscription_id } = await req.json();
    if (!subscription_id) {
      return new Response(JSON.stringify({ error: 'subscription_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: sub, error } = await supabase
      .from('profile_subscriptions').select('*').eq('id', subscription_id).maybeSingle();
    if (error || !sub) throw new Error('Subscription not found');
    if (sub.status === 'swept') {
      return new Response(JSON.stringify({ ok: false, reason: 'already swept' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: cfg } = await supabase
      .from('profile_subscription_configs')
      .select('central_wallet_pubkey')
      .eq('profile_key', sub.profile_key).maybeSingle();
    if (!cfg?.central_wallet_pubkey) throw new Error('Central wallet not configured for profile');

    const kp = await loadKeypair(sub.payment_wallet_secret_encrypted);
    const result = await sweepAll(kp, cfg.central_wallet_pubkey);
    if (!result) {
      return new Response(JSON.stringify({ ok: false, reason: 'balance too low' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await assertUpdate(
      supabase.from('profile_subscriptions').update({
        status: sub.status === 'paid' ? 'paid' : 'swept', // keep "paid" if still active; just record sweep tx
        sweep_tx_signature: result.signature,
        swept_at: new Date().toISOString(),
      }).eq('id', sub.id).select().single(),
      'profile_subscriptions',
    );

    return new Response(JSON.stringify({ ok: true, signature: result.signature, lamports: result.lamports }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));