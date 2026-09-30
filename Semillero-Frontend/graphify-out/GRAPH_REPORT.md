# Graph Report - .  (2026-09-29)

## Corpus Check
- 157 files · ~87,811 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 704 nodes · 1060 edges · 71 communities (53 shown, 18 thin omitted)
- Extraction: 93% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.82)
- Token cost: 250,000 input · 27,952 output

## Community Hubs (Navigation)
- Recruiter Candidate Views
- Candidate Portal Pages
- Backend TS Config
- Backend Test Dependencies
- Chat AI Search Design
- Fullstack Architecture Patterns
- Public Apply Vacancy Flow
- Multi-Role Registration Pages
- Backend Package Dependencies
- Frontend Package Dependencies
- Candidate Data Sources
- Backend App & Company Auth
- Password Recovery Flow
- Chat Route Backend Logic
- Backend Config & Recruiters Route
- Error Handling & n8n Webhook
- Candidate Service Tests
- Registration Backend Route
- n8n Outbound Webhook Service
- CI & Docker Services
- Session Audit Route
- Graphify Pipeline Steps
- Candidate Status Route
- Root Layout & Fonts
- Apply Form Component
- Vacancy Data Model
- Fase 0 Setup & n8n Webhook
- Admin Users API Route
- Status Notification Route
- Graphify Build & Health Check
- Admin User Delete Route
- Candidate Profile API Route
- Notification Email Service
- Auth Roles Overview
- Super Admin User Management
- Next.js Config
- Next Env Types
- Legacy Role Docs
- Architecture Overview Docs
- Apply API Endpoint
- User CRUD API Routes
- Logging & Tracing
- Apply Landing Component
- Backend Env Config
- Roles/Estados Migration Notes
- Search History Table
- User Management Docs (stale)
- User Data Model
- Candidate Application Workflow
- Candidate Status Workflow

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 19 edges
2. `compilerOptions` - 16 edges
3. `AppShell()` - 15 edges
4. `config` - 14 edges
5. `logger` - 14 edges
6. `compilerOptions` - 14 edges
7. `supabase` - 13 edges
8. `Fullstack Guardian Skill (.agents)` - 11 edges
9. `Fullstack Guardian Skill (.claude)` - 11 edges
10. `ToastContainer()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Estrategia de Transición (deuda técnica deliberada)` --conceptually_related_to--> `Candidate Data Model`  [INFERRED]
  specs/registro_multi_rol_design.md → /frontend/src/types/index.ts
- `Candidate Data Sources (3 tabs)` --references--> `Candidate Data Model`  [EXTRACTED]
  CLAUDE.md → /frontend/src/types/index.ts
- `n8n Automation Layer` --references--> `Candidate Data Model`  [EXTRACTED]
  CLAUDE.md → /frontend/src/types/index.ts
- `Fullstack Guardian Skill (.agents)` --semantically_similar_to--> `Fullstack Guardian Skill (.claude)`  [INFERRED] [semantically similar]
  .agents/skills/fullstack-guardian/SKILL.md → .claude/skills/fullstack-guardian/SKILL.md
- `API Design Standards (.agents)` --semantically_similar_to--> `API Design Standards (.claude)`  [INFERRED] [semantically similar]
  .agents/skills/fullstack-guardian/references/api-design-standards.md → .claude/skills/fullstack-guardian/references/api-design-standards.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Perspective Security Workflow (Design, Security Checklist, Deliverables)** — agents_skills_fullstack_guardian_skill_fullstack_guardian, agents_skills_fullstack_guardian_references_design_template_design_template, agents_skills_fullstack_guardian_references_security_checklist_security_checklist, agents_skills_fullstack_guardian_references_deliverables_checklist_deliverables_checklist [EXTRACTED 0.90]
- **Monolith vs Microservices Decision Group** — agents_skills_fullstack_guardian_references_architecture_decisions_architecture_decisions, agents_skills_fullstack_guardian_references_architecture_decisions_modular_monolith, agents_skills_fullstack_guardian_references_backend_patterns_backend_patterns, agents_skills_fullstack_guardian_references_integration_patterns_integration_patterns [INFERRED 0.75]
- **Candidate Enum/Migration Normalization Effort** — full_excec_fase1_normalizacion_esquema, hybridmethod_fase0_corrections, ejecutar_fase_0_migration_006, fase_0_setup_migration_006 [INFERRED 0.75]
- **n8n Webhook Security & Integration** — specs_db_security_design_c1_webhook_no_auth, full_excec_n8n_service, hybridmethod_fase3_corrections, backend_n8n_docker_compose_n8n_service [INFERRED 0.75]
- **Chat AI Search Flow Documentation** — claude_chat_ai_search_flow, readme_chat_flow, funcionalidades_chat_ia [INFERRED 0.85]

