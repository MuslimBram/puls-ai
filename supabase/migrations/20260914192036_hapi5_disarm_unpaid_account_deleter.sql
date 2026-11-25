-- HAPI 5 / TRACK B — SAFETY STOP, reversible, no data touched.
--
-- cron job 'cleanup-unpaid-accounts-daily' runs cleanup_expired_unpaid_accounts()
-- every day at 02:00 UTC. That function does:
--     DELETE FROM auth.users WHERE id = <user with payment_status in
--     ('trial','unpaid','expired') and created_at < now() - 30 days>
-- cascading away profile, workspace, channels, inbox and subscription.
--
-- The entitlement audit established that NO code path anywhere writes
-- subscriptions.payment_status. Every row in production is 'trial', including
-- users who have already attempted payment. A customer who pays therefore stays
-- 'trial' forever and is deleted 30 days after signup.
--
-- Nobody is due tonight (3 of 4 users are admin-excluded; the 4th crosses the
-- 30-day line on 2026-10-11), so this is a pre-emptive disarm, not a recovery.
-- The job is DISABLED, not dropped: re-enable with
--     select cron.alter_job((select jobid from cron.job
--       where jobname='cleanup-unpaid-accounts-daily'), active := true);
-- once payment_status is written by the fulfilment path and the deletion
-- predicate is proven against a paid account.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'cleanup-unpaid-accounts-daily'),
  active := false
);;
