-- MR8E recovery evidence must remain bound to the exact workspace + project checkpoint.

alter table public.leah_recovery_checkpoints
  add constraint leah_recovery_checkpoint_id_project_workspace_key
  unique(id,project_id,workspace_id);

alter table public.leah_recovery_drills
  drop constraint leah_recovery_drill_checkpoint_fk,
  add constraint leah_recovery_drill_checkpoint_fk
    foreign key(checkpoint_id,project_id,workspace_id)
    references public.leah_recovery_checkpoints(id,project_id,workspace_id)
    on delete cascade;

alter table public.leah_recovery_plans
  drop constraint leah_recovery_plan_checkpoint_fk,
  add constraint leah_recovery_plan_checkpoint_fk
    foreign key(checkpoint_id,project_id,workspace_id)
    references public.leah_recovery_checkpoints(id,project_id,workspace_id)
    on delete restrict;
