---
name: Developer Profile Doxing
description: Every enrichment signal (X handle, display name, followers, prior tokens, ATH, KYC root, sister wallets, TG/Discord/website, co-mints) must be persisted and cross-linked to build the Dev's internal doxing dossier — used for Developer Reputation, dual-identity detection, social graph, and future activity detection.
type: feature
---

The Developer Profile is HoldersIntel's internal doxing record of a dev wallet → real person/online presence. Every alert, scan, or enrichment must FEED this profile, never discard signals.

## Core principle
Treat every observed signal as a permanent breadcrumb. Persist and cross-link:
- Wallet identities: dev_wallet, sister_wallets, kyc_root, funding chain
- Online identities: X handle + numeric user_id (handle rotation!), display_name history, followers_count over time, TG, Discord, website domains
- Token history: every mint, $ticker, name, ATH mcap + date, launchpad, death cause
- Social graph: who they reply to / are replied to by, co-mint clusters, mesh family
- Behavioral fingerprint: timing patterns, buy/sell template, fee wallets

## Rules
- NEVER throw away enrichment data after using it for a single alert. Write it back to `x_account_registry`, `proven_dev_tokens`, `dev_wallet_reputation`, `creator_profiles`, `token_social_links`.
- Treat handle rotation (same x_user_id, new @handle) and dual identities (different handles, same wallet/KYC/funding) as first-class signals — preserve history arrays.
- Followers count is time-series valuable — keep `followers_fetched_at` and accept multiple historical samples when possible.
- Cross-link aggressively: any new signal should trigger fuseCreator() so the Creator Profile absorbs it.
- Display surfaces (DMs, alerts, UI) should pull from the dossier, not re-derive — and should expose the cross-links (prior tickers, ATH dates, alt handles, KYC root) so the dev's history is visible at a glance.