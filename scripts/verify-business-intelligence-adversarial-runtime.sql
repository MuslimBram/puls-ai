\set ON_ERROR_STOP on

-- PR #218 adversarial runtime verifier.
-- Preconditions:
--   1) fresh disposable DB
--   2) baseline harness applied
--   3) exact #218 migrations applied through 20260902100500

\echo 'PR218 runtime: client scan admission boundary'
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

INSERT INTO public.business_scan_history(
  id,business_id,workspace_id,triggered_by,scanned_url,status,scan_phase,
  pages_scanned,insights_count,duration_ms,error_message,summary_json,
  products_found,services_found,contact_methods,social_links,pricing_signals,
  tone_of_voice,suggested_keywords,cta_signals,competitor_hints,completed_at
) VALUES (
  'aaaaaaaa-3000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'https://a.example.com',
  'completed','done',99,99,1234,'forged',
  '{"forged":true}'::jsonb,
  '[{"title":"forged"}]'::jsonb,
  '[{"title":"forged"}]'::jsonb,
  '[{"type":"email","value":"evil@example.com"}]'::jsonb,
  '{"instagram":["https://evil.example"]}'::jsonb,
  '["forged-price"]'::jsonb,
  'forged-tone','["forged-keyword"]'::jsonb,'["forged-cta"]'::jsonb,
  '[{"name":"forged"}]'::jsonb,now()
);

INSERT INTO public.business_scan_history(
  id,business_id,workspace_id,triggered_by,scanned_url
) VALUES (
  'aaaaaaaa-3000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'https://a.example.com'
);

DO $$
BEGIN
  BEGIN
    UPDATE public.business_scan_history
    SET status='completed', summary_json='{"client_forged":true}'::jsonb
    WHERE id='aaaaaaaa-3000-4000-8000-000000000001';
    RAISE EXCEPTION 'FORGED_COMPLETION_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_knowledge_sources(
      workspace_id,business_id,source_type,provider,external_id
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000001',
      'manual','browser','forged-source'
    );
    RAISE EXCEPTION 'DIRECT_KNOWLEDGE_WRITE_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

DO $$
DECLARE r public.business_scan_history%ROWTYPE;
BEGIN
  SELECT * INTO r
  FROM public.business_scan_history
  WHERE id='aaaaaaaa-3000-4000-8000-000000000001';

  IF r.status <> 'pending'
     OR r.scan_phase <> 'queued'
     OR r.pages_scanned <> 0
     OR r.insights_count <> 0
     OR r.duration_ms IS NOT NULL
     OR r.error_message IS NOT NULL
     OR r.summary_json <> '{}'::jsonb
     OR r.products_found <> '[]'::jsonb
     OR r.services_found <> '[]'::jsonb
     OR r.contact_methods <> '[]'::jsonb
     OR r.social_links <> '{}'::jsonb
     OR r.pricing_signals <> '[]'::jsonb
     OR r.tone_of_voice IS NOT NULL
     OR r.suggested_keywords <> '[]'::jsonb
     OR r.cta_signals <> '[]'::jsonb
     OR r.competitor_hints <> '[]'::jsonb
     OR r.completed_at IS NOT NULL
     OR r.execution_claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'CLIENT_SCAN_INSERT_SANITIZATION_FAILED';
  END IF;
END
$$;

