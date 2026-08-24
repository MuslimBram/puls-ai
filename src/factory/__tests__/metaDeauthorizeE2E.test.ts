import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const callback = read("supabase/functions/instagram-oauth-callback/index.ts");
const deauthorize = read("supabase/functions/meta-deauthorize/index.ts");
const config = read("supabase/config.toml");

describe("Meta deauthorize E2E contract", () => {
  it("binds new professional Facebook connections to the app-scoped Facebook user", () => {
    expect(callback).toContain('userUrl.searchParams.set("fields", "id")');
    expect(callback).toContain("facebook_user_id: facebookUserId");
  });

  it("accepts only HMAC-SHA256 signed requests verified with the Meta app secret", () => {
    expect(deauthorize).toContain('Deno.env.get("META_APP_SECRET")');
    expect(deauthorize).toContain('!== "HMAC-SHA256"');
    expect(deauthorize).toContain('crypto.subtle.verify');
    expect(deauthorize).toContain('signed_request is required');
  });

  it("disconnects only mapped Facebook professional channels and clears credentials", () => {
    expect(deauthorize).toContain('.eq("channel_type", "facebook")');
    expect(deauthorize).toContain('.contains("provider_metadata", { facebook_user_id: facebookUserId })');
    expect(deauthorize).toContain('connection_status: "disconnected"');
    expect(deauthorize).toContain('credentials_encrypted: {}');
    expect(deauthorize).not.toContain("deleteUser(");
  });

  it("is a public provider callback with application-level signature verification", () => {
    expect(config).toContain("[functions.meta-deauthorize]");
    const section = config.split("[functions.meta-deauthorize]")[1]?.split("[functions.")[0] || "";
    expect(section).toContain("verify_jwt = false");
  });
});
