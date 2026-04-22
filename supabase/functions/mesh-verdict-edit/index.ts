// Mesh Verdict Editor — generic super-admin edit/delete on reputation_mesh rows
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Super admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { id, action, relationship, confidence, evidence, admin_note } = body as {
      id?: string;
      action?: 'update' | 'delete';
      relationship?: string;
      confidence?: number;
      evidence?: any;
      admin_note?: string;
    };

    if (!id || !action) {
      return new Response(JSON.stringify({ error: "id and action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'delete') {
      const { error: delErr } = await supabase.from('reputation_mesh').delete().eq('id', id);
      if (delErr) throw delErr;
      return new Response(JSON.stringify({ success: true, deleted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'update') {
      const { data: existing, error: getErr } = await supabase
        .from('reputation_mesh')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (getErr) throw getErr;
      if (!existing) {
        return new Response(JSON.stringify({ error: "row not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const update: any = {};

      if (relationship !== undefined && relationship !== null && String(relationship).trim()) {
        update.relationship = String(relationship).trim().slice(0, 100);
      }

      if (confidence !== undefined && confidence !== null) {
        const c = Math.max(0, Math.min(100, Math.round(Number(confidence))));
        if (Number.isFinite(c)) update.confidence = c;
      }

      let mergedEvidence: any = existing.evidence || {};
      if (evidence !== undefined && evidence !== null) {
        if (typeof evidence === 'string') {
          try {
            mergedEvidence = JSON.parse(evidence);
          } catch {
            return new Response(JSON.stringify({ error: "evidence must be valid JSON" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else if (typeof evidence === 'object') {
          mergedEvidence = evidence;
        }
      }

      const notes = Array.isArray(mergedEvidence.admin_notes) ? mergedEvidence.admin_notes : [];
      notes.push({
        edited_by: user.id,
        edited_at: new Date().toISOString(),
        note: admin_note || null,
        prev_relationship: existing.relationship,
        prev_confidence: existing.confidence,
      });
      mergedEvidence.admin_notes = notes;
      mergedEvidence.last_edited_by = user.id;
      mergedEvidence.last_edited_at = new Date().toISOString();
      update.evidence = mergedEvidence;

      const { data: updated, error: upErr } = await supabase
        .from('reputation_mesh')
        .update(update)
        .eq('id', id)
        .select()
        .single();
      if (upErr) throw upErr;

      return new Response(JSON.stringify({ success: true, row: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error('[mesh-verdict-edit] FATAL:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
