-- ============================================================
-- DEEP WEBSITE SCAN -> BUSINESS KNOWLEDGE BRIDGE
-- Adds pages/posts/FAQ/media/reviews/comments/business facts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_deep_business_scan_to_knowledge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog, extensions'
AS $$
DECLARE
  v_source_id uuid;
  v_page record;
  v_item jsonb;
  v_external_id text;
  v_source_url text;
  v_title text;
  v_text text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.business_knowledge_sources (
    workspace_id, business_id, source_type, provider,
    canonical_url, external_id, title, metadata
  ) VALUES (
    NEW.workspace_id,
    NEW.business_id,
    'website',
    'business-scan',
    NEW.scanned_url,
    'website:' || lower(trim(NEW.scanned_url)),
    COALESCE(NEW.summary_json ->> 'business_name', NEW.scanned_url),
    jsonb_build_object(
      'scan_history_id', NEW.id,
      'crawl', COALESCE(NEW.summary_json -> 'crawl', '{}'::jsonb),
      'knowledge_security', COALESCE(NEW.summary_json -> 'knowledge_security', '{}'::jsonb)
    )
  )
  ON CONFLICT (workspace_id, business_id, source_type, provider, external_id)
  DO UPDATE SET
    canonical_url = EXCLUDED.canonical_url,
    title = EXCLUDED.title,
    metadata = public.business_knowledge_sources.metadata || EXCLUDED.metadata,
    last_seen_at = now(),
    updated_at = now()
  RETURNING id INTO v_source_id;

  -- Every security-approved crawled page is independently retrievable with
  -- exact page provenance. Quarantined/rejected page content never arrives here.
  FOR v_page IN
    SELECT p.canonical_url, p.title, p.content_markdown, p.content_sha256,
           p.links, p.metadata, p.security_category, p.security_risk_score,
           p.security_action, p.security_reason_code, p.captured_at
    FROM public.business_scan_pages p
    WHERE p.scan_history_id = NEW.id
      AND p.workspace_id = NEW.workspace_id
      AND p.business_id = NEW.business_id
      AND p.is_knowledge_eligible = true
    ORDER BY p.crawl_index
  LOOP
    INSERT INTO public.business_knowledge_items (
      workspace_id, business_id, source_id, scan_history_id,
      item_type, external_id, canonical_url, title, summary, content_text,
      structured_data, first_seen_at, last_seen_at, is_current,
      confidence, source_trust_score, valid_from, valid_to
    ) VALUES (
      NEW.workspace_id,
      NEW.business_id,
      v_source_id,
      NEW.id,
      'page',
      'page:' || lower(v_page.canonical_url),
      v_page.canonical_url,
      NULLIF(v_page.title, ''),
      NULLIF(v_page.metadata ->> 'description', ''),
      v_page.content_markdown,
      jsonb_build_object(
        'content_sha256', v_page.content_sha256,
        'links', v_page.links,
        'metadata', v_page.metadata,
        'security', jsonb_build_object(
          'category', v_page.security_category,
          'risk_score', v_page.security_risk_score,
          'action', v_page.security_action,
          'reason_code', v_page.security_reason_code
        )
      ),
      v_page.captured_at,
      now(),
      true,
      0.95,
      0.95,
      now(),
      NULL
    )
    ON CONFLICT (workspace_id, business_id, item_type, external_id)
    DO UPDATE SET
      source_id = EXCLUDED.source_id,
      scan_history_id = EXCLUDED.scan_history_id,
      canonical_url = EXCLUDED.canonical_url,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      content_text = EXCLUDED.content_text,
      structured_data = EXCLUDED.structured_data,
      last_seen_at = now(),
      is_current = true,
      confidence = EXCLUDED.confidence,
      source_trust_score = EXCLUDED.source_trust_score,
      updated_at = now();
  END LOOP;

  -- AI extraction is evidence-grounded and each structured record carries a
  -- source_url selected from an approved crawl page.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.summary_json -> 'posts', '[]'::jsonb))
  LOOP
    v_source_url := NULLIF(trim(COALESCE(v_item ->> 'source_url', '')), '');
    v_title := NULLIF(trim(COALESCE(v_item ->> 'title', '')), '');
    IF v_source_url IS NOT NULL AND v_title IS NOT NULL THEN
      v_external_id := 'post:' || substr(encode(digest(convert_to(lower(v_source_url || '|' || v_title), 'UTF8'), 'sha256'), 'hex'), 1, 40);
      INSERT INTO public.business_knowledge_items (
        workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
        canonical_url,title,summary,content_text,structured_data,last_seen_at,
        is_current,confidence,source_trust_score,updated_at
      ) VALUES (
        NEW.workspace_id,NEW.business_id,v_source_id,NEW.id,'post',v_external_id,
        v_source_url,v_title,NULLIF(v_item ->> 'summary',''),NULLIF(v_item ->> 'summary',''),
        v_item,now(),true,0.85,0.90,now()
      )
      ON CONFLICT (workspace_id,business_id,item_type,external_id) DO UPDATE SET
        source_id=EXCLUDED.source_id,scan_history_id=EXCLUDED.scan_history_id,
        canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,
        summary=EXCLUDED.summary,content_text=EXCLUDED.content_text,
        structured_data=EXCLUDED.structured_data,last_seen_at=now(),is_current=true,
        confidence=EXCLUDED.confidence,source_trust_score=EXCLUDED.source_trust_score,updated_at=now();
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.summary_json -> 'faqs', '[]'::jsonb))
  LOOP
    v_source_url := NULLIF(trim(COALESCE(v_item ->> 'source_url', '')), '');
    v_title := NULLIF(trim(COALESCE(v_item ->> 'question', '')), '');
    v_text := NULLIF(trim(COALESCE(v_item ->> 'answer', '')), '');
    IF v_source_url IS NOT NULL AND v_title IS NOT NULL AND v_text IS NOT NULL THEN
      v_external_id := 'faq:' || substr(encode(digest(convert_to(lower(v_source_url || '|' || v_title), 'UTF8'), 'sha256'), 'hex'), 1, 40);
      INSERT INTO public.business_knowledge_items (
        workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
        canonical_url,title,summary,content_text,structured_data,last_seen_at,
        is_current,confidence,source_trust_score,updated_at
      ) VALUES (
        NEW.workspace_id,NEW.business_id,v_source_id,NEW.id,'faq',v_external_id,
        v_source_url,v_title,v_text,v_title || E'\n' || v_text,v_item,
        now(),true,0.90,0.90,now()
      )
      ON CONFLICT (workspace_id,business_id,item_type,external_id) DO UPDATE SET
        source_id=EXCLUDED.source_id,scan_history_id=EXCLUDED.scan_history_id,
        canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,
        summary=EXCLUDED.summary,content_text=EXCLUDED.content_text,
        structured_data=EXCLUDED.structured_data,last_seen_at=now(),is_current=true,
        confidence=EXCLUDED.confidence,source_trust_score=EXCLUDED.source_trust_score,updated_at=now();
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.summary_json -> 'media', '[]'::jsonb))
  LOOP
    v_source_url := NULLIF(trim(COALESCE(v_item ->> 'source_url', '')), '');
    v_text := NULLIF(trim(COALESCE(v_item ->> 'url', '')), '');
    IF v_source_url IS NOT NULL AND v_text IS NOT NULL THEN
      v_external_id := 'media:' || substr(encode(digest(convert_to(lower(v_text), 'UTF8'), 'sha256'), 'hex'), 1, 40);
      INSERT INTO public.business_knowledge_items (
        workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
        canonical_url,title,summary,structured_data,last_seen_at,is_current,
        confidence,source_trust_score,updated_at
      ) VALUES (
        NEW.workspace_id,NEW.business_id,v_source_id,NEW.id,'media',v_external_id,
        v_text,COALESCE(NULLIF(v_item ->> 'alt_text',''),NULLIF(v_item ->> 'media_type',''),'media'),
        NULLIF(v_item ->> 'caption',''),v_item,now(),true,0.95,0.90,now()
      )
      ON CONFLICT (workspace_id,business_id,item_type,external_id) DO UPDATE SET
        source_id=EXCLUDED.source_id,scan_history_id=EXCLUDED.scan_history_id,
        canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,summary=EXCLUDED.summary,
        structured_data=EXCLUDED.structured_data,last_seen_at=now(),is_current=true,
        confidence=EXCLUDED.confidence,source_trust_score=EXCLUDED.source_trust_score,updated_at=now();
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.summary_json -> 'reviews', '[]'::jsonb))
  LOOP
    v_source_url := NULLIF(trim(COALESCE(v_item ->> 'source_url', '')), '');
    v_text := NULLIF(trim(COALESCE(v_item ->> 'text', '')), '');
    IF v_source_url IS NOT NULL AND v_text IS NOT NULL THEN
      v_external_id := 'review:' || substr(encode(digest(convert_to(lower(v_source_url || '|' || COALESCE(v_item ->> 'author','') || '|' || v_text), 'UTF8'), 'sha256'), 'hex'), 1, 40);
      INSERT INTO public.business_knowledge_items (
        workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
        canonical_url,title,summary,content_text,structured_data,last_seen_at,
        is_current,confidence,source_trust_score,updated_at
      ) VALUES (
        NEW.workspace_id,NEW.business_id,v_source_id,NEW.id,'review',v_external_id,
        v_source_url,COALESCE(NULLIF(v_item ->> 'author',''),'Public review'),v_text,v_text,
        v_item,now(),true,0.75,0.70,now()
      )
      ON CONFLICT (workspace_id,business_id,item_type,external_id) DO UPDATE SET
        source_id=EXCLUDED.source_id,scan_history_id=EXCLUDED.scan_history_id,
        canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,summary=EXCLUDED.summary,
        content_text=EXCLUDED.content_text,structured_data=EXCLUDED.structured_data,
        last_seen_at=now(),is_current=true,confidence=EXCLUDED.confidence,
        source_trust_score=EXCLUDED.source_trust_score,updated_at=now();
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.summary_json -> 'comments', '[]'::jsonb))
  LOOP
    v_source_url := NULLIF(trim(COALESCE(v_item ->> 'source_url', '')), '');
    v_text := NULLIF(trim(COALESCE(v_item ->> 'text', '')), '');
    IF v_source_url IS NOT NULL AND v_text IS NOT NULL THEN
      v_external_id := 'comment:' || substr(encode(digest(convert_to(lower(v_source_url || '|' || COALESCE(v_item ->> 'author','') || '|' || v_text), 'UTF8'), 'sha256'), 'hex'), 1, 40);
      INSERT INTO public.business_knowledge_items (
        workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
        canonical_url,title,summary,content_text,structured_data,last_seen_at,
        is_current,confidence,source_trust_score,updated_at
      ) VALUES (
        NEW.workspace_id,NEW.business_id,v_source_id,NEW.id,'comment',v_external_id,
        v_source_url,COALESCE(NULLIF(v_item ->> 'author',''),'Public comment'),v_text,v_text,
        v_item,now(),true,0.70,0.65,now()
      )
      ON CONFLICT (workspace_id,business_id,item_type,external_id) DO UPDATE SET
        source_id=EXCLUDED.source_id,scan_history_id=EXCLUDED.scan_history_id,
        canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,summary=EXCLUDED.summary,
        content_text=EXCLUDED.content_text,structured_data=EXCLUDED.structured_data,
        last_seen_at=now(),is_current=true,confidence=EXCLUDED.confidence,
        source_trust_score=EXCLUDED.source_trust_score,updated_at=now();
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.summary_json -> 'business_facts', '[]'::jsonb))
  LOOP
    v_source_url := NULLIF(trim(COALESCE(v_item ->> 'source_url', '')), '');
    v_title := NULLIF(trim(COALESCE(v_item ->> 'label', '')), '');
    v_text := NULLIF(trim(COALESCE(v_item ->> 'value', '')), '');
    IF v_source_url IS NOT NULL AND v_title IS NOT NULL AND v_text IS NOT NULL THEN
      v_external_id := 'fact:' || substr(encode(digest(convert_to(lower(COALESCE(v_item ->> 'fact_type','fact') || '|' || v_title), 'UTF8'), 'sha256'), 'hex'), 1, 40);
      INSERT INTO public.business_knowledge_items (
        workspace_id,business_id,source_id,scan_history_id,item_type,external_id,
        canonical_url,title,summary,content_text,structured_data,last_seen_at,
        is_current,confidence,source_trust_score,updated_at
      ) VALUES (
        NEW.workspace_id,NEW.business_id,v_source_id,NEW.id,'business_fact',v_external_id,
        v_source_url,v_title,v_text,v_text,v_item,now(),true,0.90,0.90,now()
      )
      ON CONFLICT (workspace_id,business_id,item_type,external_id) DO UPDATE SET
        source_id=EXCLUDED.source_id,scan_history_id=EXCLUDED.scan_history_id,
        canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,summary=EXCLUDED.summary,
        content_text=EXCLUDED.content_text,structured_data=EXCLUDED.structured_data,
        last_seen_at=now(),is_current=true,confidence=EXCLUDED.confidence,
        source_trust_score=EXCLUDED.source_trust_score,updated_at=now();
    END IF;
  END LOOP;

  -- Only retire the deep-scan categories managed by this function. Legacy
  -- product/service/contact/link bridge categories keep their own lifecycle.
  UPDATE public.business_knowledge_items i
  SET is_current = false,
      updated_at = now()
  WHERE i.workspace_id = NEW.workspace_id
    AND i.business_id = NEW.business_id
    AND i.source_id = v_source_id
    AND i.item_type IN ('page','post','faq','media','review','comment','business_fact')
    AND i.is_current = true
    AND i.scan_history_id IS DISTINCT FROM NEW.id
    AND i.last_seen_at < COALESCE(NEW.created_at, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deep_business_scan_to_knowledge ON public.business_scan_history;
CREATE TRIGGER trg_sync_deep_business_scan_to_knowledge
AFTER UPDATE OF status ON public.business_scan_history
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.sync_deep_business_scan_to_knowledge();

REVOKE ALL ON FUNCTION public.sync_deep_business_scan_to_knowledge()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.sync_deep_business_scan_to_knowledge() IS
  'Normalizes security-approved deep website crawl pages and structured facts into the current business knowledge profile with provenance.';
;
