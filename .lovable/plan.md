
# AI Token Interpretation & Explainer System

## Overview

Build an intelligent interpretation layer that transforms raw holder metrics into human-readable, guardrailed analysis following your v1.0 specification. The system will provide four deliverables per token: Token Status Overview, Lifecycle Position, Key Drivers, and Reasoning Trace.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                      │
├─────────────────────────────────────────────────────────────────────┤
│  BaglessHoldersReport.tsx                                            │
│    ├── Calls bagless-holders-report (existing)                       │
│    └── Calls token-ai-interpreter (NEW) with report data             │
│                                                                       │
│  AI Interpretation Panel (NEW component)                             │
│    ├── Token Status Overview (3-7 sentences)                         │
│    ├── Lifecycle Stage Badge + Confidence                            │
│    ├── Key Drivers (collapsible bullets)                             │
│    └── "Why this interpretation?" accordion                          │
├─────────────────────────────────────────────────────────────────────┤
│                         BACKEND                                       │
├─────────────────────────────────────────────────────────────────────┤
│  token-ai-interpreter (NEW Edge Function)                            │
│    ├── Pre-process metrics into buckets (deterministic)              │
│    ├── Select commentary mode (A-H) based on signals                 │
│    ├── Build prompt with guardrails + bucket context                 │
│    ├── Call Lovable AI (Gemini) with tool-calling schema             │
│    └── Return structured JSON interpretation                         │
├─────────────────────────────────────────────────────────────────────┤
│                         CACHING                                       │
├─────────────────────────────────────────────────────────────────────┤
│  token_ai_interpretations (NEW table)                                │
│    ├── token_mint, interpretation_json, created_at                   │
│    ├── 5-10 minute TTL via expires_at column                         │
│    └── Prevents duplicate AI calls for same token                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

1. User searches for token on /holders page
2. `bagless-holders-report` returns holder data (existing flow)
3. **NEW**: Frontend calls `token-ai-interpreter` with the report data
4. Edge function checks cache - if fresh interpretation exists, return it
5. If not cached, pre-process metrics into buckets:
   - Control Density: diffuse / coordinated-capable / centralized
   - Liquidity Coverage: covered / thin / very thin
   - Resilience Score: weak / moderate / strong
   - Tier Divergence: low / medium / high (if whale movement data available)
6. Select commentary mode based on which signals are most significant
7. Build prompt with your guardrails baked into system message
8. Call Lovable AI with tool-calling schema to force structured output
9. Cache result (5-10 min TTL), return to frontend
10. Frontend displays AI panel with toggle (logged-in users only)

---

## Input Variable Mapping

Your spec defines variables; here's how they map to existing `bagless-holders-report` data:

| Your Variable | Available Data |
|--------------|----------------|
| top5_hold_pct | `distributionStats.top5Percentage` |
| top10_hold_pct | `distributionStats.top10Percentage` |
| top20_hold_pct | `distributionStats.top20Percentage` |
| top25_hold_pct | Can be computed from `holders` array |
| circulating_ex_lp_pct | `circulatingSupply.percentage` |
| lp_supply_pct | `lpPercentageOfSupply` |
| unlocked_to_lp_ratio | Compute: `circulatingSupply.percentage / lpPercentageOfSupply` |
| total_wallets | `totalHolders` |
| dust_wallets | `simpleTiers.dust.count` |
| retail_wallets | `simpleTiers.retail.count` |
| serious_wallets | `simpleTiers.serious.count` |
| whale_wallets_total | `simpleTiers.whales.count` |
| liquidity_usd | `circulatingSupply.usdValue` or from DexScreener |
| mcap_usd | `marketCap` |
| structural_resilience_score | `healthScore.score` (0-100) |
| bundled_insider_pct | `insidersGraph.bundledPercentage` |

**Gap Identified**: Real-time whale movement events (last 48h buy/sell) are not currently tracked by bagless-holders-report. This limits Mode C (Behavioral Shift) and Mode F (Pressure Analysis) initially. The system can still function with structural metrics.

