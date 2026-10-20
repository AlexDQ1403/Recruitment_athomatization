# Graph Report - .  (2026-10-20)

## Corpus Check
- 59 files · ~107,186 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 847 nodes · 1287 edges · 104 communities (86 shown, 18 thin omitted)
- Extraction: 94% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Candidate Portal & Recruiters Pages
- Backend tsconfig
- Test Dependencies
- Architecture Decisions (skills)
- Registration Pages & Form
- Backend Dependencies
- Auth Middleware & RBAC
- Frontend Dependencies
- n8n Debugging Skill
- Vacancies Module
- Backend App Wiring
- Config & n8n Webhook
- Error Handling & Session
- Candidate Status Route
- Sidebar Navigation
- Delivery Phases & Auth Plan
- Candidate Panel & Form
- Chat UI
- Chat Route (LLM)
- Dashboard & Candidates Pages
- Password Recovery
- Login & Auth
- Account Profile
- Reports
- User Management
- Company Candidate History
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 88
- Community 89
- Community 90
- Community 91
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 100
- Community 101
- Community 102
- Community 103

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 22 edges
2. `AppShell()` - 17 edges
3. `logger` - 16 edges
4. `compilerOptions` - 16 edges
5. `config` - 16 edges
6. `supabase` - 15 edges
7. `AuthenticatedRequest` - 15 edges
8. `getStoredUser()` - 15 edges
9. `compilerOptions` - 14 edges
10. `ToastContainer()` - 11 edges

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
- **n8n debugging skill with its reference docs (.agents)** — agents_skills_n8n_debugging_official_skill_n8n_debugging, agents_skills_n8n_debugging_official_references_fetching_n8n_source_doc, agents_skills_n8n_debugging_official_references_parameter_verification_doc [EXTRACTED 1.00]
- **n8n debugging skill with its reference docs (.claude)** — claude_skills_n8n_debugging_official_skill_n8n_debugging, claude_skills_n8n_debugging_official_references_fetching_n8n_source_doc, claude_skills_n8n_debugging_official_references_parameter_verification_doc [EXTRACTED 1.00]
- **Three-Perspective Security Workflow (Design, Security Checklist, Deliverables)** — agents_skills_fullstack_guardian_skill_fullstack_guardian, agents_skills_fullstack_guardian_references_design_template_design_template, agents_skills_fullstack_guardian_references_security_checklist_security_checklist, agents_skills_fullstack_guardian_references_deliverables_checklist_deliverables_checklist [EXTRACTED 0.90]
- **Monolith vs Microservices Decision Group** — agents_skills_fullstack_guardian_references_architecture_decisions_architecture_decisions, agents_skills_fullstack_guardian_references_architecture_decisions_modular_monolith, agents_skills_fullstack_guardian_references_backend_patterns_backend_patterns, agents_skills_fullstack_guardian_references_integration_patterns_integration_patterns [INFERRED 0.75]
- **Candidate Enum/Migration Normalization Effort** — full_excec_fase1_normalizacion_esquema, hybridmethod_fase0_corrections, ejecutar_fase_0_migration_006, fase_0_setup_migration_006 [INFERRED 0.75]
- **n8n Webhook Security & Integration** — specs_db_security_design_c1_webhook_no_auth, full_excec_n8n_service, hybridmethod_fase3_corrections, backend_n8n_docker_compose_n8n_service [INFERRED 0.75]
- **Chat AI Search Flow Documentation** — claude_chat_ai_search_flow, readme_chat_flow, funcionalidades_chat_ia [INFERRED 0.85]

## Communities (104 total, 18 thin omitted)

### Community 0 - "Candidate Portal & Recruiters Pages"
Cohesion: 0.06
Nodes (36): CandidateApplicationsView(), formatSalary(), STATUS_CLASS, VacancyCard(), CandidateEducationSection(), emptyForm, fmtDate(), CandidateExperienceSection() (+28 more)

### Community 1 - "Backend tsconfig"
Cohesion: 0.04
Nodes (45): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+37 more)

### Community 2 - "Test Dependencies"
Cohesion: 0.05
Nodes (43): devDependencies, jsdom, supertest, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, tsx, @types/cors (+35 more)

### Community 3 - "Architecture Decisions (skills)"
Cohesion: 0.08
Nodes (36): API Design Standards (.agents), Architecture Decision Guide (.agents), BFF Pattern (Backend for Frontend), JWT vs Session Hybrid Auth Strategy, Modular Monolith, Backend Patterns (.agents), Circuit Breaker Pattern, Saga Pattern (Distributed Transactions) (+28 more)

### Community 4 - "Registration Pages & Form"
Cohesion: 0.09
Nodes (19): COPY, RegisterForm(), Variant, Alert(), AlertAction, AlertSeverity, ICON, Props (+11 more)

### Community 5 - "Backend Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, cors, express, express-rate-limit, helmet, @supabase/supabase-js, winston, winston-daily-rotate-file (+20 more)

