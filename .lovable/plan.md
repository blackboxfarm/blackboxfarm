Root cause found: Telegram is reaching `profile-subscription-bot-webhook?profile=no_lube`, but every recent update is returning `401 Unauthorized`. That means the bot webhook URL is correct, but the `X-Telegram-Bot-Api-Secret-Token` Telegram sends does not match what the webhook expects.

The mismatch is in code:
- `profile-subscription-bot-webhook` expects secret = base64url SHA-256 of `subscription-webhook:` + bot token.
- `profile-subscription-admin` registers Telegram with secret = hex SHA-256 of `profile-sub-webhook:` + bot token.

So setup says “bot is live”, Telegram delivers `/start`, but the webhook rejects the request before it can reply.

Plan:
1. Make both functions use one shared webhook-secret formula.
   - Use the formula the live webhook already expects: `subscription-webhook:` + bot token, base64url SHA-256.
   - Update `profile-subscription-admin` registration to generate the same value.

2. Add targeted diagnostic logging for future failures.
   - If a request is rejected, log that it was a secret mismatch without printing the token or secret.
   - This makes future Telegram failures obvious in logs.

3. Redeploy the affected Edge Functions.
   - Deploy `profile-subscription-admin`.
   - Deploy `profile-subscription-bot-webhook` if touched for logging.

4. Re-register the webhook using the corrected secret.
   - Use the existing admin action or direct function call to set Telegram’s webhook secret again.
   - Confirm `getWebhookInfo` points to `profile-subscription-bot-webhook?profile=no_lube`.

5. Verify with logs.
   - Check that new Telegram updates return `200`, not `401`.
   - The bot should then answer `/start` and public join events again.