---

## Lifecycle Stage Logic

Pre-determine stage in Edge Function code (not AI) based on deterministic rules:

| Stage | Trigger Conditions |
|-------|-------------------|
| **Genesis** | totalHolders < 100 AND healthScore > 50 |
| **Discovery** | totalHolders 100-500 AND retailTier growing |
| **Expansion** | totalHolders > 500 AND serious+whale tiers strong |
| **Distribution** | whale % declining OR high tier divergence |
| **Compression** | Low volume signals (if available) |
| **Dormant** | Very low holder growth + stale metrics |
| **Reactivation** | Previously dormant + sudden activity |

Confidence is derived from how many signals align with the stage.

---

## Commentary Modes (All 8)

The Edge Function selects the most appropriate mode:

| Mode | When Selected |
|------|---------------|
| A - Snapshot | Default if no specific triggers |
| B - Structural | Focus request OR high concentration |
| C - Behavioral Shift | Whale movement delta exceeds threshold |
| D - Lifecycle | First-time analysis OR significant stage change |
| E - Risk Posture | High risk flags present |
| F - Pressure Analysis | Whale exits + liquidity imbalance |
| G - Capital Consensus | High tier divergence detected |
| H - Retention | Historical snapshots > 2 available |

For MVP, modes requiring whale movement history (C, F, G, H) will gracefully degrade with "insufficient behavioral data" messaging.

---

## AI Prompt Structure

The Edge Function builds this system prompt:

```text
You are a TOKEN STRUCTURE INTERPRETER for Holders Intel.

CRITICAL RULES:
- You interpret STRUCTURE and BEHAVIOR, never price direction
- FORBIDDEN: "bullish", "bearish", "buy", "sell", "pump", "dump", "guaranteed", "rug"
- ALLOWED: "fragile", "resilient", "sensitive", "concentrated", "diffuse", "pressure"
- If signals conflict, you MUST say "signals are mixed"
- Use conditional language: "If X continues, sensitivity may increase"

CURRENT TOKEN METRICS (pre-bucketed):
{
  "control_density": { "value": 42.5, "bucket": "coordinated-capable" },
  "liquidity_coverage": { "value": 3.2, "bucket": "thin" },
  "resilience_score": { "value": 68, "bucket": "moderate" },
  "lifecycle_stage": "Discovery",
  "lifecycle_confidence": "medium",
  "tier_distribution": { ... },
  "risk_flags": ["high_dust", "low_lp"]
}

COMMENTARY MODE: Snapshot (A)

Generate your response using the structured output schema.
```

---

## Structured Output Schema (Tool Calling)

Force consistent JSON via tool-calling:

```json
{
  "type": "function",
  "function": {
    "name": "token_interpretation",
    "parameters": {
      "type": "object",
      "properties": {
        "status_overview": {
          "type": "string",
          "description": "3-7 sentence summary focusing on structure, not price"
        },
        "lifecycle": {
          "type": "object",
          "properties": {
            "stage": { "type": "string", "enum": ["Genesis","Discovery","Expansion","Distribution","Compression","Dormant","Reactivation"] },
            "confidence": { "type": "string", "enum": ["high","medium","low"] },
            "explanation": { "type": "string" }
          }
        },
        "key_drivers": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "label": { "type": "string" },
              "metric_value": { "type": "string" },
              "bucket": { "type": "string" },
              "implication": { "type": "string" }
            }
          }
        },
        "reasoning_trace": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "metric": { "type": "string" },
              "value": { "type": "string" },
              "threshold_category": { "type": "string" },
              "phrase_selected": { "type": "string" }
            }
          }
        },
        "uncertainty_notes": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["status_overview","lifecycle","key_drivers","reasoning_trace"]
    }
  }
}
```

---

## Database Schema

**New Table: token_ai_interpretations**

