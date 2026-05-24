## BlackBox Parser-Discovery Harness

Goal: stop guessing bot reply formats. Capture real raw replies from Trojan/BonkBot/GMGN/Photon/RickBot/Maestro, then write parsers against verified samples.

### Flow

```text
[Manual button on /super-admin]   OR   [Real Insiders run fires]
            │                                   │
            └────────────┬──────────────────────┘
                         ▼
            HoldersIntel posts CA into BlackBox group
                         │
                         ▼
            Wait 30s (probe_run.harvest_until)
                         ▼
            MTProto fetch messages since probe.posted_at
                         ▼
            For each reply: insert raw row into
            blackbox_parser_samples (verbatim text + entities + buttons)
                         ▼
            Admin panel renders per-bot sample browser
            (raw text · what generic parser caught · gaps)
                         ▼
            I write proper per-bot parsers off real text,
            replace generic.ts shells one bot at a time
```

### Database (new)

`blackbox_parser_samples`
- `id`, `probe_run_id` (nullable — links to aggregator run if captured passively)
- `token_mint`, `posted_at`
- `bot_username`, `bot_user_id`, `bot_display_name`
- `raw_text` (verbatim, no normalization)
- `raw_entities_jsonb` (Telegram entities — bold/links/code preserved)
- `inline_buttons_jsonb` (Trojan/BonkBot reply keyboards)
- `has_photo` bool, `caption` text
- `received_at`, `edited_at` (captures edit-in-place)
- `parser_attempt_jsonb` (what current generic parser extracted — for gap analysis)

### Edge function (new)

`blackbox-parser-probe`
- Mode A (manual): trigger from admin button → picks latest unprocessed CA from `telegram_insider_token_lifecycle` → posts to BlackBox → 30s wait → harvest → write samples
- Mode B (passive): wired into existing `blackbox-tick` aggregator composer — every real run also dumps raw replies into samples table (free corpus growth)

### Admin UI (new, /super-admin)

`BlackBoxParserSamples.tsx` panel:
- "Probe Now" button (auto-picks latest Insiders CA)
- Table grouped by `bot_username`: count of samples, last seen, last edit
- Click bot → modal with raw text samples (most recent 10), entities pretty-printed, what current parser caught, missing fields highlighted
- Export-as-fixture button (dumps a `.json` of N samples per bot → feeds a future parser test suite)

### Out of scope (this round)

- Writing the actual new parsers — that's the NEXT step once we have ≥3 samples per bot
- Replacing `generic.ts` — stays as fallback until per-bot parsers land
- No changes to aggregator output template / digest channel

### Manual prereqs (you, one-time)

- Confirm `blackbox_channel_config` has the BlackBox group chat_id seeded (insiders_source + blackbox_group rows). If not, I add a tiny seed UI in the same admin panel.
- MTProto session must be able to read BlackBox group messages (same auth path as SolanaAlphaKR).
