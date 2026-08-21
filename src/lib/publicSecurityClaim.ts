/**
 * publicSecurityClaim — single authoritative source for public security wording.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  NEVER claim: SOC 2 certified, ISO 27001 certified, GDPR certified, ║
 * ║  HIPAA compliant, or fully production-verified cross-workspace       ║
 * ║  isolation.                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Local/canonical runtime verification = PASS.
 * Remote production verification remains pending production
 * alignment/deployment.
 *
 * Import this module wherever public security claims need to appear.
 * Do NOT duplicate or paraphrase these strings in ad-hoc component copy.
 */

export const SECURITY_CLAIM = {
  /**
   * Short headline for badges, cards, hero sections.
   */
  headline: "Built for Business Security",

  /**
   * One-sentence summary suitable for marketing copy.
   * Does NOT claim certification or production-verified isolation.
   */
  summary:
    "Pulse AI is designed with role-based access controls, encrypted data in transit, and session security.",

  /**
   * Detailed multi-point list. Each item is independently true and evidenced.
   */
  points: [
    "Role-based access control (RBAC)",
    "Data encrypted in transit (TLS)",
    "Session security with automatic expiry",
    "Workspace-scoped data access enforced at the application layer",
  ] as const,

  /**
   * Legal-safe disclaimer. Must accompany any claim of compliance.
   * Local/canonical runtime verification = PASS.
   * Remote production verification remains pending production alignment/deployment.
   */
  disclaimer:
    "Local/canonical runtime verification: PASS. " +
    "Remote production cross-workspace isolation verification remains pending production alignment and deployment. " +
    "Pulse AI does not currently hold SOC 2, ISO 27001, GDPR, or HIPAA certifications.",

  /**
   * Short badge label. Use for trust badges, footers, header bars.
   */
  badgeLabel: "Security Reviewed",
} as const;

export type SecurityClaimKeys = keyof typeof SECURITY_CLAIM;
