\set ON_ERROR_STOP on

\echo 'PR218 integration runtime: direct browser scan creation is closed'
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_scan_history(
      business_id,workspace_id,triggered_by,scanned_url
    ) VALUES (
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'https://forged.example.com'
    );
    RAISE EXCEPTION 'DIRECT_BROWSER_SCAN_INSERT_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

\echo 'PR218 integration runtime: atomic scan request is tenant-bound'
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT * FROM public.create_business_scan_request(
  'aaaaaaaa-0000-4000-8000-000000000001',
  'https://fresh.example.com'
) \gset atomic_
SELECT pg_catalog.set_config('pr218.atomic_scan_history_id', :'atomic_scan_history_id', false);
SELECT pg_catalog.set_config('pr218.atomic_source_id', :'atomic_source_id', false);
SELECT pg_catalog.set_config('pr218.atomic_source_scan_id', :'atomic_source_scan_id', false);
SELECT pg_catalog.set_config('pr218.atomic_workspace_id', :'atomic_workspace_id', false);
SELECT pg_catalog.set_config('pr218.atomic_business_id', :'atomic_business_id', false);
RESET ROLE;

DO $$
BEGIN
  IF pg_catalog.current_setting('pr218.atomic_workspace_id')::uuid <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
     OR pg_catalog.current_setting('pr218.atomic_business_id')::uuid <> 'aaaaaaaa-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'ATOMIC_SCAN_SERVER_AUTHORITY_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_scan_history
    WHERE id=pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid
      AND workspace_id=pg_catalog.current_setting('pr218.atomic_workspace_id')::uuid
      AND business_id=pg_catalog.current_setting('pr218.atomic_business_id')::uuid
      AND status='pending'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.scan_sources
    WHERE id=pg_catalog.current_setting('pr218.atomic_source_id')::uuid
      AND workspace_id=pg_catalog.current_setting('pr218.atomic_workspace_id')::uuid
      AND business_id=pg_catalog.current_setting('pr218.atomic_business_id')::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.source_scans
    WHERE id=pg_catalog.current_setting('pr218.atomic_source_scan_id')::uuid
      AND source_id=pg_catalog.current_setting('pr218.atomic_source_id')::uuid
      AND workspace_id=pg_catalog.current_setting('pr218.atomic_workspace_id')::uuid
      AND business_id=pg_catalog.current_setting('pr218.atomic_business_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ATOMIC_SCAN_TOPOLOGY_MISSING';
  END IF;
END
$$;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.create_business_scan_request(
      'bbbbbbbb-0000-4000-8000-000000000002',
      'https://cross-tenant.example.com'
    );
    RAISE EXCEPTION 'CROSS_TENANT_ATOMIC_SCAN_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

SELECT * FROM public.resolve_business_scan_authority(
  pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid,
  pg_catalog.current_setting('pr218.atomic_source_id')::uuid,
  pg_catalog.current_setting('pr218.atomic_source_scan_id')::uuid
) \gset claim1_
SELECT pg_catalog.set_config('pr218.claim1_version', :'claim1_execution_claim_version', false);
RESET ROLE;

DO $$
BEGIN
  IF pg_catalog.current_setting('pr218.claim1_version')::bigint <> 1 THEN
    RAISE EXCEPTION 'FIRST_EXECUTION_FENCE_NOT_ONE';
  END IF;
END
$$;

UPDATE public.business_scan_history
SET execution_claimed_at=now()-interval '6 minutes'
WHERE id=pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT * FROM public.resolve_business_scan_authority(
  pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid,
  pg_catalog.current_setting('pr218.atomic_source_id')::uuid,
  pg_catalog.current_setting('pr218.atomic_source_scan_id')::uuid
) \gset claim2_
SELECT pg_catalog.set_config('pr218.claim2_version', :'claim2_execution_claim_version', false);
RESET ROLE;

DO $$
BEGIN
  IF pg_catalog.current_setting('pr218.claim2_version')::bigint <> 2 THEN
    RAISE EXCEPTION 'STALE_RECLAIM_DID_NOT_ADVANCE_FENCE';
  END IF;
END
$$;

\echo 'PR218 integration runtime: stale page side effects are fenced'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_scan_pages(
      workspace_id,business_id,scan_history_id,execution_claim_version,
      canonical_url,crawl_index,content_sha256,content_markdown,links,metadata,
      security_category,security_risk_score,security_action,security_reason_code,
      is_knowledge_eligible
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000001',
      pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid,
      1,
      'https://fresh.example.com/stale',0,repeat('c',64),'STALE',
      '[]'::jsonb,'{}'::jsonb,'safe',0,'allow','OK',true
    );
    RAISE EXCEPTION 'STALE_PAGE_WRITE_NOT_BLOCKED';
  EXCEPTION
    WHEN SQLSTATE '55P03' THEN NULL;
  END;
END
$$;

INSERT INTO public.business_scan_pages(
  workspace_id,business_id,scan_history_id,execution_claim_version,
  canonical_url,crawl_index,content_sha256,content_markdown,links,metadata,
  security_category,security_risk_score,security_action,security_reason_code,
  is_knowledge_eligible
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid,
  2,
  'https://fresh.example.com/current',0,repeat('d',64),'CURRENT SAFE CONTENT',
  '[]'::jsonb,'{}'::jsonb,'safe',0,'allow','OK',true
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_scan_pages
    WHERE scan_history_id=pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid
      AND execution_claim_version=2
      AND canonical_url='https://fresh.example.com/current'
  ) THEN
    RAISE EXCEPTION 'CURRENT_PAGE_CLAIM_WRITE_FAILED';
  END IF;
END
$$;

\echo 'PR218 integration runtime: legacy post-processing cannot re-enter the queue'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.job_queue(user_id,workspace_id,job_type,job_payload)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'scan_post_process',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'LEGACY_SCAN_POST_PROCESS_NOT_BLOCKED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%legacy scan_post_process is disabled%' THEN RAISE; END IF;
  END;
END
$$;

\echo 'PR218 integration runtime: canonical snapshot contains admitted items only'
INSERT INTO public.business_knowledge_sources(
  id,workspace_id,business_id,source_type,provider,canonical_url,external_id,title
) VALUES (
  'aaaaaaaa-6000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'website','business-scan','https://fresh.example.com',
  'website:https://fresh.example.com','Fresh canonical source'
)
ON CONFLICT (workspace_id,business_id,source_type,provider,external_id)
DO UPDATE SET updated_at=now();

INSERT INTO public.business_knowledge_items(
  workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
  canonical_url,title,summary,content_text,structured_data,confidence
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-6000-4000-8000-000000000001',
  pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid,
  'business_fact','fresh-canonical-fact','https://fresh.example.com/current',
  'Fresh fact','Approved','Approved',
  '{"source_url":"https://fresh.example.com/current","fact_type":"test","label":"Fresh fact","value":"Approved"}'::jsonb,
  0.95
);

UPDATE public.business_scan_history
SET status='completed',scan_phase='completed',completed_at=now()
WHERE id=pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid
  AND execution_claim_version=2;

DO $$
DECLARE v_payload jsonb;
BEGIN
  SELECT payload INTO v_payload
  FROM public.business_knowledge_snapshots
  WHERE scan_history_id=pg_catalog.current_setting('pr218.atomic_scan_history_id')::uuid
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_payload IS NULL
     OR coalesce((v_payload->>'canonical')::boolean,false) IS NOT TRUE
     OR NOT (v_payload ? 'items')
     OR v_payload ? 'products'
     OR v_payload ? 'services'
     OR v_payload ? 'summary' THEN
    RAISE EXCEPTION 'CANONICAL_SNAPSHOT_ADMISSION_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_payload->'items') x
    WHERE x->>'external_id'='fresh-canonical-fact'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SNAPSHOT_ITEM_MISSING';
  END IF;
END
$$;

\echo 'PR218 integration runtime: canonical hard delete is denied to service role'
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    DELETE FROM public.business_knowledge_items
    WHERE external_id='fresh-canonical-fact';
    RAISE EXCEPTION 'SERVICE_ROLE_ITEM_DELETE_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.business_knowledge_sources
    WHERE id='aaaaaaaa-6000-4000-8000-000000000001';
    RAISE EXCEPTION 'SERVICE_ROLE_SOURCE_DELETE_NOT_BLOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

SELECT 'BUSINESS_INTELLIGENCE_INTEGRATION_RUNTIME_PASS' AS verdict;