```sql
CREATE TABLE token_ai_interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  interpretation JSONB NOT NULL,
  commentary_mode TEXT NOT NULL DEFAULT 'snapshot',
  metrics_snapshot JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tai_mint_expires ON token_ai_interpretations(token_mint, expires_at);

-- RLS: Public read (interpretations are non-sensitive)
ALTER TABLE token_ai_interpretations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read interpretations" ON token_ai_interpretations
  FOR SELECT USING (true);
CREATE POLICY "Edge functions can insert" ON token_ai_interpretations
  FOR INSERT WITH CHECK (true);
```

---

## Frontend Components

**New Component: AIInterpretationPanel**

Location: `src/components/holders/AIInterpretationPanel.tsx`

Features:
- Only renders for logged-in users
- Toggle to enable/disable AI feedback
- Collapsible sections for each output
- Loading skeleton while fetching
- "Why this interpretation?" expandable accordion

**Locked State for Anonymous Users**

A teaser div: "Sign up to unlock AI-powered holder analysis"

---

## XBot Integration (Abbreviated Version)

For automated and manual X posts, generate a condensed 1-2 sentence version:

Template variable: `{ai_summary}`

Example output:
"Structure is moderately resilient with thin liquidity coverage. Control is coordinated-capable among top holders. Lifecycle: Discovery (medium confidence)."

This gets appended to existing post templates when the toggle is enabled.

---

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create `token_ai_interpretations` table with caching
2. Create `token-ai-interpreter` Edge Function with:
   - Metric bucketing logic
   - Mode selection
   - Lovable AI integration with tool-calling
   - Cache read/write
3. Add config.toml entry

### Phase 2: Frontend Integration
1. Create `AIInterpretationPanel` component
2. Create `useTokenAIInterpretation` hook with caching
3. Integrate into `BaglessHoldersReport.tsx` (logged-in only)
4. Add locked-state teaser for anonymous users

### Phase 3: XBot Integration
1. Add `ai_summary` field to `holders-intel-poster` data
2. Update post templates with optional `{ai_summary}` variable
3. Add toggle in /share-card-demo admin for AI in posts

### Phase 4: Polish
1. Add "Explain Like I'm 5" toggle option
2. Add "Trader Mode" toggle for technical version
3. Clickable drivers that highlight the relevant chart/metric

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/token-ai-interpreter/index.ts` | **CREATE** - Core AI interpretation function |
| `supabase/config.toml` | **MODIFY** - Add function config |
| `src/components/holders/AIInterpretationPanel.tsx` | **CREATE** - UI component |
| `src/components/holders/AIInterpretationLocked.tsx` | **CREATE** - Teaser for anon users |
| `src/hooks/useTokenAIInterpretation.ts` | **CREATE** - Data fetching hook |
| `src/components/BaglessHoldersReport.tsx` | **MODIFY** - Integrate AI panel |
| `supabase/functions/holders-intel-poster/index.ts` | **MODIFY** - Add ai_summary support |

---

## Limitations and Considerations

1. **Whale Movement Gap**: Real-time 48h buy/sell events are not currently tracked. Modes C, F, G will have limited functionality initially. Future enhancement: integrate `track-holder-movements` data.

2. **Rate Limits**: Lovable AI has rate limits. The 5-10 minute cache prevents excessive calls for popular tokens.

3. **Cost**: Each AI call uses credits. Caching is essential for cost control.

4. **Historical Depth**: Retention/diamond hands commentary (Mode H) requires 2+ snapshots. Will gracefully degrade for new tokens.

5. **No Price Storage**: AI interpretations are ephemeral (10 min TTL) per your request. No long-term storage of interpretations.

---

## Guardrails Summary

Baked into system prompt:
- No price targets or direction predictions
- No "buy/sell/hold" language
- No "bullish/bearish" terminology
- Conditional risk language only ("If X continues...")
- Must flag uncertainty when signals conflict
- Must cite metrics in reasoning trace

This ensures compliance with your specification's "FORBIDDEN" and "ALLOWED" language rules.
