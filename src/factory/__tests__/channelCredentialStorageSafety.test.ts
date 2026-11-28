import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf-8");

const useChannels = read("src", "hooks", "useChannels.ts");
const useSendMessage = read("src", "hooks", "useSendMessage.ts");
const telephonySetup = read("src", "components", "telephony", "TelephonyProviderSetup.tsx");
const credentialWriter = read("supabase", "functions", "save-channel-credentials", "index.ts");
const telephonyManager = read("supabase", "functions", "telephony-call-manager", "index.ts");
const twilioResolver = read("supabase", "functions", "_shared", "twilio-workspace-resolver.ts");
const sendSms = read("supabase", "functions", "send-sms", "index.ts");
const salesSequence = read("supabase", "functions", "sales-sequence-engine", "index.ts");
const broadcastSendEngine = read("supabase", "functions", "broadcast-send-engine", "index.ts");
const transcribeRecording = read("supabase", "functions", "transcribe-recording", "index.ts");

describe("channel credential storage safety", () => {
  it("does not fetch channel secret-bearing columns into the browser", () => {
    expect(useChannels).not.toContain('.select("*")');

    const columnsStart = useChannels.indexOf("const SAFE_CHANNEL_COLUMNS");
    const hookStart = useChannels.indexOf("export const useChannels");
    const safeColumns = useChannels.slice(columnsStart, hookStart);

    expect(safeColumns).not.toContain('"settings"');
    expect(safeColumns).not.toContain('"credentials_encrypted"');
    expect(useChannels).toContain('.eq("workspace_id", workspace!.id)');
  });

  it("routes browser channel creation through the server-side credential writer", () => {
    const addStart = useChannels.indexOf("const addChannel");
    const updateStart = useChannels.indexOf("const updateChannel");
    const addSection = useChannels.slice(addStart, updateStart);

    expect(addSection).toContain('supabase.functions.invoke("save-channel-credentials"');
    expect(addSection).toContain('action: "save_generic"');
    expect(addSection).toContain("workspace_id: workspace.id");
    expect(addSection).not.toContain('.from("channels")');
    expect(addSection).not.toContain("credentials_encrypted:");
  });

  it("classifies and encrypts the existing channel secret naming patterns server-side", () => {
    expect(credentialWriter).toContain("function isSensitiveCredentialKey");
    expect(credentialWriter).toContain('normalized.endsWith("_token")');
    expect(credentialWriter).toContain('normalized.endsWith("_secret")');
    expect(credentialWriter).toContain('normalized.endsWith("_password")');
    expect(credentialWriter).toContain('normalized.endsWith("_private_key")');
    expect(credentialWriter).toContain('"api_key"');
    expect(credentialWriter).toContain('"service_account_json"');
    expect(credentialWriter).toContain("encryptForStorage(value)");
    expect(credentialWriter).toContain('action === "save_generic"');
    expect(credentialWriter).toContain("credentials_encrypted: encryptedCredentials");
  });

  it("keeps Twilio secrets encrypted and uses ciphertext-only legacy compatibility", () => {
    expect(credentialWriter).toContain("const encryptedCredentials: Record<string, string>");
    expect(credentialWriter).toContain("auth_token: await encryptCredentialValue(authToken)");
    expect(credentialWriter).toContain("credentials_encrypted: encryptedCredentials");
    expect(credentialWriter).toContain("function addVoipCiphertextCompatibility");
    expect(credentialWriter).toContain("compatible.auth_token = encryptedCredentials.auth_token");
    expect(credentialWriter).toContain("compatible.api_key_secret = encryptedCredentials.api_key_secret");
    expect(credentialWriter).toContain('auth_token: maskSecret(authToken)');
    expect(credentialWriter).toContain('api_key_secret: apiKeySecret ? maskSecret(apiKeySecret) : null');
  });

  it("authorizes telephony workspace before service-role credential lookup", () => {
    const authorizationIdx = telephonyManager.indexOf('supabase.rpc("is_workspace_member"');
    const credentialLookupIdx = telephonyManager.indexOf('.from("channels")');

    expect(authorizationIdx).toBeGreaterThan(-1);
    expect(credentialLookupIdx).toBeGreaterThan(-1);
    expect(authorizationIdx).toBeLessThan(credentialLookupIdx);
    expect(telephonyManager).toContain('.eq("owner_id", user.id)');
    expect(telephonyManager).toContain('.select("id,settings,credentials_encrypted")');
    // Every provider secret: encrypted credentials first, legacy settings fallback.
    expect(telephonyManager).toContain("credentials[key] || settings[key]");
    expect(telephonyManager).toContain("await decryptIfNeeded(raw)");
  });

  it("scopes mutable telephony call lookups to the authorized workspace", () => {
    const activeCallSelections = telephonyManager.match(/\.from\("active_calls"\)[\s\S]{0,180}?\.eq\("workspace_id", workspace_id\)/g) ?? [];
    expect(activeCallSelections.length).toBeGreaterThanOrEqual(4);
    expect(telephonyManager).toContain('throw new Error("Call not found in this workspace")');
  });

  it("requires workspace context in the telephony setup caller", () => {
    expect(telephonySetup).toContain('useWorkspace');
    expect(telephonySetup).toContain('if (!workspace?.id) throw new Error("Select a workspace before connecting telephony.")');
    expect(telephonySetup).toContain("workspace_id: workspace.id");
    expect(telephonySetup).toContain("Verify & Save");
  });

  it("requires workspace context for user and internal SMS without global Twilio fallback", () => {
    const authorizationIdx = sendSms.indexOf('sb.rpc("is_workspace_member"');
    const credentialLookupIdx = sendSms.indexOf('.from("channels")');

    expect(sendSms).toContain('const workspaceId = String(workspace_id ?? "").trim()');
    expect(sendSms).toContain('error: "workspace_id required"');
    expect(sendSms).toContain("isInternalServiceRequest");
    expect(sendSms).toContain('req.headers.get("x-internal-secret")');
    expect(sendSms).toContain('error: "user_id required for internal SMS send"');
    expect(authorizationIdx).toBeGreaterThan(-1);
    expect(credentialLookupIdx).toBeGreaterThan(-1);
    expect(authorizationIdx).toBeLessThan(credentialLookupIdx);
    expect(sendSms).toContain('.select("settings,credentials_encrypted")');
    expect(sendSms).toContain("credentials.auth_token");
    expect(sendSms).toContain("settings.auth_token");
    expect(sendSms).toContain("temporary legacy-row fallback");
    expect(sendSms).toContain("await decryptIfNeeded(authTokenRaw)");
    expect(sendSms).not.toContain('Deno.env.get("TWILIO_AUTH_TOKEN")');
    expect(sendSms).not.toContain('Deno.env.get("TWILIO_ACCOUNT_SID")');
    expect(useSendMessage).toContain("workspace_id: workspace.id");
  });

  it("passes authenticated internal SMS context from sales sequences", () => {
    const smsStart = salesSequence.indexOf('if (channel === "sms")');
    const whatsappStart = salesSequence.indexOf('if (channel === "whatsapp")');
    const smsSection = salesSequence.slice(smsStart, whatsappStart);

    expect(smsStart).toBeGreaterThan(-1);
    expect(whatsappStart).toBeGreaterThan(smsStart);
    expect(smsSection).toContain('Deno.env.get("INTERNAL_WEBHOOK_SECRET")');
    expect(smsSection).toContain('"x-internal-secret": internalSecret');
    expect(smsSection).toContain("workspace_id: workspaceId");
    expect(smsSection).toContain("user_id: userId");
    expect(smsSection).toContain("body,");
    expect(smsSection).not.toContain('JSON.stringify({ to: enrollment.contact_phone, message: body })');
  });

  it("passes authenticated internal SMS context from broadcast sends", () => {
    expect(broadcastSendEngine).toContain("broadcasts!inner(user_id, workspace_id, channel_type, throttle_per_minute, status)");
    expect(broadcastSendEngine).toContain('Deno.env.get("INTERNAL_WEBHOOK_SECRET")');
    expect(broadcastSendEngine).toContain('headers["x-internal-secret"] = internalSecret');
    expect(broadcastSendEngine).toContain("workspace_id: workspaceId");
    expect(broadcastSendEngine).toContain("user_id: item.user_id");
    expect(broadcastSendEngine).toContain("body: messageWithFooter");
    expect(broadcastSendEngine).not.toContain("message: messageWithFooter,\n          user_id: item.user_id,\n        };\n        break;\n      case \"whatsapp\"");
  });

  it("fails closed when inbound Twilio workspace resolution is ambiguous", () => {
    expect(twilioResolver).toContain('settings, credentials_encrypted');
    expect(twilioResolver).toContain("credentials.auth_token || settings.auth_token");
    expect(twilioResolver).toContain("await decryptIfNeeded(rawAuthToken)");
    expect(twilioResolver).not.toContain('Deno.env.get("TWILIO_AUTH_TOKEN")');
    expect(twilioResolver).not.toContain('Deno.env.get("TWILIO_PHONE_NUMBER")');
  });

  it("keeps legacy and new VoIP rows compatible with transcribe-recording without plaintext", () => {
    expect(transcribeRecording).toContain('.select("settings")');
    expect(transcribeRecording).toContain("await decryptIfNeeded(s.auth_token)");
    expect(credentialWriter).toContain("addVoipCiphertextCompatibility");
    expect(credentialWriter).toContain("value.startsWith(\"enc:\") ? value");
  });
});