### Community 6 - "Auth Middleware & RBAC"
Cohesion: 0.10
Nodes (16): AuthenticatedRequest, supabase, mockProfilesUpdate, mockUpdateUserById, mockUpsert, CompanyCandidateRow, router, supabaseAdmin (+8 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, next, react, react-dom, recharts, resend, @supabase/auth-helpers-nextjs, @tanstack/react-query (+17 more)

### Community 8 - "n8n Debugging Skill"
Cohesion: 0.12
Nodes (23): Fetching n8n source from GitHub, When to fetch source vs try cheaper checks, n8n-io/n8n monorepo structure, Reporting bugs upstream, Authentication-specific debugging (401/403/400), Connection (wiring) checks, Parameter verification, Four parameter checks (+15 more)

### Community 9 - "Vacancies Module"
Cohesion: 0.14
Nodes (16): fmt(), fmtRange(), MODALITY_LABELS, STATUS_COLORS, STATUS_LABELS, VacanciesView(), VacancyCard(), CreateVacancyInput (+8 more)

### Community 10 - "Backend App Wiring"
Cohesion: 0.16
Nodes (14): createApp(), companyAuthMiddleware(), AppRole, requireCompany(), requireRole(), educationSchema, educationUpdateSchema, experienceSchema (+6 more)

### Community 11 - "Config & n8n Webhook"
Cohesion: 0.15
Nodes (12): config, envSchema, parsed, router, supabaseAdmin, ContactedCandidate, RecruiterGroup, router (+4 more)

### Community 12 - "Error Handling & Session"
Cohesion: 0.16
Nodes (11): AppError, errorHandler(), failedLoginLimiter, router, sessionLimiter, supabaseAdmin, VALID_REASONS, addCorrelationId (+3 more)

### Community 13 - "Candidate Status Route"
Cohesion: 0.16
Nodes (13): ALLOWED_TRANSITIONS, CandidateStatus, router, supabaseAdmin, buildApp(), VALID_STATUSES, callN8nOutboundWebhook(), N8nEventType (+5 more)

### Community 14 - "Sidebar Navigation"
Cohesion: 0.13
Nodes (15): ACCOUNT_NAV, CANDIDATES_ITEM, CANDIDATO_NAV, CHAT_ITEM, DASHBOARD_ITEM, EMPRESA_MAIN_NAV, EMPRESA_NAV, HISTORY_ITEM (+7 more)

### Community 15 - "Delivery Phases & Auth Plan"
Cohesion: 0.16
Nodes (15): companyAuthMiddleware, FASE 2: Company-Scoped Recruiter Management, FASE 3: Chat Session Migration & Company-Scoped Search, FASE 4: Candidate Status Automation & Interview Flow, FASE 5: Server-Side Route Protection & RLS Enforcement, FASE 6: Frontend Polish (Procesos/Chats/Perfil), FASE 7: Platform Maturity & Future Extensions, n8nService (outbound webhooks) (+7 more)

### Community 16 - "Candidate Panel & Form"
Cohesion: 0.19
Nodes (11): CandidatePanel(), Props, ViewMode, Props, COLUMNS, fmt(), KanbanBoard(), KanbanCard() (+3 more)

### Community 17 - "Chat UI"
Cohesion: 0.24
Nodes (8): ChatView(), formatTime(), tempId(), chatService, ChatSession, MAX_SESSIONS, ChatMessage, SOURCE_LABELS

### Community 18 - "Chat Route (LLM)"
Cohesion: 0.17
Nodes (6): chatLimiter, PoolCandidate, router, SAFE_CANDIDATE_FIELDS, supabase, supabaseAdmin

### Community 19 - "Dashboard & Candidates Pages"
Cohesion: 0.27
Nodes (9): CandidatesPage(), DashboardPage(), CandidatesView(), CompanyCandidatesHistoryView(), EmpresaDashboardView(), fmtDate(), STATUS_BADGE, DashboardView() (+1 more)

### Community 20 - "Password Recovery"
Cohesion: 0.24
Nodes (4): ForgotPasswordForm(), ResetPasswordForm(), supabase, authService

### Community 21 - "Login & Auth"
Cohesion: 0.30
Nodes (7): LoginForm(), auditLogout(), clearAuth(), clearLocalSession(), reportFailedLogin(), setStoredUser(), touchSession()

### Community 22 - "Account Profile"
Cohesion: 0.20
Nodes (6): AccountProfileView(), ROLE_LABEL, AccountProfile, accountService, ALLOWED_AVATAR_EXT, UpdateAccountInput

### Community 23 - "Reports"
Cohesion: 0.25
Nodes (7): formatDateTime(), PERIODS, ReportsView(), ContactedCandidate, DailyContactedReport, RecruiterGroup, reportService

### Community 24 - "User Management"
Cohesion: 0.24
Nodes (6): FormData, ROLE_LABELS, UserManagement(), ConfirmModal(), Props, UserRole

### Community 25 - "Company Candidate History"
Cohesion: 0.27
Nodes (7): fmtDate(), fmtDateTime(), ProcessRow(), STATUS_BADGE, companyCandidateService, CompanyCandidatesResponse, CompanyCandidateProcess

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (11): Portal Público de Aplicación (/apply), Gestión de Vacantes, C2: profiles sin RLS → escalada de privilegios, H1: vacancies abierta entre empresas, H2: Vacantes expuestas a anónimos, Plan de Mitigación (Fases 1-5), Portal del Candidato, candidate_profiles table (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.27
Nodes (7): ApplyVacancyForm(), EMPTY, fmt(), fmtRange(), FormData, MODALITY_LABELS, Step

### Community 28 - "Community 28"
Cohesion: 0.31
Nodes (9): fmt(), fmtDate(), fmtDateTime(), HistorialTab(), InfoTab(), NotasTab(), STATUS_COLORS, Tab (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.27
Nodes (8): STATUS_COLORS, STATUS_LABELS_PLURAL, statuses, CandidateFilters, candidateService, CandidateStatus, STATUS_LABELS, StatusHistoryEntry

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (9): n8n Docker Service, Candidate Data Sources (3 tabs), n8n Automation Layer, Kanban Board Component, Candidate Source Enum, Candidate Status Enum, Dashboard, Candidate Data Model (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (7): mockEq, mockGte, mockIlike, mockLte, mockOrder, mockRange, mockSelect

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (8): Chat API Endpoint, Candidates View Component, Chat View Component, AI Chat Search, Candidate Management, Recruiter, OpenAI API, AI Chat Search Workflow

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (7): candidateSchema, companySchema, GENERIC_OK, passwordSchema, registerLimiter, router, supabaseAdmin

### Community 34 - "Community 34"
Cohesion: 0.36
Nodes (5): metadata, ApplyLanding(), fmt(), fmtRange(), MODALITY_LABELS

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (7): Backend CI Job, Frontend CI Job, Monorepo Structure (backend/frontend), Semillero Recruitment Platform, Backend Service (Docker), Frontend Service (Docker), CI section

### Community 36 - "Community 36"
Cohesion: 0.29
Nodes (7): Chat AI Search Flow, Supabase as Single Source of Truth, SAFE_CANDIDATE_FIELDS excludes email/linkedin, Gestión de Candidatos (tabla/kanban), Búsqueda por Chat IA, Historial de Búsquedas, Flujo del chat IA

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (7): Public Apply Portal, Authentication, Express Backend, Next.js 14 Frontend, n8n Automation, Supabase Database, Supabase Storage (Resumes)

### Community 38 - "Community 38"
Cohesion: 0.43
Nodes (4): fetchSearchHistory(), fmtDate(), SearchHistoryView(), SearchHistory

### Community 39 - "Community 39"
Cohesion: 0.43
Nodes (4): CandidateTable(), exportCSV(), fmt(), STATUS_COLORS

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (6): Extraction Cache (Step B0), /graphify command, Honesty Rules, /graphify query, Semantic Extraction (LLM, Part B), AST Structural Extraction (Part A)

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (5): ALLOWED_FIELDS, router, supabaseAdmin, buildApp(), updateSchema

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (4): instrumentSerif, jetbrainsMono, metadata, syne

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (3): EMPTY, FormData, Step

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (4): AppShell(), RECRUITER_ONLY_PATHS, createQueryClient(), QueryProvider()

### Community 45 - "Community 45"
Cohesion: 0.40
Nodes (5): Vacancies View Component, Vacancy Modality Enum, Vacancy Status Enum, Vacancy Management, Vacancy Data Model

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (5): FASE 0 Checklist, Migration 006_empresa_jerarquia.sql, n8n Webhook Test Procedure, Migration 006_empresa_jerarquia.sql (setup guide), n8n Webhook Configuration

### Community 47 - "Community 47"
Cohesion: 0.70
Nodes (4): GET(), getAdminClient(), POST(), verifySession()

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (4): POST(), STATUS_LABELS, STATUS_MESSAGES, verifySession()

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (4): COLORS, ICONS, Props, Toast

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (5): FASE 0: Pre-work & Cleanup, FASE 1: Normalización de Esquema BD, Summary of Key Decisions, FASE 0 Correcciones (migrations 007-009), Plan Híbrido Ejecutable Overview

### Community 51 - "Community 51"
Cohesion: 0.50
Nodes (4): Community Labeling (Step 5), Build Graph & Cluster (Step 4), Graph Health Check (Step 4.5), #479 Shrink Guard

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): buildApp(), mockFrom, mockGetUser

### Community 53 - "Community 53"
Cohesion: 0.83
Nodes (3): DELETE(), getAdminClient(), verifySession()

### Community 54 - "Community 54"
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
- **276 isolated node(s):** `metadata`, `Step`, `FormData`, `EMPTY`, `MODALITY_LABELS` (+271 more)
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
- **Why does `supabase` connect `Password Recovery` to `Candidate Portal & Recruiters Pages`, `Community 38`, `Vacancies Module`, `Community 44`, `Chat UI`, `Login & Auth`, `Account Profile`, `Reports`, `Company Candidate History`, `Community 29`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `useToast()` connect `Candidate Portal & Recruiters Pages` to `Community 39`, `Vacancies Module`, `Candidate Panel & Form`, `Dashboard & Candidates Pages`, `Account Profile`, `User Management`, `Community 28`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Test Dependencies` to `Backend Dependencies`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `metadata`, `Step`, `FormData` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._