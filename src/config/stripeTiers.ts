// Stripe product & price IDs mapped to Holders Intel tiers
export const STRIPE_TIERS = {
  pro: {
    product_id: "prod_U5rCqUTB2ivf09",
    price_id: "price_1T7fTdEgTpjD9EqdBPwhB0z6",
    // X Subscriber monthly ($4.00/mo)
    x_sub_product_id: "prod_U8qZhEROQW6Iiu",
    x_sub_price_id: "price_1TAYs8AN7Hc49ZZr3FSNTGl1",
    // X Subscriber yearly ($38.99/yr — save 19%)
    x_sub_yearly_product_id: "prod_U8qZ9TNN4LLryZ",
    x_sub_yearly_price_id: "price_1TAYs9AN7Hc49ZZrXRklssPV",
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
    // Check yearly product ID if it exists
    if ('x_sub_yearly_product_id' in config && config.x_sub_yearly_product_id === productId) {
      return tierKey;
    }
  }
  return null;
}