## Communities (71 total, 18 thin omitted)

### Community 0 - "Recruiter Candidate Views"
Cohesion: 0.06
Nodes (56): FormData, ROLE_LABELS, UserManagement(), CandidateApplicationsView(), formatSalary(), STATUS_CLASS, VacancyCard(), CandidateProfileView() (+48 more)

### Community 1 - "Candidate Portal Pages"
Cohesion: 0.05
Nodes (41): LoginForm(), ChatView(), formatTime(), tempId(), fetchSearchHistory(), fmtDate(), SearchHistoryView(), DashboardView() (+33 more)

### Community 2 - "Backend TS Config"
Cohesion: 0.04
Nodes (45): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+37 more)

### Community 3 - "Backend Test Dependencies"
Cohesion: 0.05
Nodes (43): devDependencies, jsdom, supertest, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, tsx, @types/cors (+35 more)

### Community 4 - "Chat AI Search Design"
Cohesion: 0.06
Nodes (38): Chat AI Search Flow, Supabase as Single Source of Truth, SAFE_CANDIDATE_FIELDS excludes email/linkedin, companyAuthMiddleware, FASE 0: Pre-work & Cleanup, FASE 1: Normalización de Esquema BD, FASE 2: Company-Scoped Recruiter Management, FASE 3: Chat Session Migration & Company-Scoped Search (+30 more)

### Community 5 - "Fullstack Architecture Patterns"
Cohesion: 0.08
Nodes (36): API Design Standards (.agents), Architecture Decision Guide (.agents), BFF Pattern (Backend for Frontend), JWT vs Session Hybrid Auth Strategy, Modular Monolith, Backend Patterns (.agents), Circuit Breaker Pattern, Saga Pattern (Distributed Transactions) (+28 more)

### Community 6 - "Public Apply Vacancy Flow"
Cohesion: 0.08
Nodes (24): metadata, ApplyLanding(), fmt(), fmtRange(), MODALITY_LABELS, ApplyVacancyForm(), EMPTY, fmt() (+16 more)

### Community 7 - "Multi-Role Registration Pages"
Cohesion: 0.09
Nodes (19): COPY, RegisterForm(), Variant, Alert(), AlertAction, AlertSeverity, ICON, Props (+11 more)

### Community 8 - "Backend Package Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, cors, express, express-rate-limit, helmet, @supabase/supabase-js, winston, winston-daily-rotate-file (+20 more)

### Community 9 - "Frontend Package Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, next, react, react-dom, recharts, resend, @supabase/auth-helpers-nextjs, @tanstack/react-query (+17 more)

### Community 10 - "Candidate Data Sources"
Cohesion: 0.09
Nodes (24): Chat API Endpoint, n8n Docker Service, Candidate Data Sources (3 tabs), n8n Automation Layer, Candidates View Component, Chat View Component, Kanban Board Component, Candidate Source Enum (+16 more)

### Community 11 - "Backend App & Company Auth"
Cohesion: 0.18
Nodes (16): createApp(), AuthenticatedRequest, companyAuthMiddleware(), supabase, AppRole, requireCompany(), requireRole(), router (+8 more)

### Community 12 - "Password Recovery Flow"
Cohesion: 0.13
Nodes (11): ForgotPasswordForm(), ResetPasswordForm(), CANDIDATO_NAV, EMPRESA_NAV, NAV, Props, ROLE_LABEL, Sidebar() (+3 more)

### Community 13 - "Chat Route Backend Logic"
Cohesion: 0.14
Nodes (8): chatLimiter, router, SAFE_CANDIDATE_FIELDS, supabase, supabaseAdmin, buildApp(), mockFrom, mockGetUser

### Community 14 - "Backend Config & Recruiters Route"
Cohesion: 0.18
Nodes (9): config, envSchema, parsed, recruiterLimiter, router, supabase, supabaseAdmin, app (+1 more)

### Community 15 - "Error Handling & n8n Webhook"
Cohesion: 0.26
Nodes (7): AppError, errorHandler(), router, supabaseAdmin, addCorrelationId, correlationStorage, getCorrelationId()

### Community 16 - "Candidate Service Tests"
Cohesion: 0.22
Nodes (7): mockEq, mockGte, mockIlike, mockLte, mockOrder, mockRange, mockSelect

