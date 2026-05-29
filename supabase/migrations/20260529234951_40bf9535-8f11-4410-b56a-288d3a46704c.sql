UPDATE public.holders_intel_seen_tokens
SET image_uri = 'https://edge.uxento.io/image/THKxWvbZrdnsZUw7ihDxiPxoCWzRCBm4YQYyH7ppump'
WHERE token_mint = 'oqU4DdYCbdSf9j74vnEgvCn1YzNfYQEPWaC6pu6pump'
  AND (image_uri IS NULL OR image_uri = '');