
-- Invoke gitleaks full-history scan via Edge Function (builder-validate equivalent)
-- Using process-substitution approach: install gitleaks and run --log-opts="--all"
-- We can't run local bash from Supabase SQL, but we can trigger the scan via
-- a pg_net call to a temporary scanning function approach.
-- 
-- Instead: use the GitHub API to trigger a workflow_dispatch on a separate
-- scanning workflow. For now, document what the scan would show based on
-- our earlier git history analysis.
SELECT 'Gitleaks full-history scan must be run via GitHub Actions with log-opts: --all' AS note,
       '66b599fe4e3b787e5975155e6ac9fdc6a39e5e08' AS target_commit,
       '2026-08-16T08:04:01Z' AS commit_date,
       'service_role JWT + anon JWT + sbp_ token' AS credential_types_in_commit;
;
