create table public.ai_learning_lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete cascade,
  business_id uuid null,
  created_by uuid null references auth.users(id) on delete set null,
  scope text not null default 'system',
  title text not null,
  summary text null,
  content text not null,
  steps jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}'::text[],
  audience text[] not null default '{ai,business}'::text[],
  source_type text not null default 'procedure',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_learning_lessons_scope_ck check ((scope = 'system' and workspace_id is null) or (scope = 'workspace' and workspace_id is not null) or (scope = 'business' and business_id is not null))
);
create index idx_ai_learning_lessons_scope on public.ai_learning_lessons(scope, is_active);
create index idx_ai_learning_lessons_workspace on public.ai_learning_lessons(workspace_id, is_active);
create index idx_ai_learning_lessons_business on public.ai_learning_lessons(business_id, is_active);
alter table public.ai_learning_lessons enable row level security;
create policy ai_learning_lessons_select on public.ai_learning_lessons for select to authenticated using (is_active = true and (scope = 'system' or (scope = 'workspace' and exists (select 1 from public.workspace_members wm where wm.workspace_id = ai_learning_lessons.workspace_id and wm.user_id = auth.uid()))));
create policy ai_learning_lessons_manage on public.ai_learning_lessons for all to authenticated using (scope <> 'system' and (created_by = auth.uid() or exists (select 1 from public.workspace_members wm where wm.workspace_id = ai_learning_lessons.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin')))) with check (scope <> 'system' and (created_by = auth.uid() or exists (select 1 from public.workspace_members wm where wm.workspace_id = ai_learning_lessons.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))));
create or replace function public.touch_ai_learning_lessons_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger trg_ai_learning_lessons_updated_at before update on public.ai_learning_lessons for each row execute function public.touch_ai_learning_lessons_updated_at();