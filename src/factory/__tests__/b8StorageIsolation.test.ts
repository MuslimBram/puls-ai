import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("B8 Storage Isolation — Workspace Shared Knowledge Base & Strict Least Privilege", () => {
  describe("STATIC CONTRACT TESTS", () => {
    it("1. Verifies 20260821122000_b8_storage_isolation.sql uses safe text comparison, preflight check, and public=false bucket enforcement", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const migFile = files.find((f) => f.includes("b8_storage_isolation"));

      expect(migFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, migFile!), "utf-8");

      // Bucket privacy enforcement
      expect(content).toContain("ON CONFLICT (id) DO UPDATE SET public = false;");

      // Preflight guard for legacy objects
      expect(content).toContain("Preflight failed:");
      expect(content).toContain("(storage.foldername(name))[2] IS NULL");

      // All four named policies must be present
      expect(content).toContain('CREATE POLICY "knowledge_select_auth"');
      expect(content).toContain('CREATE POLICY "knowledge_insert_auth"');
      expect(content).toContain('CREATE POLICY "knowledge_delete_auth"');
      expect(content).toContain('CREATE POLICY "recordings_select_auth"');

      // Safe path parsing: no raw ::uuid cast on foldername result
      expect(content).not.toContain("(storage.foldername(name))[2]::uuid");
      expect(content).not.toContain("(storage.foldername(name))[1]::uuid");
    });

    it("2. Verifies knowledge_select_auth allows workspace members to share Knowledge Base documents (no folder[1]=auth.uid() restriction on SELECT)", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const migFile = files.find((f) => f.includes("b8_storage_isolation"));

      expect(migFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, migFile!), "utf-8");

      const selectSection =
        content.split('CREATE POLICY "knowledge_select_auth"')[1]?.split(";")[0] ?? "";

      expect(selectSection).toContain("bucket_id = 'knowledge-documents'");
      expect(selectSection).toContain("wm.workspace_id::text = (storage.foldername(name))[2]");

      // Workspace sharing: SELECT must NOT require foldername[1] = auth.uid()
      expect(selectSection).not.toContain("(storage.foldername(name))[1] = auth.uid()::text");
    });
  });

  describe("UNIT SIMULATION TESTS", () => {
    it("1. Simulates workspace shared Knowledge Base access (User B can read User A's document in shared workspace)", () => {
      const simulateStorageAccess = (
        bucketId: string,
        operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE",
        path: string,
        userJwt: { uid: string; workspaceMemberships: string[] }
      ) => {
        const segments = path.split("/");

        if (bucketId === "knowledge-documents") {
          if (operation === "UPDATE") return { allowed: false, reason: "UPDATE not granted" };

          const uploaderUid = segments[0];
          const wsId = segments[1];

          if (!wsId || wsId.trim() === "") {
            return { allowed: false, reason: "Legacy path without workspace denied" };
          }

          if (operation === "SELECT") {
            if (!userJwt.workspaceMemberships.includes(wsId)) {
              return { allowed: false, reason: "Non-workspace member SELECT denied" };
            }
            return { allowed: true };
          }

          if (operation === "INSERT" || operation === "DELETE") {
            if (uploaderUid !== userJwt.uid) {
              return { allowed: false, reason: "Non-uploader write denied" };
            }
            if (!userJwt.workspaceMemberships.includes(wsId)) {
              return { allowed: false, reason: "Non-workspace member write denied" };
            }
            return { allowed: true };
          }
        }

        if (bucketId === "recordings") {
          if (operation !== "SELECT") {
            return { allowed: false, reason: "Only SELECT granted to authenticated for recordings" };
          }
          const wsId = segments[0];
          if (!wsId || !userJwt.workspaceMemberships.includes(wsId)) {
            return { allowed: false, reason: "Recordings cross-workspace denied" };
          }
          return { allowed: true };
        }

        return { allowed: false, reason: "Unknown bucket" };
      };

      const userA = { uid: "user-A", workspaceMemberships: ["ws-shared-1"] };
      const userB = { uid: "user-B", workspaceMemberships: ["ws-shared-1"] }; // same workspace
      const userC = { uid: "user-C", workspaceMemberships: ["ws-other-2"] };  // outside user

      // User A uploads to ws-shared-1 -> PASS
      expect(
        simulateStorageAccess("knowledge-documents", "INSERT", "user-A/ws-shared-1/doc.pdf", userA).allowed
      ).toBe(true);

      // User B (teammate) reads User A's document -> PASS (workspace Knowledge Base sharing)
      expect(
        simulateStorageAccess("knowledge-documents", "SELECT", "user-A/ws-shared-1/doc.pdf", userB).allowed
      ).toBe(true);

      // User C (outside) attempts to read -> DENY (cross-workspace)
      expect(
        simulateStorageAccess("knowledge-documents", "SELECT", "user-A/ws-shared-1/doc.pdf", userC).allowed
      ).toBe(false);

      // User B attempts to delete User A's document -> DENY (only uploader can delete)
      expect(
        simulateStorageAccess("knowledge-documents", "DELETE", "user-A/ws-shared-1/doc.pdf", userB).allowed
      ).toBe(false);

      // User A accesses recordings in their workspace -> PASS
      expect(
        simulateStorageAccess("recordings", "SELECT", "ws-shared-1/call-1/audio.mp3", userA).allowed
      ).toBe(true);

      // User C accesses recordings in ws-shared-1 -> DENY
      expect(
        simulateStorageAccess("recordings", "SELECT", "ws-shared-1/call-1/audio.mp3", userC).allowed
      ).toBe(false);

      // Nobody can INSERT to recordings via client (service_role only)
      expect(
        simulateStorageAccess("recordings", "INSERT", "ws-shared-1/call-1/audio.mp3", userA).allowed
      ).toBe(false);
    });
  });

  describe("RUNTIME INTEGRATION — SKIPPED", () => {
    it.skip("Requires real test DB / staging storage environment", () => {
      // Skipped until real test DB / staging credentials are available
    });
  });
});
