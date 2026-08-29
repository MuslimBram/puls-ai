import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read=(...p:string[])=>readFileSync(join(process.cwd(),...p),"utf8");
const oauth=read("src","integrations","auth","oauth.ts");
const selector=read("src","components","register","AccountTypeOrbitSelector.tsx");
const callback=read("src","pages","AuthCallback.tsx");
const register=read("src","pages","Register.tsx");
const login=read("src","pages","Login.tsx");

describe("social registration callback",()=>{
 it("keeps Google, Facebook and Apple available on login and registration",()=>{
  for(const provider of ["google","facebook","apple"]){
   expect(register).toContain(`\"${provider}\"`);
   expect(login).toContain(`signInWithOAuth(\"${provider}\"`);
  }
 });
 it("persists registration account type and fixed trial defaults before redirect",()=>{
  expect(selector).toContain('sessionStorage.setItem("registration_account_type", next)');
  expect(oauth).toContain('pending_social_registration');
  expect(oauth).toContain('billing_plan: "standard"');
  expect(oauth).toContain('billing_duration: "trial"');
 });
 it("clears stale registration state for normal OAuth login",()=>{
  expect(oauth).toContain('localStorage.removeItem("registration_mfa_required")');
  expect(oauth).toContain('localStorage.removeItem("pending_social_registration")');
 });
 it("applies only a whitelisted account type and preserves existing provider metadata",()=>{
  expect(callback).toContain("SOCIAL_ACCOUNT_TYPES");
  expect(callback).toContain("SOCIAL_ACCOUNT_TYPES.has(accountType)");
  expect(callback).toContain("data: { ...existing, ...additions }");
  expect(callback).toContain("supabase.auth.updateUser");
 });
 it("replaces an interrupted unverified TOTP enrollment so QR data is available again",()=>{
  expect(callback).toContain('item.status === "unverified"');
  expect(callback).toContain("supabase.auth.mfa.unenroll");
  expect(callback).toContain("supabase.auth.mfa.enroll");
  expect(callback.indexOf("supabase.auth.mfa.unenroll")).toBeLessThan(callback.lastIndexOf("supabase.auth.mfa.enroll"));
 });
});
