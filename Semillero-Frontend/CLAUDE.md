# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Semillero** is a recruitment management platform for a Colombian company. Recruiters manage candidates and use an AI-powered natural-language chat to search candidates.

## Monorepo Structure

```
semillero/
├── backend/          # Express proxy for OpenAI only (port 3001)
├── frontend/         # Next.js 14 + TypeScript (port 3002)
└── docker-compose.yml
```

## Development Commands

### Backend (`cd backend`)
```bash
npm run dev        # tsx watch with hot reload (reads backend/.env)
npm run build      # tsc compile to dist/
npm run typecheck  # tsc --noEmit
```

### Frontend (`cd frontend`)
```bash
PORT=3002 npm run dev   # Next.js dev server (port 3000 may be taken)
npm run build
npm run typecheck
```

### Full stack (Docker)
```bash
docker compose up   # backend + frontend
```

## Environment Variables

**`backend/.env`** (required):
```
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3002
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

**`frontend/.env.local`** (required):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=http://localhost:3001
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # requerida para crear/eliminar usuarios
```

Backend config is validated at startup via Zod in `backend/src/config/index.ts`.

## Architecture

### Single source of truth: Supabase

All data lives in Supabase. The frontend reads and writes directly to Supabase for candidates, profiles, and chat history. The Express backend exists **only** to proxy OpenAI calls (keeps the API key server-side).

### Auth

Supabase Auth is the only identity provider. The frontend uses `frontend/src/lib/supabase.ts` directly. Roles: `superAdmin | recruiter` stored in the `profiles` table.

### Chat — AI search flow

1. User message → `frontend/src/app/api/chat/route.ts` (Next.js proxy, adds auth header)
2. → `backend/src/routes/chat.ts` (validates Supabase token, fetches history from `chat_history`)
3. → OpenAI `gpt-4o-mini` with system prompt + non-sensitive candidate fields
4. GPT returns `{ message, candidate_ids[] }` → backend fetches full records from Supabase
5. Response saved to `chat_history`; fallback: keyword matching if JSON parse fails

System prompt has hardcoded prompt injection guards. Max message length: 1000 chars. Rate limit: 20 req/min on `/api/chat`.

### User management

`superAdmin` only. Frontend calls Next.js API routes at `frontend/src/app/api/admin/users/`:
- `GET /api/admin/users` — reads from `profiles` table
- `POST /api/admin/users` — creates via Supabase Admin SDK (requires `SUPABASE_SERVICE_ROLE_KEY`)
- `DELETE /api/admin/users/[id]` — deletes via Supabase Admin SDK

### Frontend routing

Next.js App Router. All pages except `/login`, `/forgot-password`, `/reset-password` require auth via `AppShell`, which verifies Supabase session on mount and refreshes the user profile from `profiles` on each load.

### Backend API routes (Express)

| Route | File | Auth |
|---|---|---|
| `POST /api/chat` | `routes/chat.ts` | Supabase token |
| `GET /health` | inline | Public |

Global rate limit: 100 req/15min per IP.

### Candidate data model

Single schema in `frontend/src/types/index.ts` — `full_name`, `position` required; optional: `email`, `phone`, `experience_years`, `expected_salary`, `location`, `source`, `resume_url`, `profile_url`, `linkedin_url`. Backed by `public.candidates` in Supabase (`backend/src/db/migrations/002_supabase_schema.sql`).

### Candidate data sources

The `/candidates` page shows three tabs:
- **supabase** — from Supabase via `frontend/src/services/candidateService.ts`
- **base** — live fetch from a public Google Sheet (`BaseReclutamiento`) via `useGoogleSheets`
- **n8n** — live fetch from a second public Google Sheet (`ListadoCandidatos`) via `useGoogleSheets`

Sheet IDs are hardcoded in `frontend/src/hooks/useGoogleSheets.ts`. Both sheets must be publicly readable.

### Logging & Tracing

Winston with daily rotation (`backend/src/utils/logger.ts`). All routes attach a correlation ID via `correlationMiddleware` (`backend/src/utils/tracing.ts`).

### n8n Automation

Separate layer (port 5678). Scrapes candidates from LinkedIn via SerpApi, classifies with OpenRouter/DeepSeek, stores results in Google Sheets and Supabase `candidates`. Not part of this repo's main source.

### Tests

No tests yet. TypeScript type checking (`npm run typecheck`) is the main static verification. Adding Vitest is planned (FASE 2 of PLAN.md).
