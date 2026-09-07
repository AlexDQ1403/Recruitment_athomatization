# Graph Report - .  (2026-08-05)

## Corpus Check
- Corpus is ~30,940 words - fits in a single context window. You may not need a graph.

## Summary
- 428 nodes · 602 edges · 40 communities (28 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend Layer
- Frontend Layer
- Backend Layer
- Frontend Layer
- Backend Layer
- Frontend Layer
- Backend Layer
- Frontend Layer
- Frontend Layer
- Backend Layer
- Data Models
- Frontend Layer
- Frontend Layer
- Frontend Layer
- Frontend Layer
- Features & Workflows
- Frontend Layer
- Frontend Layer
- Frontend Layer
- External Services
- Features & Workflows
- Frontend Layer
- Frontend Layer
- Data Models
- Data Models
- Data Models
- Data Models
- Features & Workflows
- Data Models
- Features & Workflows
- Features & Workflows

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `compilerOptions` - 14 edges
3. `useToast()` - 13 edges
4. `AppShell()` - 10 edges
5. `Candidate` - 10 edges
6. `supabase` - 8 edges
7. `scripts` - 7 edges
8. `scripts` - 7 edges
9. `ToastContainer()` - 7 edges
10. `candidateService` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Dashboard` ----> `Candidate Data Model`  [0.92]
  /FUNCIONALIDADES.md → /frontend/src/types/index.ts
- `Public Apply Portal` ----> `Candidate Data Model`  [0.93]
  /FUNCIONALIDADES.md → /frontend/src/types/index.ts
- `Vacancy Management` ----> `Vacancy Data Model`  [0.94]
  /FUNCIONALIDADES.md → /frontend/src/types/index.ts
- `Candidate Management` ----> `Candidate Data Model`  [0.94]
  /FUNCIONALIDADES.md → /frontend/src/types/index.ts
- `Kanban Board Component` ----> `Candidate Status Enum`  [0.92]
  /FUNCIONALIDADES.md → /frontend/src/types/index.ts

## Import Cycles
- None detected.

## Communities (40 total, 12 thin omitted)

### Community 0 - "Frontend Layer"
Cohesion: 0.06
Nodes (48): CandidatePanel(), fmt(), fmtDate(), fmtDateTime(), HistorialTab(), InfoTab(), NotasTab(), Props (+40 more)

### Community 1 - "Frontend Layer"
Cohesion: 0.08
Nodes (22): ForgotPasswordForm(), LoginForm(), ResetPasswordForm(), ChatView(), formatTime(), fetchSearchHistory(), fmtDate(), SearchHistoryView() (+14 more)

### Community 2 - "Backend Layer"
Cohesion: 0.11
Nodes (21): createApp(), config, envSchema, parsed, AppError, errorHandler(), chatLimiter, router (+13 more)

### Community 3 - "Frontend Layer"
Cohesion: 0.10
Nodes (20): FormData, ROLE_LABELS, UserManagement(), ConfirmModal(), Props, fmt(), fmtRange(), MODALITY_LABELS (+12 more)

### Community 4 - "Backend Layer"
Cohesion: 0.07
Nodes (27): dependencies, cors, express, express-rate-limit, helmet, @supabase/supabase-js, winston, winston-daily-rotate-file (+19 more)

### Community 5 - "Frontend Layer"
Cohesion: 0.07
Nodes (27): dependencies, next, react, react-dom, recharts, resend, @supabase/auth-helpers-nextjs, @supabase/supabase-js (+19 more)

### Community 6 - "Backend Layer"
Cohesion: 0.07
Nodes (27): devDependencies, jsdom, supertest, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, tsx, @types/cors (+19 more)

### Community 7 - "Frontend Layer"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 8 - "Frontend Layer"
Cohesion: 0.09
Nodes (23): devDependencies, jsdom, @testing-library/dom, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, @types/node, @types/react (+15 more)

### Community 9 - "Backend Layer"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+12 more)

### Community 10 - "Data Models"
Cohesion: 0.12
Nodes (20): Chat API Endpoint, Candidates View Component, Chat View Component, Kanban Board Component, Candidate Source Enum, Candidate Status Enum, AI Chat Search, Public Apply Portal (+12 more)

### Community 11 - "Frontend Layer"
Cohesion: 0.27
Nodes (7): ApplyVacancyForm(), EMPTY, fmt(), fmtRange(), FormData, MODALITY_LABELS, Step

### Community 12 - "Frontend Layer"
Cohesion: 0.36
Nodes (5): metadata, ApplyLanding(), fmt(), fmtRange(), MODALITY_LABELS

### Community 13 - "Frontend Layer"
Cohesion: 0.33
Nodes (4): instrumentSerif, jetbrainsMono, metadata, syne

### Community 14 - "Frontend Layer"
Cohesion: 0.33
Nodes (3): EMPTY, FormData, Step

### Community 15 - "Features & Workflows"
Cohesion: 0.40
Nodes (5): Vacancies View Component, Vacancy Modality Enum, Vacancy Status Enum, Vacancy Management, Vacancy Data Model

### Community 16 - "Frontend Layer"
Cohesion: 0.70
Nodes (4): GET(), getAdminClient(), POST(), verifySession()

### Community 17 - "Frontend Layer"
Cohesion: 0.50
Nodes (4): POST(), STATUS_LABELS, STATUS_MESSAGES, verifySession()

### Community 18 - "Frontend Layer"
Cohesion: 0.83
Nodes (3): DELETE(), getAdminClient(), verifySession()

## Knowledge Gaps
- **175 isolated node(s):** `name`, `version`, `private`, `dev`, `build` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Backend Layer` to `Backend Layer`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Frontend Layer` to `Frontend Layer`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _175 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.061955965181771634 - nodes in this community are weakly interconnected._
- **Should `Frontend Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.07770582793709528 - nodes in this community are weakly interconnected._
- **Should `Backend Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.10795454545454546 - nodes in this community are weakly interconnected._
- **Should `Frontend Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.1010752688172043 - nodes in this community are weakly interconnected._