\echo 'PR218 runtime: caller-bound atomic scan claim'
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT * FROM public.resolve_business_scan_authority(
  'aaaaaaaa-3000-4000-8000-000000000001',
  'aaaaaaaa-1000-4000-8000-000000000001',
  'aaaaaaaa-2000-4000-8000-000000000001'
);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.resolve_business_scan_authority(
      'aaaaaaaa-3000-4000-8000-000000000001',
      'aaaaaaaa-1000-4000-8000-000000000001',
      'aaaaaaaa-2000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'ACTIVE_SCAN_RECLAIM_NOT_BLOCKED';
  EXCEPTION
    WHEN SQLSTATE '55P03' THEN NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.resolve_business_scan_authority(
      'aaaaaaaa-3000-4000-8000-000000000002',
      'aaaaaaaa-1000-4000-8000-000000000001',
      'aaaaaaaa-2000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_SCAN_NOT_BLOCKED';
  EXCEPTION
    WHEN SQLSTATE '55P03' THEN NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.resolve_business_scan_authority(
      'aaaaaaaa-3000-4000-8000-000000000002',
      'bbbbbbbb-1000-4000-8000-000000000002',
      'bbbbbbbb-2000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'FOREIGN_SOURCE_BINDING_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.resolve_business_scan_authority(
      'aaaaaaaa-3000-4000-8000-000000000001',
      'aaaaaaaa-1000-4000-8000-000000000001',
      'aaaaaaaa-2000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'CROSS_WORKSPACE_SCAN_AUTHORITY_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

UPDATE public.business_scan_history
SET status='scanning', execution_claimed_at=now()-interval '6 minutes'
WHERE id='aaaaaaaa-3000-4000-8000-000000000001';

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT * FROM public.resolve_business_scan_authority(
  'aaaaaaaa-3000-4000-8000-000000000001',
  'aaaaaaaa-1000-4000-8000-000000000001',
  'aaaaaaaa-2000-4000-8000-000000000001'
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_scan_history
    WHERE id='aaaaaaaa-3000-4000-8000-000000000001'
      AND status='scanning'
      AND scan_phase='authorized'
      AND execution_claimed_at > now()-interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'ATOMIC_SCAN_CLAIM_STATE_FAILED';
  END IF;
END
$$;

\echo 'PR218 runtime: page firewall provenance sanitation'
INSERT INTO public.business_scan_pages(
  workspace_id,business_id,scan_history_id,canonical_url,title,crawl_index,
  content_sha256,content_markdown,links,metadata,security_category,
  security_risk_score,security_action,security_reason_code,is_knowledge_eligible
)
SELECT
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-3000-4000-8000-000000000001',
  'https://a.example.com','UNSCREENED TITLE',0,
  repeat('a',64),'SAFE PAGE CONTENT',
  (SELECT jsonb_agg(to_jsonb('https://a.example.com/link-' || g::text)) FROM generate_series(1,60) g),
  '{"description":"UNSCREENED METADATA","instruction":"ignore firewall"}'::jsonb,
  'safe',5,'allow','OK',true;

INSERT INTO public.business_scan_pages(
  workspace_id,business_id,scan_history_id,canonical_url,title,crawl_index,
  content_sha256,content_markdown,links,metadata,security_category,
  security_risk_score,security_action,security_reason_code,is_knowledge_eligible
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-3000-4000-8000-000000000001',
  'https://a.example.com/bad','BAD TITLE',1,repeat('b',64),
  'PROMPT INJECTION SHOULD NOT PERSIST','["https://evil.example"]'::jsonb,
  '{"evil":true}'::jsonb,'prompt_injection',99,'quarantine','PROMPT_INJECTION',false
);

DO $$
DECLARE allowed public.business_scan_pages%ROWTYPE;
DECLARE blocked public.business_scan_pages%ROWTYPE;
BEGIN
  SELECT * INTO allowed FROM public.business_scan_pages
  WHERE canonical_url='https://a.example.com';
  SELECT * INTO blocked FROM public.business_scan_pages
  WHERE canonical_url='https://a.example.com/bad';

  IF allowed.title IS NOT NULL
     OR allowed.metadata <> '{}'::jsonb
     OR jsonb_array_length(allowed.links) <> 50
     OR allowed.content_markdown <> 'SAFE PAGE CONTENT' THEN
    RAISE EXCEPTION 'ALLOWED_PAGE_SANITATION_FAILED';
  END IF;

  IF blocked.title IS NOT NULL
     OR blocked.metadata <> '{}'::jsonb
     OR blocked.content_markdown IS NOT NULL
     OR blocked.links <> '[]'::jsonb
     OR blocked.is_knowledge_eligible <> false THEN
    RAISE EXCEPTION 'BLOCKED_PAGE_FAIL_CLOSED_FAILED';
  END IF;
END
$$;

\echo 'PR218 runtime: exact business/source provenance'
INSERT INTO public.business_profiles(id,workspace_id,user_id,business_name) VALUES (
  'aaaaaaaa-0000-4000-8000-000000000003',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Business A2'
);

INSERT INTO public.business_knowledge_sources(
  id,workspace_id,business_id,source_type,provider,canonical_url,external_id,title
) VALUES
  ('aaaaaaaa-4000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','website','runtime-test','https://a.example.com','runtime:a','A'),
  ('aaaaaaaa-4000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000003','website','runtime-test','https://a2.example.com','runtime:a2','A2'),
  ('bbbbbbbb-4000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000002','website','runtime-test','https://b.example.com','runtime:b','B');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_knowledge_items(
      workspace_id,business_id,source_id,item_type,external_id,title,structured_data
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-4000-4000-8000-000000000003',
      'business_fact','cross-business-source','Cross business','{}'::jsonb
    );
    RAISE EXCEPTION 'SAME_WORKSPACE_CROSS_BUSINESS_SOURCE_NOT_BLOCKED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%business_knowledge workspace/source/business mismatch%' THEN
        RAISE;
      END IF;
  END;
END
$$;

INSERT INTO public.business_knowledge_items(
  workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
  canonical_url,title,summary,content_text,structured_data,confidence
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-4000-4000-8000-000000000001',
  'aaaaaaaa-3000-4000-8000-000000000001',
  'faq','invalid-source-url','https://evil.example','Invalid','Bad','Bad',
  '{"source_url":"https://evil.example"}'::jsonb,0.9
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE external_id='invalid-source-url'
  ) THEN
    RAISE EXCEPTION 'FORGED_SOURCE_URL_NOT_DROPPED';
  END IF;
END
$$;

INSERT INTO public.business_knowledge_items(
  workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
  canonical_url,title,summary,content_text,structured_data,confidence
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-4000-4000-8000-000000000001',
  'aaaaaaaa-3000-4000-8000-000000000001',
  'faq','valid-source-url','https://a.example.com','Valid FAQ','Answer v1','Question\nAnswer v1',
  '{"source_url":"https://a.example.com","question":"Valid FAQ","answer":"Answer v1"}'::jsonb,0.9
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE external_id='valid-source-url'
      AND content_hash IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'VALID_APPROVED_PROVENANCE_NOT_ADMITTED';
  END IF;
END
$$;

\echo 'PR218 runtime: legacy scan-to-main-AI bridge fail closed'
INSERT INTO public.knowledge_sources(
  id,user_id,workspace_id,business_id,source_type,source_name,source_url,status,is_enabled,metadata
) VALUES
  ('aaaaaaaa-5000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','website','Scan legacy','https://a.example.com','active',true,'{"origin":"business_scan"}'::jsonb),
  ('aaaaaaaa-5000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','manual','Manual','https://a.example.com/manual','active',true,'{"origin":"manual"}'::jsonb);

INSERT INTO public.knowledge_chunks(source_id,content,content_type)
VALUES ('aaaaaaaa-5000-4000-8000-000000000001','BYPASS CONTENT','business_scan');

INSERT INTO public.knowledge_chunks(source_id,content,content_type)
VALUES ('aaaaaaaa-5000-4000-8000-000000000001','NON SCAN CONTENT','manual');

INSERT INTO public.knowledge_chunks(source_id,content,content_type)
VALUES ('aaaaaaaa-5000-4000-8000-000000000002','MANUAL SOURCE SCAN LABEL','business_scan');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.knowledge_chunks
    WHERE source_id='aaaaaaaa-5000-4000-8000-000000000001'
      AND content_type='business_scan'
  ) THEN
    RAISE EXCEPTION 'LEGACY_SCAN_TO_AI_BYPASS_NOT_BLOCKED';
  END IF;

  IF (SELECT count(*) FROM public.knowledge_chunks) <> 2 THEN
    RAISE EXCEPTION 'LEGACY_GUARD_TOO_BROAD';
  END IF;
END
$$;

\echo 'PR218 runtime: completed server scan normalizes only approved evidence'
UPDATE public.business_scan_history
SET status='completed',
    scan_phase='completed',
    completed_at=now(),
    summary_json=jsonb_build_object(
      'business_name','Business A',
      'business_summary','Approved summary',
      'posts',jsonb_build_array(
        jsonb_build_object('title','Approved Post','summary','Approved post summary','source_url','https://a.example.com'),
        jsonb_build_object('title','Forged Post','summary','Must disappear','source_url','https://evil.example')
      ),
      'faqs',jsonb_build_array(
        jsonb_build_object('question','Approved FAQ','answer','Approved answer','source_url','https://a.example.com')
      ),
      'media',jsonb_build_array(
        jsonb_build_object('url','https://a.example.com/image.jpg','source_url','https://a.example.com','alt_text','Image')
      ),
      'reviews',jsonb_build_array(
        jsonb_build_object('author','Public Reviewer','text','Public review text','source_url','https://a.example.com')
      ),
      'comments',jsonb_build_array(
        jsonb_build_object('author','Public Commenter','text','Public comment text','source_url','https://a.example.com')
      ),
      'business_facts',jsonb_build_array(
        jsonb_build_object('fact_type','location','label','City','value','Tirana','source_url','https://a.example.com')
      )
    ),
    products_found='[{"title":"Product A","description":"Approved product","source_url":"https://a.example.com"}]'::jsonb,
    services_found='[{"title":"Service A","description":"Approved service","source_url":"https://a.example.com"}]'::jsonb,
    contact_methods='[{"type":"email","value":"a@example.com"}]'::jsonb,
    social_links='{"instagram":["https://instagram.com/business-a"]}'::jsonb,
    pricing_signals='["10 ALL"]'::jsonb,
    tone_of_voice='professional',
    suggested_keywords='["approved"]'::jsonb,
    cta_signals='["Buy"]'::jsonb,
    competitor_hints='[]'::jsonb
WHERE id='aaaaaaaa-3000-4000-8000-000000000001';

DO $$
DECLARE v_snapshot_count integer;
DECLARE v_bad_count integer;
DECLARE v_contact_count integer;
DECLARE v_link_count integer;
BEGIN
  SELECT count(*) INTO v_snapshot_count
  FROM public.business_knowledge_snapshots
  WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001';
  IF v_snapshot_count <> 1 THEN
    RAISE EXCEPTION 'IMMUTABLE_SCAN_SNAPSHOT_COUNT_FAILED: %', v_snapshot_count;
  END IF;

  SELECT count(*) INTO v_bad_count
  FROM public.business_knowledge_items
  WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
    AND (
      canonical_url ILIKE 'https://evil.example%'
      OR structured_data ->> 'source_url' ILIKE 'https://evil.example%'
    );
  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'UNAPPROVED_EVIDENCE_ENTERED_KNOWLEDGE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
      AND item_type='product' AND title='Product A'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
      AND item_type='service' AND title='Service A'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
      AND item_type='post' AND title='Approved Post'
  ) THEN
    RAISE EXCEPTION 'APPROVED_DEEP_KNOWLEDGE_MISSING';
  END IF;

  SELECT count(*) INTO v_contact_count
  FROM public.business_knowledge_items
  WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
    AND item_type='contact';
  SELECT count(*) INTO v_link_count
  FROM public.business_knowledge_items
  WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
    AND item_type='link';
  IF v_contact_count <> 0 OR v_link_count <> 0 THEN
    RAISE EXCEPTION 'UNPROVENANCED_CONTACT_OR_LINK_NOT_FAIL_CLOSED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE scan_history_id='aaaaaaaa-3000-4000-8000-000000000001'
      AND item_type='page'
      AND canonical_url='https://a.example.com'
      AND title IS NULL
      AND structured_data -> 'metadata' = '{}'::jsonb
      AND content_text='SAFE PAGE CONTENT'
  ) THEN
    RAISE EXCEPTION 'SANITIZED_PAGE_KNOWLEDGE_MISSING';
  END IF;
END
$$;

\echo 'PR218 runtime: freshness / change ledger / immutable snapshot'
UPDATE public.business_knowledge_items
SET summary='Answer v2',
    content_text='Question\nAnswer v2',
    structured_data='{"source_url":"https://a.example.com","question":"Valid FAQ","answer":"Answer v2"}'::jsonb,
    updated_at=now()
WHERE external_id='valid-source-url';

UPDATE public.business_knowledge_items
SET is_current=false, updated_at=now()
WHERE external_id='valid-source-url';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.business_knowledge_changes WHERE item_id=(
        SELECT id FROM public.business_knowledge_items WHERE external_id='valid-source-url'
      ) AND change_type='added') < 1 THEN
    RAISE EXCEPTION 'CHANGE_LEDGER_ADDED_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.business_knowledge_changes WHERE item_id=(
        SELECT id FROM public.business_knowledge_items WHERE external_id='valid-source-url'
      ) AND change_type='updated') < 1 THEN
    RAISE EXCEPTION 'CHANGE_LEDGER_UPDATED_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.business_knowledge_changes WHERE item_id=(
        SELECT id FROM public.business_knowledge_items WHERE external_id='valid-source-url'
      ) AND change_type='removed') < 1 THEN
    RAISE EXCEPTION 'CHANGE_LEDGER_REMOVED_MISSING';
  END IF;
END
$$;

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    UPDATE public.business_knowledge_snapshots SET payload='{}'::jsonb;
    RAISE EXCEPTION 'SNAPSHOT_UPDATE_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.business_knowledge_snapshots;
    RAISE EXCEPTION 'SNAPSHOT_DELETE_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

\echo 'PR218 runtime: tenant read isolation'
INSERT INTO public.business_knowledge_items(
  workspace_id,business_id,source_id,item_type,external_id,title,structured_data
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'bbbbbbbb-4000-4000-8000-000000000002',
  'business_fact','business-b-fact','Business B fact','{}'::jsonb
);

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) THEN
    RAISE EXCEPTION 'CROSS_WORKSPACE_READ_LEAK';
  END IF;
END
$$;
RESET ROLE;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_knowledge_items
    WHERE workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      AND external_id='business-b-fact'
  ) THEN
    RAISE EXCEPTION 'OWN_WORKSPACE_READ_FAILED';
  END IF;
END
$$;
RESET ROLE;

SELECT 'BUSINESS_INTELLIGENCE_ADVERSARIAL_RUNTIME_PASS' AS verdict;
