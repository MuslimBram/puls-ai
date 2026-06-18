
-- Partner commission first-payment-only enforcement
ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS is_first_payment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_invoice_id text;

-- Backfill: mark earliest commission per (partner, workspace) as the first payment;
-- mark every subsequent (renewal) commission as cancelled so it stops affecting payouts.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY partner_id, workspace_id ORDER BY created_at ASC) AS rn
  FROM public.partner_commissions
)
UPDATE public.partner_commissions pc
SET is_first_payment = (r.rn = 1),
    commission_status = CASE
      WHEN r.rn = 1 THEN pc.commission_status
      ELSE 'cancelled'
    END
FROM ranked r
WHERE r.id = pc.id;

-- Enforce at most one first-payment commission per referred workspace, ever.
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_first_payment_unique
  ON public.partner_commissions (partner_id, workspace_id)
  WHERE is_first_payment = true;

-- Helpful lookup index for invoice idempotency.
CREATE INDEX IF NOT EXISTS partner_commissions_source_invoice_idx
  ON public.partner_commissions (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;
