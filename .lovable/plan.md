## Root cause

`no-lube-compose` reads templates from `holders_intel_templates` by `template_name`. The admin "Snapshot Post" tab shows `no_lube_snapshot_private` (default text from `src/lib/share-template.ts`), but **that row was never saved into the DB**. Confirmed query:

```
holders_intel_templates → only: no_lube, no_lube_public, no_lube_private
```

So compose looks up `no_lube_snapshot_private` → miss → falls back to `no_lube_private` → renders the Big Picture layout but still stamps `post_kind = 'snapshot'` in `no_lube_post_log`. That's why every "snapshot" in Private looks identical to Big Picture.

## Fix ("switch them" = make snapshot actually use the snapshot template)

One DB write — seed the missing template row using the default body already defined in `src/lib/share-template.ts` line 414.

```sql
INSERT INTO holders_intel_templates (template_name, template_text)
VALUES ('no_lube_snapshot_private', $$⚡ *${ticker} Quick Stats*

👥 Holders: *{totalHolders}*
❤️ Health: *{healthScore}/100*
🏦 Top 10%: *{top10}*

📈 *Wallet Distribution*
{walletDistBlock}

🚨 *Intel Alerts*
{intelAlert1}

💰 *Market*
MC: *{mc}* ({mcChange})  VOL: *{vol24h}*
Entry: *{mcEntry}*  Age: *{age}*

🔗 [Full Report]({intelUrl}) | [BubbleMap]({bubbleMapUrl})

CA: `{ca}`$$)
ON CONFLICT (template_name) DO NOTHING;
```

No code changes. After this migration runs, the next snapshot fired by `no-lube-orchestrate` will render the actual Quick Stats body instead of the Big Picture body.

## Verification

- Re-query `holders_intel_templates` and confirm the new row exists.
- Trigger one snapshot via orchestrate `force=true` on a fresh mint and confirm the Private channel post matches the Snapshot template (Quick Stats / Holders / Health / Top 10% / Wallet Distribution / Intel Alerts), not the Big Picture layout.

Awaiting **Plan Approved**.