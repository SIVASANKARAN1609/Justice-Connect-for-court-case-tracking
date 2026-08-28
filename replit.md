# Justice Connect

Justice Connect is an academic civic-tech prototype that helps people understand, organize, and navigate fictional justice-related information.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/justice-connect run dev` — run the responsive web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Development setup: run `pnpm --filter @workspace/db run push` once before starting the API server so the sample schema exists.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/justice-connect/src/App.tsx` — frontend routes, demo dashboards, and prototype interactions
- `artifacts/justice-connect/src/index.css` — shared theme tokens and civic-tech visual language
- `artifacts/api-server/src/routes/justice.ts` — REST endpoints for the sample workflows
- `lib/db/src/schema/justice.ts` — PostgreSQL/Drizzle schema
- `artifacts/api-server/src/lib/seed.ts` — fictional demo data and demo accounts

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

The current demo includes a landing page, simple role-based sign-in, citizen case overview, case timelines, document records, document explainer, sample lawyer directory, ask-a-lawyer flow, complaint guidance, legal awareness, lawyer workspace, and admin workspace. All records are fictional and designed for academic demonstration only.

## User preferences

- Prioritize a fast, presentable frontend first; deeper backend workflows can be expanded incrementally.

## Gotchas

- The API seeds on startup and expects the development database schema to exist first.
- This is not a legal service; keep fictional sample data and disclaimers visible throughout the experience.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