### Community 17 - "Registration Backend Route"
Cohesion: 0.25
Nodes (7): candidateSchema, companySchema, GENERIC_OK, passwordSchema, registerLimiter, router, supabaseAdmin

### Community 18 - "n8n Outbound Webhook Service"
Cohesion: 0.39
Nodes (7): callN8nOutboundWebhook(), N8nEventType, N8nPayload, triggerCandidateShortage(), triggerInterviewRequest(), triggerLowConfidenceResults(), triggerNoSearchResults()

### Community 19 - "CI & Docker Services"
Cohesion: 0.33
Nodes (7): Backend CI Job, Frontend CI Job, Monorepo Structure (backend/frontend), Semillero Recruitment Platform, Backend Service (Docker), Frontend Service (Docker), CI section

### Community 20 - "Session Audit Route"
Cohesion: 0.29
Nodes (5): failedLoginLimiter, router, sessionLimiter, supabaseAdmin, VALID_REASONS

### Community 21 - "Graphify Pipeline Steps"
Cohesion: 0.33
Nodes (6): Extraction Cache (Step B0), /graphify command, Honesty Rules, /graphify query, Semantic Extraction (LLM, Part B), AST Structural Extraction (Part A)

### Community 22 - "Candidate Status Route"
Cohesion: 0.33
Nodes (5): ALLOWED_TRANSITIONS, CandidateStatus, router, supabaseAdmin, VALID_STATUSES

### Community 23 - "Root Layout & Fonts"
Cohesion: 0.33
Nodes (4): instrumentSerif, jetbrainsMono, metadata, syne

### Community 24 - "Apply Form Component"
Cohesion: 0.33
Nodes (3): EMPTY, FormData, Step

### Community 25 - "Vacancy Data Model"
Cohesion: 0.40
Nodes (5): Vacancies View Component, Vacancy Modality Enum, Vacancy Status Enum, Vacancy Management, Vacancy Data Model

### Community 26 - "Fase 0 Setup & n8n Webhook"
Cohesion: 0.40
Nodes (5): FASE 0 Checklist, Migration 006_empresa_jerarquia.sql, n8n Webhook Test Procedure, Migration 006_empresa_jerarquia.sql (setup guide), n8n Webhook Configuration

### Community 27 - "Admin Users API Route"
Cohesion: 0.70
Nodes (4): GET(), getAdminClient(), POST(), verifySession()

### Community 28 - "Status Notification Route"
Cohesion: 0.50
Nodes (4): POST(), STATUS_LABELS, STATUS_MESSAGES, verifySession()

### Community 29 - "Graphify Build & Health Check"
Cohesion: 0.50
Nodes (4): Community Labeling (Step 5), Build Graph & Cluster (Step 4), Graph Health Check (Step 4.5), #479 Shrink Guard

### Community 30 - "Admin User Delete Route"
Cohesion: 0.83
Nodes (3): DELETE(), getAdminClient(), verifySession()

### Community 31 - "Candidate Profile API Route"
Cohesion: 0.83
Nodes (3): forward(), GET(), PATCH()

## Ambiguous Edges - Review These
- `Roles de usuario (superAdmin/recruiter)` → `Roles de usuario table`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Portal Público de Aplicación (/apply)` → `FASE 1: Normalización de Esquema BD`  [AMBIGUOUS]
  FUNCIONALIDADES.md · relation: conceptually_related_to
- `FASE 5: Server-Side Route Protection & RLS Enforcement` → `FASE 5 Correcciones (en_contacto status, not contratacion)`  [AMBIGUOUS]
  hybridMethod.md · relation: conceptually_related_to

## Knowledge Gaps
- **233 isolated node(s):** `metadata`, `Step`, `FormData`, `EMPTY`, `MODALITY_LABELS` (+228 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Roles de usuario (superAdmin/recruiter)` and `Roles de usuario table`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Portal Público de Aplicación (/apply)` and `FASE 1: Normalización de Esquema BD`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `FASE 5: Server-Side Route Protection & RLS Enforcement` and `FASE 5 Correcciones (en_contacto status, not contratacion)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `supabase` connect `Candidate Portal Pages` to `Recruiter Candidate Views`, `Password Recovery Flow`, `Public Apply Vacancy Flow`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Backend Test Dependencies` to `Backend Package Dependencies`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Backend Test Dependencies` to `Frontend Package Dependencies`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `metadata`, `Step`, `FormData` to the rest of the system?**
  _233 weakly-connected nodes found - possible documentation gaps or missing edges._