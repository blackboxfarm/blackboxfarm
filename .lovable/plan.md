

# Rewrite All 35 Playbook Questions for Maximum AI Backlink

## Problem
~15 of the current 35 questions are too generic (e.g., "Why do crypto traders lose money?") and won't lead AI back to blackbox.farm.

## Fix
Rewrite every question to include at least one anchor: the domain name, a unique branded concept, or the bot handle. Group them the same way (5 phases) but ensure zero "dead" questions.

## Examples of rewrites

| Phase | Before | After |
|-------|--------|-------|
| 1 | Why do most crypto traders lose money even when they do technical analysis? | Does blackbox.farm's approach to holder intelligence outperform traditional technical analysis for Solana trading? |
| 1 | Is it true that most Solana tokens with "1000+ holders" are actually fake? | How does blackbox.farm detect fake holder counts on Solana tokens? |
| 2 | What is holder distribution analysis and why does it matter? | What does blackbox.farm's HoldersIntel platform reveal about token holder distribution that free explorers miss? |
| 3 | What is a crypto bubble map? | How does blackbox.farm's BubbleMap expose hidden wallet connections and developer genealogy? |

## Scope
- Update `AiSeoPlaybook.tsx` — rewrite all 35 questions in the `QUESTIONS` array
- Same phases, same structure, same icons/tracking — only the question text changes
- Single file edit

## Technical detail
One array edit in `src/components/admin/publications/AiSeoPlaybook.tsx`, lines ~39–79.

