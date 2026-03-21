INSERT INTO pricing_settings (
  plan_key, plan_name, plan_label, plan_description, monthly_price, annual_price,
  is_donation, is_public, highlight_plan, sort_order, cta_label, badge_label,
  social_profiles_limit, channels_limit, keywords_limit, keywords_per_group_limit,
  ai_replies_per_day_limit, team_members_limit, conversation_history_days,
  leads_per_month_limit, automation_rules_limit, daily_image_limit, daily_video_limit,
  max_video_seconds,
  feature_entitlements
) VALUES
(
  'standard', 'Start', 'Start', 'Gjithçka që të duhet për të nisur biznesin tënd online.',
  29, 228, false, true, false, 1, 'Fillo tani', null,
  3, 3, 10, 5, 20, 1, 30, 100, 3, 10, 2, 30,
  '{"basicPublishing":true,"basicAnalytics":true,"unifiedInbox":true,"keywordMonitoring":true,"coreIntegrations":true,"savedReplies":true,"mediaGeneration":true,"bulkScheduling":false,"instagramGridPlanning":false,"aiContentEnhancement":false,"campaignTagging":false,"approvalWorkflow":false,"messageTagging":false,"engagementReporting":false,"competitorReports":false,"customBrandingReports":false,"ecommerceIntegrations":false,"advancedPermissions":false,"automationWorkflows":false,"chatbotAutomation":false,"sentimentClassification":false,"caseRouting":false,"teamProductivityReports":false,"automationRuleBuilder":false,"biIntegrations":false,"scheduledReportsDelivery":false,"crmIntegrations":false,"apiAccess":false,"advancedSecurity":false,"ipWhitelisting":false,"customOnboarding":false,"slaSupport":false,"dedicatedSuccessManager":false,"whiteLabel":false,"advancedAnalytics":false,"fullReporting":false,"prioritySupport":false}'::jsonb
),
(
  'professional', 'Growth', 'Growth', 'Rritje e shpejtë me mjete profesionale marketingu.',
  79, 624, false, true, true, 2, 'Zgjidh Growth', 'Rekomanduar',
  10, 10, 50, 15, 100, 5, 90, 500, 10, 50, 10, 60,
  '{"basicPublishing":true,"basicAnalytics":true,"unifiedInbox":true,"keywordMonitoring":true,"coreIntegrations":true,"savedReplies":true,"mediaGeneration":true,"bulkScheduling":true,"instagramGridPlanning":true,"aiContentEnhancement":true,"campaignTagging":true,"approvalWorkflow":false,"messageTagging":true,"engagementReporting":true,"competitorReports":true,"customBrandingReports":false,"ecommerceIntegrations":true,"advancedPermissions":false,"automationWorkflows":true,"chatbotAutomation":true,"sentimentClassification":true,"caseRouting":false,"teamProductivityReports":false,"automationRuleBuilder":true,"biIntegrations":false,"scheduledReportsDelivery":false,"crmIntegrations":true,"apiAccess":false,"advancedSecurity":false,"ipWhitelisting":false,"customOnboarding":false,"slaSupport":false,"dedicatedSuccessManager":false,"whiteLabel":false,"advancedAnalytics":true,"fullReporting":false,"prioritySupport":false}'::jsonb
),
(
  'advanced', 'Pro', 'Pro', 'Kontrolli i plotë me analitika të avancuara dhe automatizim.',
  149, 1176, false, true, false, 3, 'Zgjidh Pro', null,
  25, 25, 200, 50, 500, 15, 365, 2000, 50, 200, 30, 120,
  '{"basicPublishing":true,"basicAnalytics":true,"unifiedInbox":true,"keywordMonitoring":true,"coreIntegrations":true,"savedReplies":true,"mediaGeneration":true,"bulkScheduling":true,"instagramGridPlanning":true,"aiContentEnhancement":true,"campaignTagging":true,"approvalWorkflow":true,"messageTagging":true,"engagementReporting":true,"competitorReports":true,"customBrandingReports":true,"ecommerceIntegrations":true,"advancedPermissions":true,"automationWorkflows":true,"chatbotAutomation":true,"sentimentClassification":true,"caseRouting":true,"teamProductivityReports":true,"automationRuleBuilder":true,"biIntegrations":true,"scheduledReportsDelivery":true,"crmIntegrations":true,"apiAccess":true,"advancedSecurity":true,"ipWhitelisting":false,"customOnboarding":false,"slaSupport":false,"dedicatedSuccessManager":false,"whiteLabel":false,"advancedAnalytics":true,"fullReporting":true,"prioritySupport":true}'::jsonb
),
(
  'enterprise', 'Enterprise', 'Enterprise', 'Zgjidhje e personalizuar për ekipe të mëdha.',
  399, 3120, false, true, false, 4, 'Na kontakto', null,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  '{"basicPublishing":true,"basicAnalytics":true,"unifiedInbox":true,"keywordMonitoring":true,"coreIntegrations":true,"savedReplies":true,"mediaGeneration":true,"bulkScheduling":true,"instagramGridPlanning":true,"aiContentEnhancement":true,"campaignTagging":true,"approvalWorkflow":true,"messageTagging":true,"engagementReporting":true,"competitorReports":true,"customBrandingReports":true,"ecommerceIntegrations":true,"advancedPermissions":true,"automationWorkflows":true,"chatbotAutomation":true,"sentimentClassification":true,"caseRouting":true,"teamProductivityReports":true,"automationRuleBuilder":true,"biIntegrations":true,"scheduledReportsDelivery":true,"crmIntegrations":true,"apiAccess":true,"advancedSecurity":true,"ipWhitelisting":true,"customOnboarding":true,"slaSupport":true,"dedicatedSuccessManager":true,"whiteLabel":true,"advancedAnalytics":true,"fullReporting":true,"prioritySupport":true}'::jsonb
);