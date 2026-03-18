ALTER TABLE public.pricing_settings
ADD COLUMN IF NOT EXISTS social_profiles_limit integer,
ADD COLUMN IF NOT EXISTS channels_limit integer,
ADD COLUMN IF NOT EXISTS keywords_limit integer,
ADD COLUMN IF NOT EXISTS keywords_per_group_limit integer,
ADD COLUMN IF NOT EXISTS ai_replies_per_day_limit integer,
ADD COLUMN IF NOT EXISTS team_members_limit integer,
ADD COLUMN IF NOT EXISTS conversation_history_days integer,
ADD COLUMN IF NOT EXISTS leads_per_month_limit integer,
ADD COLUMN IF NOT EXISTS automation_rules_limit integer,
ADD COLUMN IF NOT EXISTS feature_entitlements jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.pricing_settings
SET social_profiles_limit = CASE plan_key
    WHEN 'standard' THEN 5
    WHEN 'professional' THEN -1
    WHEN 'advanced' THEN -1
    WHEN 'enterprise' THEN -1
    ELSE social_profiles_limit
  END,
  channels_limit = CASE plan_key
    WHEN 'standard' THEN 3
    WHEN 'professional' THEN 15
    WHEN 'advanced' THEN 50
    WHEN 'enterprise' THEN -1
    ELSE channels_limit
  END,
  keywords_limit = CASE plan_key
    WHEN 'standard' THEN 10
    WHEN 'professional' THEN 50
    WHEN 'advanced' THEN 100
    WHEN 'enterprise' THEN -1
    ELSE keywords_limit
  END,
  keywords_per_group_limit = CASE plan_key
    WHEN 'standard' THEN 10
    WHEN 'professional' THEN 10
    WHEN 'advanced' THEN 20
    WHEN 'enterprise' THEN -1
    ELSE keywords_per_group_limit
  END,
  ai_replies_per_day_limit = CASE plan_key
    WHEN 'standard' THEN 20
    WHEN 'professional' THEN 100
    WHEN 'advanced' THEN 500
    WHEN 'enterprise' THEN -1
    ELSE ai_replies_per_day_limit
  END,
  team_members_limit = CASE plan_key
    WHEN 'standard' THEN 1
    WHEN 'professional' THEN 5
    WHEN 'advanced' THEN 20
    WHEN 'enterprise' THEN -1
    ELSE team_members_limit
  END,
  conversation_history_days = CASE plan_key
    WHEN 'standard' THEN 90
    WHEN 'professional' THEN 365
    WHEN 'advanced' THEN 730
    WHEN 'enterprise' THEN -1
    ELSE conversation_history_days
  END,
  leads_per_month_limit = CASE plan_key
    WHEN 'standard' THEN 100
    WHEN 'professional' THEN 500
    WHEN 'advanced' THEN 2000
    WHEN 'enterprise' THEN -1
    ELSE leads_per_month_limit
  END,
  automation_rules_limit = CASE plan_key
    WHEN 'standard' THEN 0
    WHEN 'professional' THEN 0
    WHEN 'advanced' THEN 50
    WHEN 'enterprise' THEN -1
    ELSE automation_rules_limit
  END,
  feature_entitlements = CASE plan_key
    WHEN 'standard' THEN '{"bulkScheduling":false,"instagramGridPlanning":false,"aiContentEnhancement":false,"campaignTagging":false,"approvalWorkflow":false,"messageTagging":false,"engagementReporting":false,"competitorReports":false,"customBrandingReports":false,"ecommerceIntegrations":false,"advancedPermissions":false,"automationWorkflows":false,"chatbotAutomation":false,"sentimentClassification":false,"caseRouting":false,"teamProductivityReports":false,"automationRuleBuilder":false,"biIntegrations":false,"scheduledReportsDelivery":false,"crmIntegrations":false,"apiAccess":false,"advancedSecurity":false,"ipWhitelisting":false,"customOnboarding":false,"slaSupport":false,"dedicatedSuccessManager":false,"whiteLabel":false,"savedReplies":false,"basicAnalytics":true,"advancedAnalytics":false,"fullReporting":false,"prioritySupport":false,"unifiedInbox":true,"keywordMonitoring":true,"basicPublishing":true,"coreIntegrations":true,"mediaGeneration":false}'::jsonb
    WHEN 'professional' THEN '{"bulkScheduling":true,"instagramGridPlanning":true,"aiContentEnhancement":true,"campaignTagging":true,"approvalWorkflow":true,"messageTagging":true,"engagementReporting":true,"competitorReports":true,"customBrandingReports":true,"ecommerceIntegrations":true,"advancedPermissions":true,"automationWorkflows":false,"chatbotAutomation":false,"sentimentClassification":false,"caseRouting":false,"teamProductivityReports":false,"automationRuleBuilder":false,"biIntegrations":false,"scheduledReportsDelivery":false,"crmIntegrations":false,"apiAccess":false,"advancedSecurity":false,"ipWhitelisting":false,"customOnboarding":false,"slaSupport":false,"dedicatedSuccessManager":false,"whiteLabel":false,"savedReplies":true,"basicAnalytics":true,"advancedAnalytics":true,"fullReporting":false,"prioritySupport":false,"unifiedInbox":true,"keywordMonitoring":true,"basicPublishing":true,"coreIntegrations":true,"mediaGeneration":true}'::jsonb
    WHEN 'advanced' THEN '{"bulkScheduling":true,"instagramGridPlanning":true,"aiContentEnhancement":true,"campaignTagging":true,"approvalWorkflow":true,"messageTagging":true,"engagementReporting":true,"competitorReports":true,"customBrandingReports":true,"ecommerceIntegrations":true,"advancedPermissions":true,"automationWorkflows":true,"chatbotAutomation":true,"sentimentClassification":true,"caseRouting":true,"teamProductivityReports":true,"automationRuleBuilder":true,"biIntegrations":true,"scheduledReportsDelivery":true,"crmIntegrations":true,"apiAccess":false,"advancedSecurity":false,"ipWhitelisting":false,"customOnboarding":false,"slaSupport":false,"dedicatedSuccessManager":false,"whiteLabel":false,"savedReplies":true,"basicAnalytics":true,"advancedAnalytics":true,"fullReporting":false,"prioritySupport":false,"unifiedInbox":true,"keywordMonitoring":true,"basicPublishing":true,"coreIntegrations":true,"mediaGeneration":true}'::jsonb
    WHEN 'enterprise' THEN '{"bulkScheduling":true,"instagramGridPlanning":true,"aiContentEnhancement":true,"campaignTagging":true,"approvalWorkflow":true,"messageTagging":true,"engagementReporting":true,"competitorReports":true,"customBrandingReports":true,"ecommerceIntegrations":true,"advancedPermissions":true,"automationWorkflows":true,"chatbotAutomation":true,"sentimentClassification":true,"caseRouting":true,"teamProductivityReports":true,"automationRuleBuilder":true,"biIntegrations":true,"scheduledReportsDelivery":true,"crmIntegrations":true,"apiAccess":true,"advancedSecurity":true,"ipWhitelisting":true,"customOnboarding":true,"slaSupport":true,"dedicatedSuccessManager":true,"whiteLabel":true,"savedReplies":true,"basicAnalytics":true,"advancedAnalytics":true,"fullReporting":true,"prioritySupport":true,"unifiedInbox":true,"keywordMonitoring":true,"basicPublishing":true,"coreIntegrations":true,"mediaGeneration":true}'::jsonb
    ELSE feature_entitlements
  END,
  updated_at = now()
WHERE is_donation = false;