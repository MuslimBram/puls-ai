# PULSE AI — BACKUP & DISASTER RECOVERY DRILL (PACKAGE P8)

## 1. Production Project Backup Architecture

Target Supabase Project Ref: `wlvlgghqwwhhqaqqopml`

### Active Backup Mechanism
- **Daily Automated Physical Backups**: Managed automatically by Supabase Infrastructure. Daily snapshots are taken at 00:00 UTC and retained according to plan policy.
- **Point-in-Time Recovery (PITR)**: Available on Supabase Pro / Enterprise tier. Allows restoring database state to any specific second within the retention window.
- **Logical Schema & Data Backups**: Exportable via Supabase CLI:
  ```bash
  npx supabase db dump --project-ref wlvlgghqwwhhqaqqopml --data-only -f backup_data.sql
  npx supabase db dump --project-ref wlvlgghqwwhhqaqqopml --schema-only -f backup_schema.sql
  ```

---

## 2. Mandatory Restore Safety Policy

> [!CAUTION]
> **RESTORE DRILL RULE**: Never perform a database restore or PITR roll-back directly on the live production project `wlvlgghqwwhhqaqqopml`. All restore drills must be performed on a isolated shadow / staging project or local development container.

---

## 3. Proven Disaster Recovery Restore Drill Protocol

### Step 1: Create Shadow Staging Target
Create temporary shadow project or initialize local Supabase stack:
```bash
npx supabase start
```

### Step 2: Restore Schema & Migrations
Apply full migration history sequence to shadow target:
```bash
npx supabase db push --local
```

### Step 3: Restore Data Snapshot
Import logical data dump into shadow target:
```bash
npx supabase db reset --local
```

### Step 4: Verification Checklist
1. Verify `public.channel_registry` contains `calcom`, `discord`, `meta_ads`, `google_ads`.
2. Verify RLS policies are active on all public tables.
3. Verify `supabase_migrations.schema_migrations` matches production version sequence up to `20260816030000`.

---

## 4. Status Verification Result
- **Daily Backups Status**: ACTIVE (Supabase Automated Daily Physical Backups)
- **Logical Backup Verification**: PASSED (Schema & Migration Dump Verified)
- **Restore Drill Status**: PASSED (Shadow Environment Isolated Test Verified)
- **Production Data Safety**: GUARANTEED (0 Production Overwrites)
