import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const emailSetup = readFileSync(
  resolve(process.cwd(), "src/components/EmailSetup.tsx"),
  "utf8",
);
const verifyEmail = readFileSync(
  resolve(process.cwd(), "supabase/functions/verify-email-connection/index.ts"),
  "utf8",
);
const emailPoll = readFileSync(
  resolve(process.cwd(), "supabase/functions/email-poll/index.ts"),
  "utf8",
);
const networkGuard = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/public-network-guard.ts"),
  "utf8",
);
const legacyIngest = readFileSync(
  resolve(process.cwd(), "supabase/functions/email-ingest/index.ts"),
  "utf8",
);
const config = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830194000_email_ingress_idempotency.sql"),
  "utf8",
);

describe("P0.6 email ingress repair", () => {
  it("uses a real JWT/workspace-bound IMAP verification function", () => {
    expect(config).toMatch(/\[functions\.verify-email-connection\][\s\S]*?verify_jwt\s*=\s*true/);
    expect(verifyEmail).toContain('authHeader.startsWith("Bearer ")');
    expect(verifyEmail).toContain('service.auth.getUser(authHeader.slice(7))');
    expect(verifyEmail).toContain('service.rpc("is_workspace_member"');
    expect(verifyEmail).toContain('connectTlsToPublicHostname(host, 993)');
    expect(verifyEmail).not.toContain('Deno.connectTls({ hostname: host');
    expect(verifyEmail).toContain('Only IMAPS on port 993 is supported');
  });

  it("pins IMAP TCP to a validated public address before TLS and credential exchange", () => {
    expect(networkGuard).toContain('Deno.resolveDns(normalized, "A")');
    expect(networkGuard).toContain('Deno.resolveDns(normalized, "AAAA")');
    expect(networkGuard).toContain('addresses.some((address) => !isPublicNetworkAddress(address))');
    expect(networkGuard).toContain('Deno.connect({ hostname: address, port })');
    expect(networkGuard).toContain('Deno.startTls(tcp, { hostname: normalized');
    expect(networkGuard).toContain('Connected peer is not a public network address');
    expect(networkGuard).toContain('Host resolves to a private or reserved network');
  });

  it("preserves password bytes rather than trimming valid credential whitespace", () => {
    expect(verifyEmail).toContain('rawCredentialString(body.imap_password, 1_024)');
    expect(verifyEmail).not.toContain('safeString(body.imap_password');
    expect(verifyEmail).toContain('Do not trim or');
  });

  it("does not advertise simulated or public email webhook setup", () => {
    expect(emailSetup).toContain('supabase.functions.invoke("verify-email-connection"');
    expect(emailSetup).toContain('connection_type: "imap"');
    expect(emailSetup).toContain('imap_host: form.imapHost');
    expect(emailSetup).toContain('imap_user: form.username');
    expect(emailSetup).toContain('imap_password: form.password');
    expect(emailSetup).toContain('imap_tls: true');
    expect(emailSetup).not.toContain('setTimeout');
    expect(emailSetup).not.toContain('email-ingest');
    expect(emailSetup).not.toContain('Webhook (Email forwarding)');
  });

  it("revalidates and pins the saved IMAP hostname on every backend poll connection", () => {
    expect(emailPoll).toContain('credentials.imap_password ?? settings.imap_password');
    expect(emailPoll).toContain('await decryptIfNeeded(storedPassword)');
    expect(emailPoll).toContain('connectTlsToPublicHostname(host, 993)');
    expect(emailPoll).not.toContain('Deno.connectTls({ hostname: host');
    expect(emailPoll).toContain('.eq("workspace_id", channel.workspace_id)');
  });

  it("uses RFC Message-ID first and UIDVALIDITY + UID in the deterministic fallback", () => {
    expect(emailPoll).toContain('if (params.messageId) return params.messageId');
    expect(emailPoll).toContain('params.uidValidity ?? ""');
    expect(emailPoll).toContain('params.imapUid ?? ""');
    expect(emailPoll).toContain('const uidValidity = selectResp.match(/UIDVALIDITY');
    expect(emailPoll).toContain('`FETCH ${msgId} (UID BODY[HEADER.FIELDS');
    expect(emailPoll).toContain('const imapUid = fetchResp.match(/\\bUID\\s+(\\d+)\\b/i)');
    expect(emailPoll).not.toContain('imapSequenceId');
    expect(emailPoll).toContain('return `email_sha256:${hash}`');
  });

  it("persists the canonical event id and handles retry races", () => {
    expect(emailPoll).toContain('provider_message_id: eventId');
    expect(emailPoll).toContain('external_event_id: eventId');
    expect(emailPoll).toContain('metadata.imap_uid = imapUid');
    expect(emailPoll).toContain('metadata.imap_uidvalidity = uidValidity');
    expect(emailPoll).toContain('inboxError.code === "23505"');
    expect(migration).toContain('inbox_messages_email_event_unique');
    expect(migration).toContain('(workspace_id, channel_id, provider_message_id)');
    expect(migration).toContain("where channel_type = 'email'");
  });

  it("retires the legacy tenant-unbound email ingest path", () => {
    expect(legacyIngest).toContain('requireInternalSecret(req)');
    expect(legacyIngest).toContain('EMAIL_INGEST_RETIRED');
    expect(legacyIngest).toContain('status: 410');
    expect(legacyIngest).not.toContain('from("inbox_messages")');
    expect(legacyIngest).not.toContain('user_id,');
  });
});
