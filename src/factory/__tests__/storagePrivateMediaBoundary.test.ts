import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const migration = read("supabase", "migrations", "20260829195000_storage_private_media_boundary.sql");
const hook = read("src", "hooks", "useCallRecording.ts");

describe("storage private media boundary", () => {
  it("makes generated media private and keeps storage policies auth/workspace bound", () => {
    expect(migration).toContain("UPDATE storage.buckets SET public=false WHERE id='generated-media'");
    expect(migration).toContain("public.has_workspace_access(((storage.foldername(name))[1])::uuid)");
    expect(migration).toContain("ON storage.objects FOR ALL TO authenticated");
  });

  it("stores call recordings in the private recordings bucket", () => {
    expect(hook).toContain('.from("recordings")');
    expect(hook).toContain("createSignedUrl(recording.storage_path, 60 * 60)");
    expect(hook).toContain("storage_url: null");
    expect(hook).not.toContain('.from("generated-media")');
    expect(hook).not.toContain("getPublicUrl(storagePath)");
  });

  it("workspace scopes call recording reads", () => {
    expect(hook).toContain('.eq("workspace_id", workspace.id)');
    expect(hook).toContain('queryKey: ["call-recordings", workspace?.id, callRecordId]');
  });
});
