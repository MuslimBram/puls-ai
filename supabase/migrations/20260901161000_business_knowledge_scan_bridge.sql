-- ============================================================
-- BUSINESS KNOWLEDGE / WEBSITE SCAN BRIDGE
-- Phase 1: persist completed website-scan facts into the normalized layer.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_completed_business_scan_to_knowledge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source_id uuid;
  v_page_item_id uuid;
  v_item jsonb;
  v_value text;
  v_key text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.business_knowledge_sources (
    workspace_id, business_id, source_type, provider, canonical_url, external_id, title, metadata
  )
  VALUES (
    NEW.workspace_id,
    NEW.business_id,
    'website',
    'business-scan',
    NEW.scanned_url,
    'website:' || lower(trim(NEW.scanned_url)),
    COALESCE(NEW.summary_json ->> 'business_name', NEW.scanned_url),
    jsonb_build_object('scan_history_id', NEW.id)
  )
  ON CONFLICT (workspace_id, business_id, source_type, provider, external_id)
  DO UPDATE SET
    canonical_url = EXCLUDED.canonical_url,
    title = EXCLUDED.title,
    metadata = public.business_knowledge_sources.metadata || EXCLUDED.metadata,
    last_seen_at = now(),
    updated_at = now()
  RETURNING id INTO v_source_id;

  IF v_source_id IS NULL THEN
    SELECT id INTO v_source_id
    FROM public.business_knowledge_sources
    WHERE workspace_id = NEW.workspace_id
      AND business_id = NEW.business_id
      AND source_type = 'website'
      AND provider = 'business-scan'
      AND external_id = 'website:' || lower(trim(NEW.scanned_url));
  END IF;

  -- Every completed scan produces an immutable historical snapshot.
  INSERT INTO public.business_knowledge_snapshots (
    workspace_id, business_id, source_id, scan_history_id, snapshot_kind,
    captured_at, content_hash, payload
  )
  VALUES (
    NEW.workspace_id,
    NEW.business_id,
    v_source_id,
    NEW.id,
    'website_scan',
    COALESCE(NEW.completed_at, now()),
    encode(digest(COALESCE(NEW.summary_json::text, '{}') || '|' || COALESCE(NEW.products_found::text, '[]') || '|' || COALESCE(NEW.services_found::text, '[]'), 'sha256'), 'hex'),
    jsonb_build_object(
      'url', NEW.scanned_url,
      'summary', COALESCE(NEW.summary_json, '{}'::jsonb),
      'products', COALESCE(NEW.products_found, '[]'::jsonb),
      'services', COALESCE(NEW.services_found, '[]'::jsonb),
      'contacts', COALESCE(NEW.contact_methods, '[]'::jsonb),
      'social_links', COALESCE(NEW.social_links, '{}'::jsonb),
      'pricing_signals', COALESCE(NEW.pricing_signals, '[]'::jsonb),
      'tone_of_voice', COALESCE(NEW.tone_of_voice, ''),
      'suggested_keywords', COALESCE(NEW.suggested_keywords, '[]'::jsonb),
      'cta_signals', COALESCE(NEW.cta_signals, '[]'::jsonb),
      'competitor_hints', COALESCE(NEW.competitor_hints, '[]'::jsonb)
    )
  );

  -- The scanned URL itself is a knowledge item, preserving source and history.
  INSERT INTO public.business_knowledge_items (
    workspace_id, business_id, source_id, scan_history_id, item_type,
    external_id, canonical_url, title, summary, structured_data, confidence
  )
  VALUES (
    NEW.workspace_id, NEW.business_id, v_source_id, NEW.id, 'page',
    'page:' || lower(trim(NEW.scanned_url)),
    NEW.scanned_url,
    COALESCE(NEW.summary_json ->> 'business_name', NEW.scanned_url),
    NEW.summary_json ->> 'business_summary',
    COALESCE(NEW.summary_json, '{}'::jsonb),
    0.85
  )
  ON CONFLICT (workspace_id, business_id, item_type, external_id)
  DO UPDATE SET
    source_id = EXCLUDED.source_id,
    scan_history_id = EXCLUDED.scan_history_id,
    canonical_url = EXCLUDED.canonical_url,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    structured_data = EXCLUDED.structured_data,
    last_seen_at = now(),
    is_current = true,
    updated_at = now();

  -- Products and services are normalized from the scan result rather than kept
  -- only inside the legacy JSON fields.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.products_found, '[]'::jsonb))
  LOOP
    v_value := NULLIF(trim(COALESCE(v_item ->> 'title', v_item ->> 'name', '')), '');
    IF v_value IS NOT NULL THEN
      INSERT INTO public.business_knowledge_items (
        workspace_id, business_id, source_id, scan_history_id, item_type,
        external_id, title, summary, structured_data, confidence
      )
      VALUES (
        NEW.workspace_id, NEW.business_id, v_source_id, NEW.id, 'product',
        'product:' || lower(v_value),
        v_value,
        NULLIF(v_item ->> 'description', ''),
        v_item,
        0.80
      )
      ON CONFLICT (workspace_id, business_id, item_type, external_id)
      DO UPDATE SET
        source_id = EXCLUDED.source_id,
        scan_history_id = EXCLUDED.scan_history_id,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        structured_data = EXCLUDED.structured_data,
        last_seen_at = now(),
        is_current = true,
        updated_at = now();
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.services_found, '[]'::jsonb))
  LOOP
    v_value := NULLIF(trim(COALESCE(v_item ->> 'title', v_item ->> 'name', '')), '');
    IF v_value IS NOT NULL THEN
      INSERT INTO public.business_knowledge_items (
        workspace_id, business_id, source_id, scan_history_id, item_type,
        external_id, title, summary, structured_data, confidence
      )
      VALUES (
        NEW.workspace_id, NEW.business_id, v_source_id, NEW.id, 'service',
        'service:' || lower(v_value),
        v_value,
        NULLIF(v_item ->> 'description', ''),
        v_item,
        0.80
      )
      ON CONFLICT (workspace_id, business_id, item_type, external_id)
      DO UPDATE SET
        source_id = EXCLUDED.source_id,
        scan_history_id = EXCLUDED.scan_history_id,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        structured_data = EXCLUDED.structured_data,
        last_seen_at = now(),
        is_current = true,
        updated_at = now();
    END IF;
  END LOOP;

  -- Contacts become structured facts. Values are kept as source data, not AI memory.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.contact_methods, '[]'::jsonb))
  LOOP
    v_value := NULLIF(trim(COALESCE(v_item ->> 'value', '')), '');
    v_key := lower(COALESCE(v_item ->> 'type', 'contact')) || ':' || lower(v_value);
    IF v_value IS NOT NULL THEN
      INSERT INTO public.business_knowledge_items (
        workspace_id, business_id, source_id, scan_history_id, item_type,
        external_id, title, structured_data, confidence
      )
      VALUES (
        NEW.workspace_id, NEW.business_id, v_source_id, NEW.id, 'contact',
        v_key, COALESCE(v_item ->> 'type', 'contact'), v_item, 0.95
      )
      ON CONFLICT (workspace_id, business_id, item_type, external_id)
      DO UPDATE SET
        source_id = EXCLUDED.source_id,
        scan_history_id = EXCLUDED.scan_history_id,
        title = EXCLUDED.title,
        structured_data = EXCLUDED.structured_data,
        last_seen_at = now(),
        is_current = true,
        updated_at = now();
    END IF;
  END LOOP;

  -- Social URLs are explicit link records, making later channel scans mergeable.
  FOR v_key, v_item IN
    SELECT key, value FROM jsonb_each(COALESCE(NEW.social_links, '{}'::jsonb))
  LOOP
    FOR v_value IN SELECT jsonb_array_elements_text(v_item)
    LOOP
      INSERT INTO public.business_knowledge_items (
        workspace_id, business_id, source_id, scan_history_id, item_type,
        external_id, canonical_url, title, structured_data, confidence
      )
      VALUES (
        NEW.workspace_id, NEW.business_id, v_source_id, NEW.id, 'link',
        'social:' || lower(v_key) || ':' || lower(v_value),
        v_value,
        v_key,
        jsonb_build_object('platform', v_key, 'url', v_value),
        0.95
      )
      ON CONFLICT (workspace_id, business_id, item_type, external_id)
      DO UPDATE SET
        source_id = EXCLUDED.source_id,
        scan_history_id = EXCLUDED.scan_history_id,
        canonical_url = EXCLUDED.canonical_url,
        title = EXCLUDED.title,
        structured_data = EXCLUDED.structured_data,
        last_seen_at = now(),
        is_current = true,
        updated_at = now();
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_completed_business_scan_to_knowledge ON public.business_scan_history;
CREATE TRIGGER trg_sync_completed_business_scan_to_knowledge
AFTER UPDATE OF status ON public.business_scan_history
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.sync_completed_business_scan_to_knowledge();

REVOKE ALL ON FUNCTION public.sync_completed_business_scan_to_knowledge() FROM PUBLIC, anon, authenticated, service_role;
