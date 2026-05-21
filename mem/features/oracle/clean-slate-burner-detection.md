---
name: Clean-Slate Burner Detection
description: Before classifying a fresh dev wallet as solo/indie, walk its funding chain ancestors and check Pump.fun profile coin counts; a low-history wallet funded via DeFi privacy hops (Jupiter Limit Orders Keeper, Jito tips, etc.) from a high-count mint-farm operator is a reputation-laundered relaunch, not a new dev.
type: feature
---

A fresh wallet with renounced authorities, polished branding, and zero co-mint cluster looks like a solo indie dev — but is often a **clean-slate burner** of a poisoned mint-farm operator.

## Detection rule
1. Trace funding chain back from the dev wallet (Helius top-1 hops).
2. For every ancestor wallet, fetch its Pump.fun profile (`https://pump.fun/profile/{wallet}?tab=coins`) and read `Created coins` count.
3. If any ancestor has >100 lifetime mints, treat the dev wallet as a **clean_slate_relaunch** and the ancestor as the parent operator — even if the funding chain passes through DeFi infra (Jupiter Limit Orders Keeper, Jito, Marinade) that normally terminates a mesh trace.
4. DeFi privacy hops between operator and burner are a **stronger** signal of laundering, not a reason to stop tracing.

## Persistence (per Developer Profile Doxing rule)
- Burner wallet: `dev_pattern = 'clean_slate_relaunch'`, `upstream_wallets += [operator]`, `linked_wallets += [operator]`, notes documenting funding hop and current/prior mints.
- Operator wallet: `dev_pattern = 'mint_farm_operator'`, `is_serial_spammer = true`, `total_tokens_launched = max(current, profile_count)`, `downstream_wallets += [burner]`, notes documenting burner's tokens.
- Cross-link X handle, TG, website from burner's mint up into operator's dossier so handle rotation is visible at a glance.

## Reference case: DREK (May 2026)
- Operator: `whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx` — 13,850 lifetime mints, top hit APEBAMA $67.8K.
- Burner: `gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB` — funded via Jupiter Limit Orders Keeper (4 hops), minted `forward` (calibration) then DREK (production attempt) with paid-verified X `@DrEvilKitty001` created 6 weeks pre-mint.