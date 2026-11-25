-- FAZA 2: fusha reale për të mbajtur statusin e skanimit AI (deri tani s'kishte fare vend për ta ruajtur)
ALTER TABLE public.community_attachments
  ADD COLUMN scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending','clean','flagged','pending_manual_review')),
  ADD COLUMN scan_notes text;
;
