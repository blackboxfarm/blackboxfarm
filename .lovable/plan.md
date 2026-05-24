## BlackBox Bot-Reply Aggregator

Reuse HoldersIntel as a single bot operating in three context-aware modes, mirroring the SolanaAlphaKR (Korean funnel) scraping approach for ingestion.

### Flow

```text
[Insiders Channel]                  ← MTProto listener (same as SolanaAlphaKR)
       │  new message → regex CA
       ▼
[blackbox_aggregator_runs] row      ← creates harvest job (status: pending)
       │
       ▼
[BlackBox Group]                    ← HoldersIntel posts CA (and only CA)
       │  Trojan / BonkBot / GMGN / Photon / RickBot / Maestro auto-reply
       ▼
[MTProto reply harvester]           ← 30s window, captures every bot reply
       │  also captures edited messages (bots edit-in-place)
       ▼
[blackbox_bot_replies] table        ← raw text + bot_name + edit history
       │
       ▼
[aggregator-compose edge fn]        ← parses each bot, merges fields,
       │                              adds HoldersIntel native intel
       │                              (dev rep, KYC root, sister wallets,
       │                               prior tickers/ATH, mesh)
       ▼
[Your Private Output Channel]       ← single templated digest message
```

### Three HoldersIntel modes

| Context | Behavior |
|---|---|
| Normal DM / group | Current behavior (unchanged) |
| **BlackBox group** (by chat_id) | Silent mode — only pastes CA when aggregator job fires, never auto-replies, never runs `/holders` chatter |
| **Output channel** (by chat_id) | Publisher only — posts templated digest, no commands accepted |

Mode is decided per-message by checking `chat_id` against `blackbox_channel_config` table (you set the three IDs once in admin).

### Database (new)

- `blackbox_channel_config` — `role` ('insiders_source' | 'blackbox_group' | 'output_channel'), `chat_id`, `enabled`
- `blackbox_aggregator_runs` — `token_mint`, `source_message_id`, `posted_at`, `harvest_until`, `status`, `digest_message_id`
- `blackbox_bot_replies` — `run_id`, `bot_username`, `raw_text`, `parsed_jsonb`, `received_at`, `edited_at`

### Edge functions (new)

1. `blackbox-insiders-listener` — runs off the same MTProto pipeline as SolanaAlphaKR, filters for new CAs, creates a run, has HoldersIntel post the CA into BlackBox group
2. `blackbox-reply-harvester` — MTProto listener on BlackBox group, writes every reply (and edit) to `blackbox_bot_replies` until `harvest_until` passes
3. `blackbox-aggregator-compose` — runs at `harvest_until`: parses each bot via per-bot parser registry, layers in HoldersIntel native intel, posts digest to output channel

### Per-bot parser registry

`_shared/blackbox-parsers/` — one file per bot (`trojan.ts`, `bonkbot.ts`, `gmgn.ts`, `photon.ts`, `rickbot.ts`, `maestro.ts`). Each exports `{ matches(username), parse(text) → fields }`. Fields normalized to a shared shape: `price`, `mcap`, `liquidity`, `volume`, `buy_tax`, `sell_tax`, `top10_pct`, `lp_locked`, `mint_authority`, `freeze_authority`, `holders`, `age`, etc. Unknown fields fall through into `extras` so nothing is lost.

### Digest template (kitchen-sink, prunable)

Per your direction — render **everything** we have, organized in collapsible sections so you can prune later:

```
🧬 $SYMBOL — <name>
CA: <mint>  ·  age <X>  ·  mcap $<X>

━━━ HOLDERSINTEL NATIVE ━━━
Dev: <wallet>  ·  Rep: <score>  ·  KYC root: <CEX>
Prior tickers: $A ($120k ATH), $B ($45k ATH)
Sister wallets: 3  ·  Mesh size: 12
Verdict: <auto GO/CAUTION/AVOID line>

━━━ MARKET (consensus across bots) ━━━
Price: $X (Trojan/GMGN agree, BonkBot stale)
LP: $X locked  ·  Tax B/S: X/Y%
Top 10: X%  ·  Holders: N

━━━ PER-BOT RAW ━━━
🤖 Trojan: <key fields>
🤖 GMGN:   <key fields>
🤖 BonkBot:<key fields>
🤖 Photon: <key fields>
🤖 RickBot:<key fields>
🤖 Maestro:<key fields>

━━━ SOCIALS ━━━
X · TG · Web · Discord (from token_social_links)
```

Cross-bot disagreement (e.g. price drift, tax mismatch) is surfaced explicitly so you can spot bot bugs / stale data at a glance.

### Technical notes

- Reuses existing MTProto infra (same as SolanaAlphaKR scraper) — no new bot, no new auth
- HoldersIntel chat-id routing layer added to its existing webhook handler — cheap, additive
- 30s harvest window is configurable per-run via `blackbox_aggregator_runs.harvest_until`
- Edit-in-place is handled (Photon/Trojan update their own messages with fresh prices); we keep the latest edit and timestamp it
- All bot replies stored raw forever → re-parse retroactively if a parser improves
- No changes to current HoldersIntel DM/group behavior

### Out of scope (for this round)

- Auto-buy / auto-snipe off the digest — read-only intel pipeline
- UI dashboard for runs — DB + Telegram channel only (we can add later)
