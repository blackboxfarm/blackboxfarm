import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ survey: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ survey: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Don't show if user disabled survey alerts
    if (prefs && (!prefs.email_alerts_enabled || !prefs.alert_types?.includes('survey_invitations'))) {
      return new Response(
        JSON.stringify({ survey: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if survey was shown recently
    if (prefs?.last_survey_shown_at) {
      const daysSinceLastSurvey = (Date.now() - new Date(prefs.last_survey_shown_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSurvey < (prefs.survey_frequency_days || 7)) {
        return new Response(
          JSON.stringify({ survey: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get active survey
    const { data: survey } = await supabase
      .from('surveys')
      .select('*')
      .eq('is_active', true)
      .gte('end_date', new Date().toISOString())
      .lte('start_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!survey) {
      return new Response(
        JSON.stringify({ survey: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already responded
    const { data: existingResponse } = await supabase
      .from('survey_responses')
      .select('id')
      .eq('survey_id', survey.id)
      .eq('user_id', user.id)
      .single();

    if (existingResponse) {
      return new Response(
        JSON.stringify({ survey: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last shown timestamp
    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      last_survey_shown_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ survey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error getting active survey:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
