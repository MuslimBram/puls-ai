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
    expect(verifyEmail).toContain('Deno.connectTls({ hostname: host, port: 993');
    expect(verifyEmail).toContain('Only IMAPS on port 993 is supported');
    expect(verifyEmail).toContain('IMAP host resolves to a private or reserved network');
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

  it("decrypts saved credentials only in the backend poller and binds queries to workspace", () => {
    expect(emailPoll).toContain('credentials.imap_password ?? settings.imap_password');
    expect(emailPoll).toContain('await decryptIfNeeded(storedPassword)');
    expect(emailPoll).toContain('.eq("workspace_id", channel.workspace_id)');
    expect(emailPoll).not.toContain('.eq("user_id", channel.user_id)\n                .eq("is_active", true)');
  });

  it("persists a canonical provider event id and handles retry races", () => {
    expect(emailPoll).toContain('if (params.messageId) return params.messageId');
    expect(emailPoll).toContain('return `email_sha256:${hash}`');
    expect(emailPoll).toContain('provider_message_id: eventId');
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
