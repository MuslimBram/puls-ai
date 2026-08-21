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
   * Does NOT claim certification.
   */
  summary:
    "Pulse AI is designed with workspace isolation, encrypted data handling, and role-based access controls — reviewed against industry standards.",

  /**
   * Detailed multi-point list. Each item is independently true.
   */
  points: [
    "End-to-end workspace data isolation",
    "Role-based access control (RBAC)",
    "Encrypted data in transit and at rest",
    "Audit logging for sensitive operations",
    "Session security with automatic expiry",
    "Regular internal security reviews",
  ] as const,

  /**
   * Legal-safe disclaimer. Must accompany any claim of compliance.
   */
  disclaimer:
    "Internal security controls have been validated in our canonical runtime environment. " +
    "Production-environment cross-workspace isolation verification is ongoing. " +
    "Pulse AI does not currently hold SOC 2, ISO 27001, GDPR, or HIPAA certifications.",

  /**
   * Short badge label. Use for trust badges, footers, header bars.
   */
  badgeLabel: "Security Reviewed",
} as const;

export type SecurityClaimKeys = keyof typeof SECURITY_CLAIM;
