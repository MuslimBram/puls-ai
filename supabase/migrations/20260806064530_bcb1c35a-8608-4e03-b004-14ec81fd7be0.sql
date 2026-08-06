DROP POLICY IF EXISTS "meta_ads_cache_select_own" ON public.meta_ads_cache;
CREATE POLICY "meta_ads_cache_select_own" ON public.meta_ads_cache
FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "google_ads_cache_select_own" ON public.google_ads_cache;
CREATE POLICY "google_ads_cache_select_own" ON public.google_ads_cache
FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Owners can delete non-owner members" ON public.workspace_members;
CREATE POLICY "Owners can delete non-owner members" ON public.workspace_members
FOR DELETE TO authenticated
USING (public.is_workspace_owner(auth.uid(), workspace_id) AND role <> 'owner');

DROP POLICY IF EXISTS "Owners can update non-owner members" ON public.workspace_members;
CREATE POLICY "Owners can update non-owner members" ON public.workspace_members
FOR UPDATE TO authenticated
USING (public.is_workspace_owner(auth.uid(), workspace_id) AND role <> 'owner')
WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id) AND role = ANY (ARRAY['admin','member','viewer']));

DROP POLICY IF EXISTS "Owners can insert non-owner members" ON public.workspace_members;
CREATE POLICY "Owners can insert non-owner members" ON public.workspace_members
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id) AND role = ANY (ARRAY['admin','member','viewer']));