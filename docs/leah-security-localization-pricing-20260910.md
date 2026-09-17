# LEAH / Security / Localization / Pricing implementation plan

## Product rules

- Workspace Owner and Admin have free LEAH access.
- Platform Super Admin has free LEAH access.
- Regular workspace members require an active LEAH entitlement or paid plan.
- LEAH plans must define both price and usage limits, not price alone.
- Pulse AI must expose a visitor/security layer for Owner/Admin: online visitors, coarse location, device/browser, referrer/source, session duration, pages/events explored, AI risk score, moderation state and audit trail.
- Automated moderation actions must support approve, unapprove, mark as spam and move to trash. High-risk activity is temporarily blocked/held and Owner/Admin are notified.
- The UI must state that an activity is being verified when an automated temporary block occurs.
- Public platform pages must be localized and must not fall through to 404.
- Locale selection may use browser preference and coarse IP-derived country as a suggestion. IP must never be used as a precise-address mechanism. Online translation must be a fallback for missing translations, while preserving the user's explicit language choice.

## LEAH usage tiers

LEAH is represented as a product layer over the existing Pulse AI billing/entitlement system. Suggested limits are intentionally centralized and configurable rather than scattered in UI code:

- Free: limited monthly messages/credits, limited memory retention, limited connected channels/tools.
- Starter: higher monthly AI credits/messages, longer memory, more channels/tools.
- Growth: higher limits and automation/knowledge capacity.
- Pro: high limits, expanded knowledge/memory and advanced tools.
- Enterprise: custom/high limits and advanced security/administration.

The server remains authoritative for limits and entitlement. Frontend displays limits from the same canonical pricing source.

## Security visitor intelligence

Do not collect precise location or sensitive personal data merely for analytics. Store only the minimum fields required for abuse detection and product analytics. IP handling should support privacy/retention controls. Risk scoring must be explainable enough for admins to review and override.

## Acceptance criteria

1. Owner/Admin can use LEAH without paid entitlement.
2. Member without entitlement receives a clear upgrade/activation state.
3. LEAH usage is metered and rejected/throttled when limits are exceeded.
4. Visitor dashboard is restricted to Owner/Admin and shows live/session data without exposing another workspace's data.
5. High-risk events can be held temporarily, produce a verification popup/state, and notify authorized admins.
6. Bulk moderation actions are permission-checked and audited.
7. English and Albanian remain first-class; additional locales can be added without route duplication.
8. Missing translations use online translation only as a fallback and never overwrite the source catalog automatically.
