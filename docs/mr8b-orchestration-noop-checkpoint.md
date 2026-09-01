# MR8B — Workflow Engine / Parallel Swarm / Scheduler

Verdict: **NO-CHANGE / CLOSED BY EXISTING MR3 EVIDENCE**.

MR8B does not introduce another orchestration implementation. The current stacked LEAH head already contains MR3's PostgreSQL-authoritative priority queue, dependency DAG, task leases/heartbeats, bounded parallel swarms, manual/scheduled bootstrap, one-minute scheduler tick, reconciliation, stale-worker rejection, state guards and lifecycle cancellation.

The current `supabase/functions/leah-worker/index.ts` blob remains byte-identical to the accepted MR3 head (`bb45e083070e7ae16d2f86afbe3ded981d606170`). MR3's ten PostgreSQL runtime verifiers already passed on real PostgreSQL. Later MR5/MR7/MR8A work did not replace the durable orchestration core.

No duplicate queue/scheduler/swarm code is added in MR8B. Release/merge remains subject to the existing stacked PR and GitHub CI infrastructure gates.
