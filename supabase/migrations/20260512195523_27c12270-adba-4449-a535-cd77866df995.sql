INSERT INTO public.token_lifecycle (token_mint, creator_wallet, current_status, discovery_source, first_seen_at, last_seen_at)
VALUES
('9NTQNK7X5MZJNmY2prtu4HzS1Uuf81GzPAJxLUGwpump','EiARpY3ySYhBUxhVpDENLDobn56azHPEZeP6ExdNk4TQ','dead','autopsy_backfill', now(), now()),
('4BQxyLWiTrJuxX7vKN7BtDCLbYDBM69pVBBCe5oGpump','J9wumDebS5eHqi4KWfvbswNUJ6FxoyAwafcRt32Gjsyz','dead','autopsy_backfill', now(), now()),
('FgDyEoQ4mGg6isbm3yZadND1pJGNA6g3otcurWsEpump','8rHcMftEnX1uJ9hhuLJPyrcpoqd3jcoNdx7ZTBmZWWnJ','dead','autopsy_backfill', now(), now())
ON CONFLICT (token_mint) DO UPDATE SET creator_wallet = EXCLUDED.creator_wallet;