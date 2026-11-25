-- Re-runnable: drop only what this seed owns, by its deterministic ids.
DELETE FROM public.pricing_feature_rows WHERE section_id IN (
  '297079e6-2387-5204-a8fa-9dcc0d3ec51d'::uuid,
  '93100791-23bf-57a3-b080-38939ec9f558'::uuid,
  '59d15cce-57ae-59e6-957b-8cd418f82c30'::uuid,
  'eaa4ccfa-7b60-5c3a-8103-e20c5155fc20'::uuid,
  '350b89dd-f45e-5398-8d42-f2d3b1c2ada5'::uuid,
  '06ab40af-af18-59c7-b07f-0023b4a95230'::uuid
);
DELETE FROM public.pricing_feature_sections WHERE id IN (
  '297079e6-2387-5204-a8fa-9dcc0d3ec51d'::uuid,
  '93100791-23bf-57a3-b080-38939ec9f558'::uuid,
  '59d15cce-57ae-59e6-957b-8cd418f82c30'::uuid,
  'eaa4ccfa-7b60-5c3a-8103-e20c5155fc20'::uuid,
  '350b89dd-f45e-5398-8d42-f2d3b1c2ada5'::uuid,
  '06ab40af-af18-59c7-b07f-0023b4a95230'::uuid
);

INSERT INTO public.pricing_feature_sections (id, title, description, sort_order, default_expanded, is_active) VALUES
  ('297079e6-2387-5204-a8fa-9dcc0d3ec51d'::uuid, 'Publishing & content', NULL, 1, true, true),
  ('93100791-23bf-57a3-b080-38939ec9f558'::uuid, 'Inbox & conversations', NULL, 2, true, true),
  ('59d15cce-57ae-59e6-957b-8cd418f82c30'::uuid, 'Automation', NULL, 3, false, true),
  ('eaa4ccfa-7b60-5c3a-8103-e20c5155fc20'::uuid, 'Analytics & reporting', NULL, 4, false, true),
  ('350b89dd-f45e-5398-8d42-f2d3b1c2ada5'::uuid, 'Integrations & API', NULL, 5, false, true),
  ('06ab40af-af18-59c7-b07f-0023b4a95230'::uuid, 'Security & governance', NULL, 6, false, true);

INSERT INTO public.pricing_feature_rows
  (id, section_id, feature_key, feature_name, feature_tooltip, sort_order, is_highlight,
   standard_value, professional_value, advanced_value, enterprise_value) VALUES
  ('c6b84c6f-ce80-50bd-8dd9-90e1a06bbf3b'::uuid, '297079e6-2387-5204-a8fa-9dcc0d3ec51d'::uuid, 'basicPublishing', 'Content publishing', NULL, 1, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('0f5f3661-cd2e-57de-87c0-9bb03ca231e1'::uuid, '297079e6-2387-5204-a8fa-9dcc0d3ec51d'::uuid, 'aiContentEnhancement', 'AI content generation', NULL, 2, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('f7d19873-7868-5468-9bd9-b0e94be30ef9'::uuid, '93100791-23bf-57a3-b080-38939ec9f558'::uuid, 'unifiedInbox', 'Unified inbox', NULL, 1, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('db1c24ad-f5ce-5834-a6fb-b690ef56a5b4'::uuid, '93100791-23bf-57a3-b080-38939ec9f558'::uuid, 'savedReplies', 'Saved replies', NULL, 2, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('8419b871-e405-5827-99bd-d846a7cf5fee'::uuid, '59d15cce-57ae-59e6-957b-8cd418f82c30'::uuid, 'automationWorkflows', 'Automation workflows', NULL, 1, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('0726f6b4-4bf0-5593-be1f-2a35b06d7888'::uuid, '59d15cce-57ae-59e6-957b-8cd418f82c30'::uuid, 'automationRuleBuilder', 'Automation rule builder', NULL, 2, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('23804529-d37b-5ff5-8640-d81cabc1ff1c'::uuid, 'eaa4ccfa-7b60-5c3a-8103-e20c5155fc20'::uuid, 'basicAnalytics', 'Analytics', NULL, 1, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('aa56bbf8-4533-58f7-b4f2-c885c8d676cc'::uuid, 'eaa4ccfa-7b60-5c3a-8103-e20c5155fc20'::uuid, 'advancedAnalytics', 'Deep analytics', NULL, 2, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('4eff2cc5-0300-5518-9ec8-1f38ed742314'::uuid, 'eaa4ccfa-7b60-5c3a-8103-e20c5155fc20'::uuid, 'competitorReports', 'Competitor reports', NULL, 3, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('98718853-b8a1-5345-879e-b8f5ac80cb8d'::uuid, '350b89dd-f45e-5398-8d42-f2d3b1c2ada5'::uuid, 'coreIntegrations', 'Core channel integrations', NULL, 1, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('fc386794-e74a-5711-93de-67e5f29e5ed4'::uuid, '350b89dd-f45e-5398-8d42-f2d3b1c2ada5'::uuid, 'keywordMonitoring', 'Keyword monitoring', NULL, 2, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('4278d6ce-8f2c-5e48-bde9-a427d702f8c5'::uuid, '350b89dd-f45e-5398-8d42-f2d3b1c2ada5'::uuid, 'apiAccess', 'Public API access', NULL, 3, true, 'false'::jsonb, 'false'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('35a67d0e-c5ba-51fe-9ca3-9a0d05ed963a'::uuid, '06ab40af-af18-59c7-b07f-0023b4a95230'::uuid, 'advancedPermissions', 'Roles & permissions', NULL, 1, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb),
  ('04ca3f3b-9260-5bdd-b686-f0419aa7dc3d'::uuid, '06ab40af-af18-59c7-b07f-0023b4a95230'::uuid, 'advancedSecurity', 'Advanced security', NULL, 2, false, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb, 'true'::jsonb);;
