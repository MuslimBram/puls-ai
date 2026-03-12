import { PlanKey } from "./plans";

export interface StripeTier {
  price_id: string;
  product_id: string;
  plan_key: PlanKey;
}

export const STRIPE_TIERS: Record<Exclude<PlanKey, "standard">, StripeTier> = {
  professional: {
    price_id: "price_1TA59pFID0obr3HVpqCTF69N",
    product_id: "prod_U8Lr5611OwyJSV",
    plan_key: "professional",
  },
  advanced: {
    price_id: "price_1TA5ADFID0obr3HVCrKzRfkM",
    product_id: "prod_U8LrRodC8eZsTT",
    plan_key: "advanced",
  },
  enterprise: {
    price_id: "price_1TA5AdFID0obr3HVzGSxMKWC",
    product_id: "prod_U8LsXPlxbqhpmK",
    plan_key: "enterprise",
  },
};

// Reverse lookup: product_id → plan_key
export const productToPlan: Record<string, PlanKey> = Object.fromEntries(
  Object.values(STRIPE_TIERS).map((t) => [t.product_id, t.plan_key])
);
// Standard is the free/default tier (no Stripe product)
