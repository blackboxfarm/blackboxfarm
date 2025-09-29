import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SecureStorage } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    
    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    switch (action) {
      case 'start': {
        const body = await req.json();
        const { config, walletPool, emergencyHardSell } = body;
        
        // Create new trading session
        const { data: session, error: sessionError } = await supabase
          .from('trading_sessions')
          .insert({
            user_id: user.id,
            is_active: true,
            token_mint: config.tokenMint,
            config: config,
            start_mode: 'buying', // Will be determined by server
            session_start_time: new Date().toISOString(),
            daily_key: new Date().toISOString().slice(0, 10)
          })
          .select('*')
          .single();

        if (sessionError) {
          return new Response(JSON.stringify({ error: sessionError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Insert wallet pool with encrypted secrets
        if (walletPool && walletPool.length > 0) {
          const walletInserts = await Promise.all(
            walletPool.map(async (wallet: any) => ({
              session_id: session.id,
              pubkey: wallet.pubkey,
              secret_key: await SecureStorage.encryptWalletSecret(wallet.secret),
              sol_balance: wallet.balance
            }))
          );

          await supabase.from('wallet_pools').insert(walletInserts);
        }

        // Insert emergency sell if active
        if (emergencyHardSell?.isActive && emergencyHardSell?.limitPrice) {
          await supabase.from('emergency_sells').insert({
            session_id: session.id,
            limit_price: parseFloat(emergencyHardSell.limitPrice)
          });
        }

        // Log session start
        await supabase.from('activity_logs').insert({
          session_id: session.id,
          message: `🚀 Trading session started for ${config.tokenMint}`,
          log_level: 'info'
        });

        return new Response(JSON.stringify({ 
          success: true, 
          session: session,
          message: 'Trading session started successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'stop': {
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) {
          return new Response(JSON.stringify({ error: 'Session ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Stop the session
        const { error: stopError } = await supabase
          .from('trading_sessions')
          .update({ is_active: false })
          .eq('id', sessionId)
          .eq('user_id', user.id);

        if (stopError) {
          return new Response(JSON.stringify({ error: stopError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Deactivate emergency sells
        await supabase
          .from('emergency_sells')
          .update({ is_active: false })
          .eq('session_id', sessionId);

        // Log session stop
        await supabase.from('activity_logs').insert({
          session_id: sessionId,
          message: '🛑 Trading session stopped',
          log_level: 'info'
        });

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Trading session stopped successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'status': {
        // Get user's active sessions
        const { data: sessions, error: sessionsError } = await supabase
          .from('trading_sessions')
          .select(`
            *,
            trading_positions(*),
            activity_logs(*),
            emergency_sells(*)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsError) {
          return new Response(JSON.stringify({ error: sessionsError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ 
          success: true,
          sessions: sessions || []
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'logs': {
        const sessionId = url.searchParams.get('sessionId');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        
        if (!sessionId) {
          return new Response(JSON.stringify({ error: 'Session ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: logs, error: logsError } = await supabase
          .from('activity_logs')
          .select('*')
          .eq('session_id', sessionId)
          .order('timestamp', { ascending: false })
          .limit(limit);

        if (logsError) {
          return new Response(JSON.stringify({ error: logsError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ 
          success: true,
          logs: logs || []
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Session manager error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});