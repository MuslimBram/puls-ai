import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("B8 Storage Isolation V4 Tests (Workspace Shared Knowledge Base & Strict Isolation)", () => {
  describe("STATIC CONTRACT TESTS", () => {
    it("1. Verifies 20260816214000_b8_storage_isolation.sql uses safe text comparison, preflight check, and public=false bucket enforcement", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const b8MigrationFile = files.find((f) => f.includes("b8_storage_isolation"));

      expect(b8MigrationFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, b8MigrationFile!), "utf-8");

      // Bucket privacy enforcement
      expect(content).toContain("ON CONFLICT (id) DO UPDATE SET public = false;");

      // Preflight check against legacy objects
      expect(content).toContain("Preflight failed:");
      expect(content).toContain("(storage.foldername(name))[2] IS NULL");

      // Exact policy inventory replacements
      expect(content).toContain('CREATE POLICY "knowledge_select_auth"');
      expect(content).toContain('CREATE POLICY "knowledge_insert_auth"');
      expect(content).toContain('CREATE POLICY "knowledge_delete_auth"');
      expect(content).toContain('CREATE POLICY "recordings_select_auth"');

      // Safe path parsing: NO raw ::uuid cast on foldername(name)
      expect(content).not.toContain("(storage.foldername(name))[2]::uuid");
      expect(content).not.toContain("(storage.foldername(name))[1]::uuid");
    });

    it("2. Verifies knowledge_select_auth allows workspace members to share Knowledge Base documents (no folder1=auth.uid() restriction on SELECT)", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const b8MigrationFile = files.find((f) => f.includes("b8_storage_isolation"));

      expect(b8MigrationFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, b8MigrationFile!), "utf-8");

      const selectSection = content.split('CREATE POLICY "knowledge_select_auth"')[1]?.split(";")[0] || "";

      expect(selectSection).toContain("bucket_id = 'knowledge-documents'");
      expect(selectSection).toContain("wm.workspace_id::text = (storage.foldername(name))[2]");

      // Crucial Knowledge Base sharing rule: SELECT does NOT require (storage.foldername(name))[1] = auth.uid()::text!
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
            // Workspace shared: Any member of workspace in folder 2 can read
            if (!userJwt.workspaceMemberships.includes(wsId)) {
              return { allowed: false, reason: "Non-workspace member SELECT denied" };
            }
            return { allowed: true };
          }

          if (operation === "INSERT" || operation === "DELETE") {
            // Uploader owns folder 1 AND is a workspace member
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
      const userB = { uid: "user-B", workspaceMemberships: ["ws-shared-1"] }; // Same workspace member!
      const userC = { uid: "user-C", workspaceMemberships: ["ws-other-2"] };  // Outside user!

      // User A uploads document to ws-shared-1 -> PASS
      expect(simulateStorageAccess("knowledge-documents", "INSERT", "user-A/ws-shared-1/doc.pdf", userA).allowed).toBe(true);

      // User B (teammate in ws-shared-1) reads User A's uploaded document -> PASS (Workspace Shared Knowledge Base)
      expect(simulateStorageAccess("knowledge-documents", "SELECT", "user-A/ws-shared-1/doc.pdf", userB).allowed).toBe(true);

      // User C (outside user) attempts to read User A's document -> DENY (cross-workspace)
      expect(simulateStorageAccess("knowledge-documents", "SELECT", "user-A/ws-shared-1/doc.pdf", userC).allowed).toBe(false);

      // User B attempts to delete User A's document -> DENY (only uploader can delete)
      expect(simulateStorageAccess("knowledge-documents", "DELETE", "user-A/ws-shared-1/doc.pdf", userB).allowed).toBe(false);
    });
  });

  describe("RUNTIME INTEGRATION — SKIPPED", () => {
    it.skip("Requires real test DB / staging storage environment", () => {
      // Skipped until real test DB / staging credentials are available
    });
  });
});
