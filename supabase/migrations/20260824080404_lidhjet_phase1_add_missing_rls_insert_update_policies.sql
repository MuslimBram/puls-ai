-- FAZA 1 (Lidhjet): shtim i RLS policies që mungonin për INSERT/UPDATE
-- Pa këto, çdo edge function që përdor userClient (jo service role) dështon me "permission denied"

-- community_posts: autori krijon postimin e vet
CREATE POLICY "community_posts_insert" ON public.community_posts
FOR INSERT WITH CHECK (author_user_id = auth.uid());

-- community_posts: autori (ose stafi) mund të përditësojë (p.sh. mbyll postimin, service_tax)
CREATE POLICY "community_posts_update" ON public.community_posts
FOR UPDATE USING (author_user_id = auth.uid() OR public.community_is_staff())
WITH CHECK (author_user_id = auth.uid() OR public.community_is_staff());

-- community_comments: autori krijon komentin e vet
CREATE POLICY "community_comments_insert" ON public.community_comments
FOR INSERT WITH CHECK (author_user_id = auth.uid());

-- community_attachments: bashkëngjitja duhet t'i përkasë një postimi të vetin
CREATE POLICY "community_attachments_insert" ON public.community_attachments
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id AND p.author_user_id = auth.uid())
);

-- community_interests: blerësi krijon një ofertë/interes
CREATE POLICY "community_interests_insert" ON public.community_interests
FOR INSERT WITH CHECK (buyer_id = auth.uid());

-- community_interests: blerësi ose shitësi (autori i postimit) mund të përditësojnë statusin
CREATE POLICY "community_interests_update" ON public.community_interests
FOR UPDATE USING (
  buyer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id AND p.author_user_id = auth.uid())
  OR public.community_is_staff()
) WITH CHECK (
  buyer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id AND p.author_user_id = auth.uid())
  OR public.community_is_staff()
);

-- community_reports: raportuesi krijon raportin e vet
CREATE POLICY "community_reports_insert" ON public.community_reports
FOR INSERT WITH CHECK (reporter_user_id = auth.uid());

-- community_ratings: vlerësuesi vlerëson një postim (upsert => nevojiten INSERT + UPDATE)
CREATE POLICY "community_ratings_insert" ON public.community_ratings
FOR INSERT WITH CHECK (rater_user_id = auth.uid());

CREATE POLICY "community_ratings_update" ON public.community_ratings
FOR UPDATE USING (rater_user_id = auth.uid()) WITH CHECK (rater_user_id = auth.uid());

-- Unique constraint i nevojshëm për upsert onConflict (1 vlerësim/person/postim)
ALTER TABLE public.community_ratings
ADD CONSTRAINT community_ratings_post_rater_unique UNIQUE (post_id, rater_user_id);
;
