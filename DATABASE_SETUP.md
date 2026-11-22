# Justice Connect — PostgreSQL Database Setup & Management Guide

This document provides complete, independent instructions for accessing, managing, querying, modifying, and backing up the PostgreSQL database used by **Justice Connect**.

You do **not** depend on Antigravity or any automated assistant to maintain, inspect, or modify your database. Follow these steps whenever you need direct control.

---

## 1. PostgreSQL Provider & Web Dashboard

### 1.1 Provider Information
- **Provider**: **Neon Serverless PostgreSQL** (AWS Cloud)
- **Region**: `ap-southeast-1` (Singapore)
- **Database Engine**: PostgreSQL 16 / 17
- **Database Name**: `neondb`
- **Default Owner User**: `neondb_owner`

### 1.2 Accessing the Neon Web Console
1. Open your web browser and navigate to:
   **[https://console.neon.tech/](https://console.neon.tech/)**
2. Sign in with your Neon account credentials (email / GitHub / Google).
3. Select your project: **`restless-water-b3h5qc3a`** (or the project corresponding to your endpoint).
4. You are now on the Project Dashboard. Here you can see:
   - Compute status (Active / Idle)
   - Storage usage and branch information
   - Connection details widget

---

## 2. Accessing the Built-in SQL Editor & Viewing Data

### 2.1 Using Neon SQL Editor (In Browser)
You do not need to install any software to run SQL queries:
1. In the Neon Console left-hand sidebar, click **"SQL Editor"**.
2. Select your branch (usually `main`) and database (`neondb`).
3. Type any SQL query and click **"Run"** (or press `Ctrl + Enter` / `Cmd + Enter`).

#### Example Queries:
- **View all submitted cases with their JC numbers:**
  ```sql
  SELECT id, case_number, title, category, court, location, current_status, filing_date
  FROM cases
  ORDER BY id DESC;
  ```
- **View cases submitted by a specific citizen (e.g. user ID 1):**
  ```sql
  SELECT c.id, c.case_number, c.title, c.category, u.name as citizen_name, u.email
  FROM cases c
  JOIN users u ON c.citizen_id = u.id
  WHERE c.citizen_id = 1;
  ```
- **Inspect the sequence counter for JC numbers:**
  ```sql
  SELECT * FROM case_sequences;
  ```

### 2.2 Viewing Tables and Records Visually (Tables UI)
1. In the Neon Console left-hand sidebar, click **"Tables"**.
2. Select schema: `public`.
3. Click on any table name (e.g., `cases`, `users`, `lawyers`, `hearings`, `documents`, `complaints`, `case_sequences`).
4. The web interface displays a paginated spreadsheet-like grid of records.

---

## 3. Safely Editing, Adding, and Deleting Records

### 3.1 Best Practices
- **Always use a `WHERE` clause** with primary keys (`id`) when updating or deleting.
- **Wrap changes in a transaction** so you can review before committing:
  ```sql
  BEGIN;
  -- Your update/delete statement here
  UPDATE cases SET current_status = 'Under review' WHERE id = 10;
  -- If looks good:
  COMMIT;
  -- If mistake made:
  ROLLBACK;
  ```

### 3.2 Common Administrative Operations

#### Update a Case Status:
```sql
UPDATE cases
SET current_status = 'Evidence Review', monitoring_status = 'Needs Attention'
WHERE case_number = 'JC-2026-000184';
```

#### Assign a Lawyer to a Case:
```sql
UPDATE cases
SET lawyer_id = 1
WHERE id = 5;
```

#### Safely Delete a Test Record:
```sql
-- First remove child records if foreign keys exist
DELETE FROM hearings WHERE case_id = 999;
DELETE FROM documents WHERE case_id = 999;
DELETE FROM cases WHERE id = 999;
```

---

## 4. Connecting via GUI Clients (DBeaver & pgAdmin)

You can connect directly from your desktop computer to manage PostgreSQL.

### 4.1 Obtaining Your Connection Details
Your connection string is stored in your environment file (`.env`):
```text
DATABASE_URL=postgresql://neondb_owner:<PASSWORD>@ep-restless-water-b3h5qc3a-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Broken down into individual connection parameters:
| Parameter | Value |
| :--- | :--- |
| **Host / Server** | `ep-restless-water-b3h5qc3a-pooler.c-4.ap-southeast-1.aws.neon.tech` |
| **Port** | `5432` |
| **Database** | `neondb` |
| **Username** | `neondb_owner` |
| **Password** | (Your password from `DATABASE_URL` / Neon dashboard) |
| **SSL Mode** | **`require`** (Mandatory for cloud connections) |

---

### 4.2 Connecting with DBeaver
1. Download and open **[DBeaver Community](https://dbeaver.io/)**.
2. Click **Database** → **New Database Connection**.
3. Choose **PostgreSQL** and click **Next**.
4. In the **Main** tab:
   - **Host**: `ep-restless-water-b3h5qc3a-pooler.c-4.ap-southeast-1.aws.neon.tech`
   - **Port**: `5432`
   - **Database**: `neondb`
   - **Authentication**: `Database Native`
   - **Username**: `neondb_owner`
   - **Password**: `<YOUR_PASSWORD>`
5. In the **SSL** tab:
   - Check **"Use SSL"**.
   - Set **SSL mode** to **`require`**.
6. Click **Test Connection ...**.
   - If prompted to download driver files, click **Download**.
   - You will see `"Connected: PostgreSQL ..."`.
7. Click **Finish**. You can now browse tables, double-click rows to edit values, and run SQL queries in DBeaver.

---

### 4.3 Connecting with pgAdmin 4
1. Open **pgAdmin 4**.
2. Right-click **Servers** in the Object Explorer → **Register** → **Server...**.
3. In the **General** tab:
   - **Name**: `Justice Connect Neon DB`
4. In the **Connection** tab:
   - **Host name/address**: `ep-restless-water-b3h5qc3a-pooler.c-4.ap-southeast-1.aws.neon.tech`
   - **Port**: `5432`
   - **Maintenance database**: `neondb`
   - **Username**: `neondb_owner`
   - **Password**: `<YOUR_PASSWORD>`
   - Check **"Save password?"** if desired.
5. In the **Parameters** (or **SSL**) tab:
   - **SSL mode**: `Require`
6. Click **Save**.
7. Expand `Justice Connect Neon DB` → `Databases` → `neondb` → `Schemas` → `public` → `Tables`.

---

## 5. Modifying Database Schema Later Using Drizzle ORM

Justice Connect uses **Drizzle ORM** with schema definitions located in:
`lib/db/src/schema/justice.ts`

### 5.1 Step 1: Edit Schema Definitions
Open `lib/db/src/schema/justice.ts` and add or modify your table columns.

Example: Adding a new field to `casesTable`:
```typescript
export const casesTable = pgTable("cases", {
  // ... existing columns ...
  urgencyLevel: text("urgency_level").notNull().default("Normal"),
});
```

### 5.2 Step 2: Push Schema Changes to PostgreSQL
To synchronize your Drizzle schema directly with your live PostgreSQL database, run:

```bash
pnpm --filter @workspace/db run push
```

Drizzle Kit inspects your PostgreSQL database, generates the necessary SQL `ALTER TABLE` statements, and safely applies them to the database.

---

## 6. Database Backups & Restoring

### 6.1 Creating a Full Database Backup via `pg_dump`
Run this command from any computer with PostgreSQL client tools installed:

```bash
pg_dump "postgresql://neondb_owner:<PASSWORD>@ep-restless-water-b3h5qc3a-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" \
  -F c -b -v -f justice_connect_backup_$(date +%Y%m%d).dump
```
- `-F c`: Custom binary compressed format (fast and flexible).
- `-b`: Include large objects.
- `-v`: Verbose output.

### 6.2 Restoring from a Backup via `pg_restore`
```bash
pg_restore -d "postgresql://neondb_owner:<PASSWORD>@<HOST>/neondb?sslmode=require" \
  -v --clean --if-exists justice_connect_backup_YYYYMMDD.dump
```

### 6.3 Instant Point-in-Time Restore via Neon Branches
Neon provides continuous WAL archiving (Point-in-Time Restore):
1. In **Neon Console**, navigate to **Branches**.
2. Click **New Branch**.
3. Under **Branch from**, select **"Point in time"** or a previous timestamp.
4. Neon instantly creates an exact replica of your database from that historical moment without downtime.

---

## 7. Production Hosting & Environment Variables

When deploying the backend and frontend to any cloud host (e.g. Render, Railway, Vercel, Fly.io, AWS, Docker):

1. **Set `DATABASE_URL` as a secret environment variable**:
   - In your hosting platform settings, add `DATABASE_URL` as an environment secret.
   - Never commit passwords or connection strings to git.
2. **Ensure SSL is enabled**:
   - Always append `?sslmode=require` to the `DATABASE_URL`.
3. **Frontend Isolation**:
   - `DATABASE_URL` is only used by the Node.js API server (`artifacts/api-server`) and `lib/db`.
   - The React frontend (`artifacts/justice-connect`) **never** has access to `DATABASE_URL`. All data access is strictly mediated by authenticated Express API routes with JWT authentication and RBAC checks.
