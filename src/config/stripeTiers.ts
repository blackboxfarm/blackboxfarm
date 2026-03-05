// Stripe product & price IDs mapped to Holders Intel tiers
export const STRIPE_TIERS = {
  pro: {
    product_id: "prod_U5rCqUTB2ivf09",
    price_id: "price_1T7fTdEgTpjD9EqdBPwhB0z6",
    x_sub_product_id: "prod_U5rC0vzkGA6sfq",
    x_sub_price_id: "price_1T7fTmEgTpjD9EqdV03AUNjP",
  },
  dev: {
    product_id: "prod_U5rCvewEcZZetf",
    price_id: "price_1T7fTnEgTpjD9EqdCKDoYuUp",
    x_sub_product_id: "prod_U5rCsGpO4RKofP",
    x_sub_price_id: "price_1T7fToEgTpjD9EqdmGgMpxEU",
  },
  enterprise: {
    product_id: "prod_U5rCyXbfyw6nd6",
    price_id: "price_1T7fTpEgTpjD9EqdcgwJXMEG",
    x_sub_product_id: "prod_U5rC0NjxwWKDTV",
    x_sub_price_id: "price_1T7fTqEgTpjD9EqdihEwuyYj",
  },
} as const;

// Map Stripe product IDs back to tier keys
export function getTierKeyFromProductId(productId: string): string | null {
  for (const [tierKey, config] of Object.entries(STRIPE_TIERS)) {
    if (config.product_id === productId || config.x_sub_product_id === productId) {
      return tierKey;
    }
  }
  return null;
}
