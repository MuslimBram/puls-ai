/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3C: SECRET SCANNER CONTRACT
 *
 * Deterministic local evidence scanner for detecting leaked secrets, tokens, API keys, and credentials.
 * OPERATES STRICTLY ON SUPPLIED ARTIFACT TEXT AND LOGS (PURE ENGINE).
 */

export interface SecretScanMatch {
  pattern_name: string;
  matched_text_snippet: string;
  source: string;
}

export interface SecretScanResult {
  secrets_detected: boolean;
  findings: SecretScanMatch[];
  summary: string;
}

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Generic API Key (sk_live/test)", pattern: /\bsk_(live|test)_[0-9a-zA-Z]{16,}\b/ },
  { name: "AWS Access Key ID", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub Token (ghp/gho/ghu)", pattern: /\bgh[pous]_[0-9a-zA-Z]{36}\b/ },
  { name: "GitLab Personal Access Token", pattern: /\bglpat-[0-9a-zA-Z_-]{20,}\b/ },
  { name: "Slack Bot/User Token", pattern: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/ },
  { name: "Bearer JWT Token", pattern: /\bBearer\s+eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/ },
  { name: "RSA / Private Key", pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "Hardcoded Password Assignment", pattern: /\b(password|secret_key|api_secret)\s*[:=]\s*["'][^"']{6,}["']/i },
  { name: "Dotenv Credentials Leakage", pattern: /\b(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|STRIPE_SECRET_KEY)\s*=\s*[^\s]+/i },
];

/**
 * Scans provided text content / logs for secrets. Masking findings to avoid secret leak in logs.
 */
export function scanTextForSecrets(text: string, source: string): SecretScanMatch[] {
  const matches: SecretScanMatch[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const fullMatch = match[0];
      const masked = fullMatch.length > 8
        ? `${fullMatch.substring(0, 4)}...${fullMatch.substring(fullMatch.length - 4)}`
        : "*******";

      matches.push({
        pattern_name: name,
        matched_text_snippet: masked,
        source,
      });
    }
  }

  return matches;
}

/**
 * Scans a array of log strings or result objects for secrets.
 */
export function scanArtifactsForSecrets(
  logs: string[] = [],
  changedFiles: string[] = [],
  outputs: string[] = []
): SecretScanResult {
  const findings: SecretScanMatch[] = [];

  // Check logs
  logs.forEach((logLine, idx) => {
    const found = scanTextForSecrets(logLine, `log[${idx}]`);
    findings.push(...found);
  });

  // Check outputs
  outputs.forEach((outText, idx) => {
    const found = scanTextForSecrets(outText, `output[${idx}]`);
    findings.push(...found);
  });

  // Check if .env or secret file is in changed files
  changedFiles.forEach((file) => {
    if (/\.env($|\.)/i.test(file) || /credentials\.json$/i.test(file) || /secrets\.json$/i.test(file)) {
      findings.push({
        pattern_name: "Forbidden Secret File Changed",
        matched_text_snippet: file,
        source: "changed_files",
      });
    }
  });

  const secretsDetected = findings.length > 0;
  const summary = secretsDetected
    ? `SECRETS_DETECTED: Found ${findings.length} secret pattern match(es).`
    : "CLEAN: No secrets or credentials detected.";

  return {
    secrets_detected: secretsDetected,
    findings,
    summary,
  };
}
