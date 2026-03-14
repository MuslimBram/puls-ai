/**
 * ExternalIntegrationsLayer — Adapter interface definitions
 * 
 * WORKFLOW DIAGRAM:
 * ┌─────────────────────────────────────────────────────────┐
 * │                 ExternalIntegrationsLayer               │
 * │                                                         │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
 * │  │  Analytics &  │  │ Publishing & │  │ Automation & │  │
 * │  │  Monitoring   │  │ Management   │  │  Messaging   │  │
 * │  │              │  │              │  │              │  │
 * │  │ • Talkwalker │  │ • Hootsuite  │  │ • ManyChat   │  │
 * │  │ • Brand      │  │ • Buffer     │  │              │  │
 * │  │   Analytics  │  │ • Zoho Social│  │              │  │
 * │  │ • TG Analyt. │  │              │  │              │  │
 * │  │ • WA Analyt. │  │              │  │              │  │
 * │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
 * │         │                 │                 │          │
 * │  ┌──────┴─────────────────┴─────────────────┴───────┐  │
 * │  │            Adapter Interface (IAdapter)           │  │
 * │  │  • validateCredentials()                          │  │
 * │  │  • testConnection()                               │  │
 * │  │  • fetchData() / pushData()                       │  │
 * │  │  • getUsageStats()                                │  │
 * │  └──────────────────────┬───────────────────────────┘  │
 * │                         │                              │
 * │  ┌──────────────────────┴───────────────────────────┐  │
 * │  │          Rate Limiter & Scan Scheduler            │  │
 * │  │  • min 30min scan interval                        │  │
 * │  │  • keyword threshold gating                       │  │
 * │  │  • usage counter                                  │  │
 * │  └──────────────────────┬───────────────────────────┘  │
 * │                         │                              │
 * │  ┌──────────────────────┴───────────────────────────┐  │
 * │  │              OSINT Monitoring Module               │  │
 * │  │  • ShadowDragon-like simulation                   │  │
 * │  │  • Configurable crawler targets                   │  │
 * │  └─────────────────────────────────────────────────┘  │
 * └─────────────────────────┬───────────────────────────────┘
 *                           │
 *            ┌──────────────┼──────────────┐
 *            ▼              ▼              ▼
 *     channel_registry  inbox_messages   leads
 *                    analytics dashboards
 */

export type IntegrationStatus = "planned" | "connected" | "error" | "disabled";

export type IntegrationCategory =
  | "analytics_monitoring"
  | "publishing_management"
  | "automation_messaging"
  | "osint_monitoring";

export interface IntegrationCredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required: boolean;
}

export interface IntegrationDefinition {
  key: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: string;
  credentialFields: IntegrationCredentialField[];
  defaultConfig: Record<string, unknown>;
  minPlan: string;
  rateLimitPerHour: number;
  minScanIntervalMinutes: number;
  /** URL where the business can obtain their API credentials */
  helpUrl?: string;
  /** Short label for the help link */
  helpLabel?: string;
}

/**
 * IExternalAdapter — All external integration adapters must implement this interface.
 * Production logic is NOT implemented yet; this defines the contract.
 */
export interface IExternalAdapter {
  /** Unique integration key matching IntegrationDefinition.key */
  readonly key: string;

  /** Validate that provided credentials are structurally correct */
  validateCredentials(credentials: Record<string, string>): { valid: boolean; errors: string[] };

  /** Test the connection (placeholder — returns simulated result) */
  testConnection(credentials: Record<string, string>): Promise<{ success: boolean; message: string }>;

  /** Fetch data from the external service (placeholder) */
  fetchData(config: Record<string, unknown>): Promise<{ data: unknown; eventLog: string }>;

  /** Push data to the external service (placeholder) */
  pushData(payload: unknown): Promise<{ success: boolean; eventLog: string }>;

  /** Get usage statistics */
  getUsageStats(): { totalCalls: number; lastCalledAt: string | null };
}

/**
 * Rate limit guard — checks if enough time has passed since last scan
 */
export function canScan(lastScanAt: string | null, minIntervalMinutes: number): boolean {
  if (!lastScanAt) return true;
  const elapsed = Date.now() - new Date(lastScanAt).getTime();
  return elapsed >= minIntervalMinutes * 60 * 1000;
}

/**
 * Keyword threshold guard — only trigger AI if score exceeds threshold
 */
export function meetsKeywordThreshold(score: number, threshold: number): boolean {
  return score >= threshold;
}
