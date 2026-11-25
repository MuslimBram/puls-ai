-- ── 1. backup ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pricing_feature_entitlements_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_settings_id uuid NOT NULL,
  plan_key text NOT NULL,
  feature_entitlements jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_reason text NOT NULL
);

ALTER TABLE public.pricing_feature_entitlements_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read feature entitlement backups" ON public.pricing_feature_entitlements_backup;
CREATE POLICY "Admins can read feature entitlement backups"
  ON public.pricing_feature_entitlements_backup
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- No INSERT/UPDATE/DELETE policy: rows are written by migrations running as the
-- table owner, never by an application role.

INSERT INTO public.pricing_feature_entitlements_backup (pricing_settings_id, plan_key, feature_entitlements, captured_reason)
SELECT id, plan_key, feature_entitlements, 'faza1c_pre_canonical_rewrite'
FROM public.pricing_settings;

-- ── 2. canonical rewrite ────────────────────────────────────────────────────

UPDATE public.pricing_settings SET feature_entitlements = '{"advancedAnalytics":true,"advancedPermissions":true,"advancedSecurity":true,"aiContentEnhancement":true,"apiAccess":false,"approvalWorkflow":false,"automationRuleBuilder":true,"automationWorkflows":true,"basicAnalytics":true,"basicPublishing":true,"biIntegrations":false,"bulkScheduling":false,"campaignTagging":false,"caseRouting":false,"chatbotAutomation":false,"competitorReports":true,"coreIntegrations":true,"crmIntegrations":false,"customBrandingReports":false,"customOnboarding":false,"dedicatedSuccessManager":false,"ecommerceIntegrations":false,"engagementReporting":false,"fullReporting":false,"instagramGridPlanning":false,"ipWhitelisting":false,"keywordMonitoring":true,"mediaGeneration":false,"messageTagging":false,"prioritySupport":false,"savedReplies":true,"scheduledReportsDelivery":false,"sentimentClassification":false,"slaSupport":false,"teamProductivityReports":false,"unifiedInbox":true,"whiteLabel":false}'::jsonb
WHERE plan_key = 'standard' AND is_donation = false;

UPDATE public.pricing_settings SET feature_entitlements = '{"advancedAnalytics":true,"advancedPermissions":true,"advancedSecurity":true,"aiContentEnhancement":true,"apiAccess":false,"approvalWorkflow":false,"automationRuleBuilder":true,"automationWorkflows":true,"basicAnalytics":true,"basicPublishing":true,"biIntegrations":false,"bulkScheduling":false,"campaignTagging":false,"caseRouting":false,"chatbotAutomation":false,"competitorReports":true,"coreIntegrations":true,"crmIntegrations":false,"customBrandingReports":false,"customOnboarding":false,"dedicatedSuccessManager":false,"ecommerceIntegrations":false,"engagementReporting":false,"fullReporting":false,"instagramGridPlanning":false,"ipWhitelisting":false,"keywordMonitoring":true,"mediaGeneration":false,"messageTagging":false,"prioritySupport":false,"savedReplies":true,"scheduledReportsDelivery":false,"sentimentClassification":false,"slaSupport":false,"teamProductivityReports":false,"unifiedInbox":true,"whiteLabel":false}'::jsonb
WHERE plan_key = 'professional' AND is_donation = false;

UPDATE public.pricing_settings SET feature_entitlements = '{"advancedAnalytics":true,"advancedPermissions":true,"advancedSecurity":true,"aiContentEnhancement":true,"apiAccess":true,"approvalWorkflow":false,"automationRuleBuilder":true,"automationWorkflows":true,"basicAnalytics":true,"basicPublishing":true,"biIntegrations":false,"bulkScheduling":false,"campaignTagging":false,"caseRouting":false,"chatbotAutomation":false,"competitorReports":true,"coreIntegrations":true,"crmIntegrations":false,"customBrandingReports":false,"customOnboarding":false,"dedicatedSuccessManager":false,"ecommerceIntegrations":false,"engagementReporting":false,"fullReporting":false,"instagramGridPlanning":false,"ipWhitelisting":false,"keywordMonitoring":true,"mediaGeneration":false,"messageTagging":false,"prioritySupport":false,"savedReplies":true,"scheduledReportsDelivery":false,"sentimentClassification":false,"slaSupport":false,"teamProductivityReports":false,"unifiedInbox":true,"whiteLabel":false}'::jsonb
WHERE plan_key = 'advanced' AND is_donation = false;

