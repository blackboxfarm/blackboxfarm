import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SecurityEvent {
  event: string;
  details: any;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { event, details, timestamp }: SecurityEvent = await req.json()

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get client IP and user agent
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Log the security event
    const { error: logError } = await supabase
      .from('security_audit_log')
      .insert({
        event_type: event,
        table_name: 'auth_events',
        user_id: details.userId || null,
        details: {
          ...details,
          clientIP,
          userAgent,
          timestamp
        },
        ip_address: clientIP
      })

    if (logError) {
      console.error('Failed to log security event:', logError)
      return new Response(
        JSON.stringify({ error: 'Failed to log event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for suspicious activity patterns
    if (event === 'SIGNED_IN' || event === 'SIGN_IN_FAILED') {
      const { data: recentEvents, error: queryError } = await supabase
        .from('security_audit_log')
        .select('*')
        .eq('ip_address', clientIP)
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
        .order('created_at', { ascending: false })
        .limit(10)

      if (!queryError && recentEvents) {
        const failedAttempts = recentEvents.filter(e => 
          e.event_type === 'SIGN_IN_FAILED' && 
          e.created_at > new Date(Date.now() - 15 * 60 * 1000).toISOString() // Last 15 minutes
        ).length

        // Alert on suspicious activity
        if (failedAttempts >= 5) {
          console.warn(`Suspicious activity detected from IP ${clientIP}: ${failedAttempts} failed attempts`)
          
          // You could integrate with alerting services here
          // For example: send to Slack, email, etc.
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Security logger error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})