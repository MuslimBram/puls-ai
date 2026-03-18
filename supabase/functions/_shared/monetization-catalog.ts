export interface PricingCatalogRow {
  plan_key: string;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  monthly_price: number | null;
  annual_price: number | null;
  is_donation: boolean | null;
  is_public: boolean | null;
  plan_label: string | null;
}

export const loadPricingCatalogRows = async (supabaseClient: any): Promise<PricingCatalogRow[]> => {
  const { data, error } = await supabaseClient
    .from("pricing_settings")
    .select("plan_key, stripe_price_id, stripe_product_id, monthly_price, annual_price, is_donation, is_public, plan_label")
    .eq("is_donation", false);

  if (error) throw error;
  return (data ?? []) as PricingCatalogRow[];
};

export const indexPricingCatalogByPlanKey = (rows: PricingCatalogRow[]) =>
  Object.fromEntries(rows.map((row) => [row.plan_key, row])) as Record<string, PricingCatalogRow>;

export const indexPricingCatalogByProductId = (rows: PricingCatalogRow[]) =>
  Object.fromEntries(
    rows
      .filter((row) => Boolean(row.stripe_product_id))
      .map((row) => [row.stripe_product_id as string, row.plan_key]),
  ) as Record<string, string>;

export const indexPlanPrices = (rows: PricingCatalogRow[]) =>
  Object.fromEntries(rows.map((row) => [row.plan_key, Number(row.monthly_price ?? 0)])) as Record<string, number>;