UPDATE public.pricing_settings SET feature_entitlements = '{"advancedAnalytics":true,"advancedPermissions":true,"advancedSecurity":true,"aiContentEnhancement":true,"apiAccess":true,"approvalWorkflow":false,"automationRuleBuilder":true,"automationWorkflows":true,"basicAnalytics":true,"basicPublishing":true,"biIntegrations":false,"bulkScheduling":false,"campaignTagging":false,"caseRouting":false,"chatbotAutomation":false,"competitorReports":true,"coreIntegrations":true,"crmIntegrations":false,"customBrandingReports":false,"customOnboarding":false,"dedicatedSuccessManager":false,"ecommerceIntegrations":false,"engagementReporting":false,"fullReporting":false,"instagramGridPlanning":false,"ipWhitelisting":false,"keywordMonitoring":true,"mediaGeneration":false,"messageTagging":false,"prioritySupport":false,"savedReplies":true,"scheduledReportsDelivery":false,"sentimentClassification":false,"slaSupport":false,"teamProductivityReports":false,"unifiedInbox":true,"whiteLabel":false}'::jsonb
WHERE plan_key = 'enterprise' AND is_donation = false;

-- Donation rows keep {} — they are not a plan and carry no entitlements.

-- ── 3. vocabulary guard ─────────────────────────────────────────────────────
--
-- Plain SECURITY INVOKER: this function reads nothing the caller cannot already
-- read and needs no elevated rights, so it does not become another
-- SECURITY DEFINER surface. search_path is pinned regardless.

CREATE OR REPLACE FUNCTION public.validate_feature_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical_keys CONSTANT text[] := ARRAY[
    'advancedAnalytics',
    'advancedPermissions',
    'advancedSecurity',
    'aiContentEnhancement',
    'apiAccess',
    'approvalWorkflow',
    'automationRuleBuilder',
    'automationWorkflows',
    'basicAnalytics',
    'basicPublishing',
    'biIntegrations',
    'bulkScheduling',
    'campaignTagging',
    'caseRouting',
    'chatbotAutomation',
    'competitorReports',
    'coreIntegrations',
    'crmIntegrations',
    'customBrandingReports',
    'customOnboarding',
    'dedicatedSuccessManager',
    'ecommerceIntegrations',
    'engagementReporting',
    'fullReporting',
    'instagramGridPlanning',
    'ipWhitelisting',
    'keywordMonitoring',
    'mediaGeneration',
    'messageTagging',
    'prioritySupport',
    'savedReplies',
    'scheduledReportsDelivery',
    'sentimentClassification',
    'slaSupport',
    'teamProductivityReports',
    'unifiedInbox',
    'whiteLabel'
  ];
  offending_key text;
  offending_value jsonb;
BEGIN
  IF NEW.feature_entitlements IS NULL THEN
    RAISE EXCEPTION 'feature_entitlements must not be null (plan %)', NEW.plan_key;
  END IF;

  IF jsonb_typeof(NEW.feature_entitlements) <> 'object' THEN
    RAISE EXCEPTION 'feature_entitlements must be a JSON object (plan %), got %', NEW.plan_key, jsonb_typeof(NEW.feature_entitlements);
  END IF;

  -- Donation rows legitimately carry {}.
  IF NEW.is_donation THEN
    RETURN NEW;
  END IF;

  SELECT key INTO offending_key
  FROM jsonb_object_keys(NEW.feature_entitlements) AS key
  WHERE key <> ALL (canonical_keys)
  LIMIT 1;

  IF offending_key IS NOT NULL THEN
    RAISE EXCEPTION
      'feature_entitlements key "%" is not in the canonical feature registry (plan %). Add it to supabase/functions/_shared/feature-registry.ts first.',
      offending_key, NEW.plan_key;
  END IF;

  SELECT value INTO offending_value
  FROM jsonb_each(NEW.feature_entitlements)
  WHERE jsonb_typeof(value) <> 'boolean'
  LIMIT 1;

  IF offending_value IS NOT NULL THEN
    RAISE EXCEPTION
      'feature_entitlements values must be booleans (plan %), found %',
      NEW.plan_key, jsonb_typeof(offending_value);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_feature_entitlements ON public.pricing_settings;
CREATE TRIGGER trg_validate_feature_entitlements
  BEFORE INSERT OR UPDATE OF feature_entitlements ON public.pricing_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_feature_entitlements();;
