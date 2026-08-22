# AI-5 Golden Journey — Integration Audit

AI-5 proves one factual booking journey using existing canonical layers. It does not enable unsupported offer/referral executors and does not fabricate revenue.

| Component | Existing implementation | AI-5 use |
|---|---|---|
| AI-4 memory | `pulse-memory-facade.ts` via `pulse-ai` | Private scoped context for reasoning |
| AI-2 orchestration | `pulse-ai` | Canonical reasoning path; no provider bypass |
| AI-3 approval | `ai-action-approve` + `ai_suggested_actions` lifecycle | Human approval remains mandatory |
| AI-3 executor | `job-worker` + `ai3-executor-contract.ts` | Existing `create_booking` executor only |
| Booking | `appointment-booking?action=book` | Durable side-effect with semantic `appointment_id` success |
| Correlation | AI-3 `correlation_id` + AI-5 candidate bridge | Links reasoning/action/appointment without revenue claims |
| Journey outcome | `ai_golden_journey_runs` candidate table | `RECOMMENDED` -> factual `BOOKED`; no PAID/CONVERTED synthesis |

## Deliberate exclusions

- `create_offer`, `issue_reward`, `issue_discount`, and `issue_referral` remain unsupported/fail-closed in AI-3.
- Legacy Revenue Intelligence tables in `0148_revenue_intelligence.sql` use the older `businesses/customers` identity model and are not used by AI-5.
- Legacy `journey_touchpoints` from `0149_journey_intelligence.sql` uses the same older model and is not used as the AI-5 attribution bridge.
- AI-5 does not select providers, approve actions, or write revenue/conversion states.

## Candidate-only schema

`20260822180000_ai5_golden_journey.sql` is additive and must not be applied to production outside the normal release gate. It adds retry-safe `appointments.ai3_action_id`, a minimal correlation record, and a factual booking-link trigger.
