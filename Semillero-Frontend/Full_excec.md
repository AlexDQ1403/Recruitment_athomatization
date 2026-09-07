  FASE 0: PRE-WORK & CLEANUP (Semana 1, sin cambios en DB)

  Objetivo
  Eliminar portal de aplicaciones deprecated, estandarizar definiciones de tipos, preparar config para nuevas integraciones.

  Cambios en Base de Datos

  Ninguno (solo config)

  Cambios en Backend

  1. Eliminar rutas del portal apply:
    - Verificar si hay rutas backend para /apply/*
    - Si existen en backend/src/routes/, eliminarlas
  2. Actualizar backend/src/config/index.ts:
    - Agregar nuevas variables de entorno:
  N8N_WEBHOOK_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional()
  3. Crear archivo template de servicios:
    - Nuevo archivo: backend/src/services/n8nService.ts
    - Exportar funciones stub (implementación en Fase 3):
  export async function callN8nOutboundWebhook(
    event: 'interview_requested'|'candidate_shortage'|'no_search_results',
    payload: Record<string, unknown>
  ): Promise<void> {
    // Implementar en Fase 3
  }

  Cambios en Frontend

  1. Eliminar portal de aplicaciones:
    - Eliminar carpeta: frontend/src/app/apply/
    - Eliminar carpeta: frontend/src/app/api/apply/
  2. Actualizar frontend/src/types/index.ts:
  // ANTES (incorrecto):
  export type UserRole = 'empresa' | 'recruiter';
  export type CandidateStatus = 'seguimiento' | 'rechazado' | 'contratacion';
  export type CandidateSource = 'Interno' | 'Web scraping';

  // DESPUÉS (correcto):
  export type UserRole = 'superAdmin' | 'empresa' | 'recruiter';
  export type CandidateStatus = 'rechazado' | 'en_contacto' | 'seguimiento';
  export type CandidateSource = 'internal' | 'scraping' | 'applicant';

  Consideraciones de Seguridad

  - Ninguna nueva; solo limpieza

  Entregables

  - Config lista para Fase 1
  - Tipos de datos reconciliados con esquema DB
  - Portal de aplicaciones removido

  ---
  FASE 1: NORMALIZACIÓN DE ESQUEMA DE BD (Semana 1-2, DB + validación)

  Objetivo

  Reconciliar enums de status, reconciliar enums de candidate source, arreglar constraint NOT NULL en search_history, preparar para autorización company-scoped.

  Cambios en Base de Datos

  Crear migración: backend/src/db/migrations/007_fix_candidate_source_enum.sql

  -- Renombrar valores existentes en candidates.source a lowercase
  UPDATE candidates SET source = 'internal' WHERE source = 'Interno';
  UPDATE candidates SET source = 'scraping' WHERE source = 'Web scraping';
  UPDATE candidates SET source = 'applicant' WHERE source = 'Solicitante';

  -- Eliminar constraint antiguo
  ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_source_check;

  -- Agregar nuevo constraint
  ALTER TABLE candidates ADD CONSTRAINT candidates_source_check
    CHECK (source IN ('internal', 'scraping', 'applicant'));

  Crear migración: backend/src/db/migrations/008_fix_candidate_status_enum.sql

  -- Migrar del modelo antiguo al nuevo spec (3 estados)
  -- 'seguimiento' → 'seguimiento' (sin cambio)
  -- 'rechazado' → 'rechazado' (sin cambio)
  -- 'contratacion' → 'seguimiento' (backfill)

  UPDATE candidates SET status = 'seguimiento' WHERE status = 'contratacion';

  -- Eliminar constraint antiguo
  ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_status_check;

  -- Agregar nuevo constraint con 3 estados
  ALTER TABLE candidates ADD CONSTRAINT candidates_status_check
    CHECK (status IN ('rechazado', 'en_contacto', 'seguimiento'));

  -- Crear tabla de historial de status (si no existe de la migración 003)
  CREATE TABLE IF NOT EXISTS candidate_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    reason TEXT
  );

  CREATE INDEX IF NOT EXISTS candidate_status_history_candidate_idx
    ON candidate_status_history(candidate_id);
  CREATE INDEX IF NOT EXISTS candidate_status_history_changed_at_idx
    ON candidate_status_history(changed_at);

  ALTER TABLE candidate_status_history ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "candidate_status_history_read_own_company"
    ON candidate_status_history;

  CREATE POLICY "candidate_status_history_read_own_company"
    ON candidate_status_history FOR SELECT
    USING (
      candidate_id IN (
        SELECT id FROM candidates
        WHERE company_id = (
          SELECT company_id FROM profiles WHERE id = auth.uid()
        )
      )
    );

  Crear migración: backend/src/db/migrations/009_fix_search_history_not_null.sql

  -- Eliminar registros con company_id NULL
  DELETE FROM search_history WHERE company_id IS NULL;

  -- Agregar constraint NOT NULL
  ALTER TABLE search_history ALTER COLUMN company_id SET NOT NULL;

  Crear migración: backend/src/db/migrations/010_add_recruiter_crud_audit.sql

  -- Tabla de auditoría para ciclo de vida del recruiter
  CREATE TABLE IF NOT EXISTS recruiter_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL
      CHECK (action IN ('created', 'updated', 'deleted', 'suspended', 'restored')),
    changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    changes JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS recruiter_audit_log_company_idx
    ON recruiter_audit_log(company_id);
  CREATE INDEX IF NOT EXISTS recruiter_audit_log_recruiter_idx
    ON recruiter_audit_log(recruiter_id);

  ALTER TABLE recruiter_audit_log ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "recruiter_audit_log_read_own_company"
    ON recruiter_audit_log FOR SELECT
    USING (
      company_id = (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    );

  Cambios en Backend

  1. Actualizar backend/src/routes/n8n-webhook.ts:
    - Línea 91: Cambiar enum de source
  // ANTES:
  source: 'Web scraping',

  // DESPUÉS:
  source: 'scraping', // Matches DB CHECK
  2. Actualizar backend/src/routes/chat.ts:
    - Línea 75: Agregar scoping por company_id
    - Línea 163: Agregar company_id a insert en search_history
  // Agregar después de validar token
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  const companyId = profile?.company_id;
  if (!companyId) {
    res.status(403).json({ error: 'Usuario sin empresa asignada' });
    return;
  }

  // Luego scoping de candidates query:
  .eq('company_id', companyId)

  // Y en search_history insert:
  { company_id: companyId, user_id: user.id, query: ..., candidates_found: ... }

  Cambios en Frontend

  1. Actualizar componentes para mapear tipos:
    - En componentes de búsqueda: mapear 'scraping' → "Web Scraping" para display
    - En selectores de status: actualizar a 3 estados (sin 'contratacion')
    - En listas de candidatos: reflejar nuevas etiquetas de status

  Orden de Ejecución de Migraciones

  1. 007_fix_candidate_source_enum.sql
  2. 008_fix_candidate_status_enum.sql
  3. 009_fix_search_history_not_null.sql
  4. 010_add_recruiter_crud_audit.sql

  Consideraciones de Seguridad

  - Políticas RLS sin cambios (heredadas de migración 006)
  - Todas las queries scoped por company_id (enforced en capa backend en chat.ts)
  - Auditoría de recruiter CRUD establecida

  Testing

  - Verificar que 'Interno'/'Web scraping' antiguo mapea correctamente
  - Verificar que status 'contratacion' no rompe queries
  - Verificar que RLS policies todavía funcionan
  - Verificar que search_history require company_id

  Entregables

  - Esquema BD normalizado
  - Enums unificados entre capas
  - Tabla de auditoría lista para Fase 2

  ---
PHASE 2: COMPANY-SCOPED RECRUITER MANAGEMENT (Week 2-3, Backend + Frontend CRUD)

  Objective

  Implement Empresa-role CRUD for Recruiter accounts; establish company-scoped authorization middleware; enforce multi-tenancy at server level.

  Database Changes

  Extend migration backend/src/db/migrations/011_add_recruiter_meta.sql:
  -- Add columns to profiles for recruiter metadata
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

  CREATE INDEX IF NOT EXISTS profiles_company_suspended_idx ON profiles(company_id, suspended);

  Backend Changes

  1. Create middleware backend/src/middlewares/companyAuth.ts:
    - Export companyAuthMiddleware that extracts user + company_id from token
    - Validates that user.company_id matches request scope (query param or URL param or body)
    - Establishes typed Express.Request.locals.user and Request.locals.companyId
    - Used by all company-scoped routes (chat, recruiter CRUD, reports, etc.)
    - Signature:
  export const companyAuthMiddleware = async (req, res, next) => {
    // 1. Verify token, get user
    // 2. Query profiles to get company_id
    // 3. Validate role ∈ ['empresa', 'recruiter']
    // 4. Attach to req.locals
    // 5. Next or 401/403
  }
  2. Create new route backend/src/routes/recruiters.ts:
    - POST /api/recruiters — Create new recruiter (empresa-only)
        - Input: email, password, full_name
      - Output: recruiter user id, email
      - Checks: calling user role==='empresa', same company_id
      - Uses service function createRecruiterProfile(companyId, email, password, full_name)
      - Logs to recruiter_audit_log (action='created')
      - Rate limit: 10 req/min per empresa
    - GET /api/recruiters?company_id=... — List all recruiters in company (empresa-only)
        - Scope: only return profiles where role==='recruiter' AND company_id matches caller's
      - Pagination support (limit, offset)
    - PATCH /api/recruiters/:id — Update recruiter (empresa-only)
        - Editable fields: full_name, email (if not already in use), suspended
      - Logs to recruiter_audit_log (action='updated', changes={...})
    - DELETE /api/recruiters/:id — Soft-delete recruiter (empresa-only)
        - Sets suspended=true, doesn't delete auth user
      - Logs to recruiter_audit_log (action='suspended')
      - Prevents empresa from deleting self
  3. Update backend/src/routes/chat.ts:
    - Add companyAuthMiddleware to POST /api/chat
    - Use req.locals.companyId to scope all queries:
  const { data: candidates } = await supabaseAdmin
    .from('candidates')
    .select('...')
    .eq('company_id', req.locals.companyId)  // ADDED
    .limit(150);
    - Also scope chat_history (once migrated to chat_sessions in Phase 3)
  4. Create service backend/src/services/recruiterService.ts:
    - createRecruiterProfile(companyId: string, email: string, password: string, fullName: string)
        - Calls Supabase admin API to create auth user
      - Upserts profiles table with company_id
      - Inserts recruiter_audit_log row
    - updateRecruiterProfile(companyId: string, recruiterId: string, updates: Partial<{email, fullName, suspended}>)
    - deleteRecruiterProfile(companyId: string, recruiterId: string) → soft delete (suspended=true)
    - listRecruiters(companyId: string, limit?: number, offset?: number)
  5. Update backend/src/app.ts:
    - Import companyAuthMiddleware, recruitersRouter
    - Mount: app.use('/api/recruiters', companyAuthMiddleware, recruitersRouter);
    - Wrap existing /api/chat with companyAuthMiddleware

  Frontend Changes

  1. Create new pages/components for Empresa role:
    - New page: frontend/src/app/recruiters/page.tsx
        - Shows list of recruiters (GET /api/recruiters)
      - Buttons to create, edit, suspend, delete recruiters
      - Modal/form for new recruiter: email, password, full_name
    - New component: frontend/src/components/recruiter/RecruiterForm.tsx
        - Form fields: email, password (masked), full_name
      - Submit calls POST /api/recruiters
      - Error handling for duplicate email, weak password
    - New component: frontend/src/components/recruiter/RecruiterList.tsx
        - Table: email, full_name, last_login, status (active/suspended), actions
      - Edit/delete buttons open modals
  2. Update frontend/src/components/layout/Sidebar.tsx:
    - Conditional nav based on role:
  const sections = (() => {
    if (user?.role === 'empresa') {
      return [...NAV, {
        section: 'Administración',
        items: [{ href: '/recruiters', label: 'Gestión de Reclutadores', icon: ... }]
      }];
    }
    if (user?.role === 'superAdmin') {
      return [...NAV, ADMIN_NAV]; // Keep for backward compat
    }
    return NAV; // recruiter
  })();
  3. Update auth context/hook to return full user profile:
    - Ensure role + company_id are available in all pages
    - Verify role before rendering empresa-only pages (client-side check)
  4. Create middleware/guard for empresa-only routes:
    - New function: frontend/src/app/middlewares/requireEmpresa.ts or use layout-level protection
    - Redirect non-empresa users to /dashboard if trying to access /recruiters
    - Can be client-side for now (TODO: add server-side middleware in Phase 3)

  Integration with n8n Webhook

  - n8n webhook (existing) includes company_id in request
  - Backend validates and creates candidates scoped to company
  - No new integration in this phase; reconfirm companyAuthMiddleware works with webhook (which bypasses normal auth token flow)
  - Note: n8n webhook should remain in /api/n8n-webhook (public, but validates company_id in payload)

  Security Considerations

  - Middleware-enforced: All recruiter CRUD ops must come from 'empresa' role in same company
  - Service role key usage: Limited to user creation + audit logging; no direct data access via service key (prefer RLS)
  - Self-delete prevention: Empresa cannot delete itself from recruiter list
  - Soft delete: Suspended recruiters still exist in auth system (can be un-suspended) but cannot log in (Phase 3: check suspended flag on login)
  - Audit trail: Every recruiter CRUD op logged to recruiter_audit_log with timestamps + changes delta

  Testing

  - Test POST /api/recruiters with valid empresa token → creates recruiter
  - Test POST /api/recruiters with recruiter token → 403
  - Test POST /api/recruiters with empresa from different company_id → 403
  - Test GET /api/recruiters lists only own company's recruiters
  - Test PATCH /api/recruiters/:id with suspended=true → recruiter cannot access endpoints
  - Test DELETE /api/recruiters/:id prevents empresa from deleting self

  Deliverables

  - Recruiter CRUD API (create, read, update, soft-delete)
  - Company-scoped authorization middleware
  - Empresa admin page for recruiter management
  - Audit log populated on all recruiter operations

  ---
  PHASE 3: CHAT SESSION MIGRATION & COMPANY-SCOPED SEARCH (Week 3-4, Backend refactor + Frontend chat UI rebuild)

  Objective

  Migrate from flat chat_history table to session-based chat_sessions/chat_messages (per 006); enforce max 5 sessions + max 5-message memory; scope all candidate
  queries by company; add N8n fallback triggers.

  Database Changes

  No new migrations (schema from 006 already exists; verify chat_sessions, chat_messages tables exist)

  Verify in Supabase:
  - Run migration 006 if not already applied
  - Confirm chat_sessions, chat_messages, candidates (with company_id) present
  - Drop old chat_history table if still exists (or archive):
  -- Backup old data if needed
  -- SELECT * INTO chat_history_archive FROM chat_history;
  -- DROP TABLE chat_history;

  Backend Changes

  1. Refactor backend/src/routes/chat.ts (major refactor):
    - Rewrite POST / handler to use chat_sessions/chat_messages instead of chat_history
    - Request payload: { session_id?: string, message: string }
    - Logic:
  1. Verify token, extract user + companyId (via companyAuthMiddleware)
  2. If no session_id:
     a. Get user's active sessions count (WHERE user_id=user.id)
     b. If count >= 5: Delete oldest session (CASCADE deletes messages) + audit log
     c. Create new chat_session with company_id
  3. If session_id provided: Validate session belongs to user + company_id
  4. Query candidates (scoped to company_id, limit 150)
  5. Call OpenAI with systemPrompt + last 5 messages from chat_session (fetch from chat_messages)
  6. Insert user + assistant messages to chat_messages
  7. Trigger N8n webhooks if applicable (see below)
  8. Return { session_id, message, candidates }
    - OpenAI context window: Query last 5 messages from chat_messages WHERE session_id=... ORDER BY created_at DESC LIMIT 5
    - N8n outbound webhook triggers: After chat completes, check:
  a. If candidates_found == 0:
     - Call triggerN8nOutboundWebhook('no_search_results', {
         company_id, recruiter_id, query, session_id
       })
  b. If company's total active candidates < 30:
     - Call triggerN8nOutboundWebhook('candidate_shortage', {
         company_id, current_count, threshold: 30
       })
  c. (Optional) If candidates_found > 0 but all low-confidence:
     - Call triggerN8nOutboundWebhook('low_confidence_results', {...})
    - Response schema:
  {
    "session_id": "uuid",
    "message": "string",
    "candidates": [
      { "id", "full_name", "position", ..., "match_reason" }
    ],
    "metadata": {
      "candidates_found": number,
      "fallback_triggered": boolean,
      "fallback_reason": "string | null"
    }
  }
  2. Create service backend/src/services/chatService.ts:
    - async getOrCreateSession(userId: string, companyId: string): Promise<ChatSession>
        - Query active sessions for user
      - If count >= 5: delete oldest session
      - Create new session
    - async getSessionMessages(sessionId: string, limit: number = 5): Promise<ChatMessage[]>
        - Fetch from chat_messages ordered by created_at DESC
      - Reverse to chronological order for OpenAI
    - async saveChatMessage(sessionId: string, role: 'user'|'assistant', content: string, candidates?: any[]): Promise<ChatMessage>
    - async getCompanyCandidateCount(companyId: string): Promise<number>
        - Counts active (non-rejected) candidates
  3. Implement N8n outbound webhook service in backend/src/services/n8nService.ts:
    - async callN8nOutboundWebhook(event: string, payload: Record<string, unknown>): Promise<void>
        - Builds request with company_id, event type, timestamp
      - Posts to config.N8N_WEBHOOK_URL + '/recruiter-fallback' or similar
      - Includes optional signature (HMAC) if config.N8N_WEBHOOK_SECRET set
      - Silent failure (logs error, doesn't throw) to avoid breaking chat response
    - Signature example:
  export async function callN8nOutboundWebhook(
    event: 'no_search_results' | 'candidate_shortage' | 'low_confidence_results',
    payload: { company_id: string; recruiter_id: string; [key: string]: unknown }
  ): Promise<void> {
    if (!config.N8N_WEBHOOK_URL) {
      logger.warn('N8N_WEBHOOK_URL not configured');
      return;
    }
    const body = { event, ...payload, triggered_at: new Date().toISOString() };
    const signature = config.N8N_WEBHOOK_SECRET
      ? crypto.createHmac('sha256', config.N8N_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex')
      : undefined;
    try {
      await fetch(config.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(signature && { 'X-N8N-Signature': signature }) },
        body: JSON.stringify(body),
      });
    } catch (err) {
      logger.error('N8n outbound webhook error', { event, error: String(err) });
    }
  }
  4. Update chat.ts route decorators/rate limits:
    - Apply companyAuthMiddleware
    - Keep chatLimiter (20 req/min per user)

  Frontend Changes

  1. Completely rebuild Chat UI (frontend/src/app/chat/page.tsx):
    - Replace old single-chat view with session-based UI:
  Layout:
  ├─ Sidebar (Sessions list)
  │  ├─ "Nuevo Hilo" button
  │  └─ [Session 1] (clickable, shows messages)
  │  └─ [Session 2]
  │  └─ ... (max 5)
  ├─ Main (Chat area)
  │  ├─ Session header: "Sesión: Búsqueda de Front-Ends"
  │  ├─ Messages area (scrollable)
  │  │  ├─ User: "Busca front-end con React"
  │  │  ├─ Assistant: "Encontré 3 candidatos..." + Candidate Table
  │  │  └─ ...
  │  └─ Input area
  │     ├─ Textarea for query
  │     └─ Send button
    - State management:
        - sessions: ChatSession[] — list of user's sessions
      - activeSessionId: string — currently open session
      - messages: ChatMessage[] — messages in active session
      - loading: boolean — during API call
    - UX:
        - Clicking "Nuevo Hilo" creates new session (POST with no session_id)
      - Clicking old session loads its messages (GET /api/chat/:sessionId or stored in state)
      - Sending message posts to active session
      - Old sessions grayed out, only 5 visible (delete oldest on 6th create)
  2. Create candidate results table component:
    - New file: frontend/src/components/chat/CandidateResultsTable.tsx
    - Shows candidates returned by chat query
    - Columns: Avatar (initials), Name, Position, Experience, Salary, Location, Match Reason, Status (status select)
    - Clicking row opens candidate detail modal (or expands)
    - Status dropdown → updates candidate status (see Phase 4 for integration)
  3. Add "Procesos" section (candidate process tracking):
    - New page: frontend/src/app/procesos/page.tsx (or /candidates/procesos)
    - Lists ALL candidates in company (not just from chat results)
    - Filterable by status: Rechazado, En Contacto, Seguimiento
    - Shows: Name, Position, Status, Source, Last Modified, Actions
    - Action: Click to view detail, edit status, add notes
    - Replaces old /candidates page (or merges if it existed for this purpose)
  4. Add "Chats" section (query history):
    - New page: frontend/src/app/chats/page.tsx (or integrate into /chat as sidebar)
    - Lists all chat sessions (max 5 per user)
    - Shows: Session name, Created date, # messages, # candidates found
    - Click to open in main chat area
    - Can rename session (PATCH /api/chat/:sessionId)
  5. Add "Perfil" section (recruiter profile):
    - New page: frontend/src/app/profile/page.tsx
    - Shows current recruiter's info: name, email, company, joined date
    - Edit name/password
    - Shows recruiter's stats: total chats, total candidates found, etc.
    - Logs out via existing auth hook
  6. Create layout for recruiter sections:
    - New file: frontend/src/app/recruiter/layout.tsx
    - Wraps Procesos + Chats + Perfil sections
    - Nav tabs or sidebar to switch between 3 sections
    - Only visible to role === 'recruiter'

  Integration Points

  1. Chat ↔ N8n:
    - Backend detects no results or shortage
    - Calls n8n webhook (non-blocking)
    - n8n receives event + company_id
    - n8n flow scrapes LinkedIn or other sources
    - n8n posts new candidates back to /api/n8n-webhook (inbound, existing)
    - Recruiter sees no immediate change but DB grows; next query finds candidates
  2. Chat ↔ Candidate Status:
    - Recruiter sets candidate status in table (inline edit)
    - If status → 'en_contacto': backend triggers email automation (Phase 4)

  Security Considerations

  - Session isolation: User can only see their own sessions (RLS on chat_sessions)
  - Company scoping: All candidate queries filtered by company_id
  - Webhook auth: N8n outbound webhook includes optional HMAC signature; n8n verifies before processing
  - API rate limits: Reuse existing chatLimiter (20 req/min)

  Testing

  - Test creating 6 sessions → 1st deleted automatically
  - Test fetching last 5 messages for context
  - Test no-results trigger calls n8n webhook
  - Test candidate shortage trigger
  - Test candidate query respects company_id boundary (users cannot see other company's candidates)
  - Test chat UI session switching
  - Test candidate status change from table

  Deliverables

  - Session-based chat replacing flat history
  - N8n outbound webhook integration (fallback triggers)
  - Recruiter 3-section UI (Procesos, Chats, Perfil)
  - Company-scoped candidate search

  ---
  PHASE 4: CANDIDATE STATUS AUTOMATION & INTERVIEW FLOW (Week 4-5, Triggers + n8n integration)

  Objective

  Implement 'en_contacto' status → interview email automation via n8n + Google Calendar; daily recruiter report to Empresa; status change audit trail.

  Database Changes

  Create migration backend/src/db/migrations/012_add_interview_data.sql:
  -- Store interview scheduling metadata
  ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_scheduled_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_calendar_event_id TEXT; -- Google Calendar event ID

  -- Track status change with reason (e.g., "interview_requested", "rejected_by_recruiter")
  -- Already added in 008, ensure reason column exists
  ALTER TABLE candidate_status_history ADD COLUMN IF NOT EXISTS reason TEXT;

  -- Add email delivery tracking
  CREATE TABLE IF NOT EXISTS candidate_email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL CHECK (email_type IN ('interview_request', 'rejection', 'daily_report')),
    recipient_email TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    delivery_status TEXT CHECK (delivery_status IN ('sent', 'bounced', 'failed')),
    n8n_request_id TEXT -- Cross-reference n8n flow execution
  );

  CREATE INDEX IF NOT EXISTS candidate_email_log_candidate_idx ON candidate_email_log(candidate_id);
  CREATE INDEX IF NOT EXISTS candidate_email_log_sent_at_idx ON candidate_email_log(sent_at);

  ALTER TABLE candidate_email_log ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "candidate_email_log_read_own_company" ON candidate_email_log
    FOR SELECT
    USING (
      candidate_id IN (
        SELECT id FROM candidates WHERE company_id = (
          SELECT company_id FROM profiles WHERE id = auth.uid()
        )
      )
    );

  Backend Changes

  1. Create new route backend/src/routes/candidates.ts:
    - PATCH /api/candidates/:id/status — Update candidate status (recruiter-scoped)
        - Input: { status: 'rechazado'|'en_contacto'|'seguimiento', reason?: string }
      - Validation: status must be valid enum
      - Checks: recruiter can only update candidates in their company
      - Side effects:
  a. Update candidates.status
  b. Insert to candidate_status_history (with reason)
  c. If status === 'en_contacto':
     - Call triggerN8nInterviewFlow({ candidate_id, recruiter_email, candidate_email, company_id })
     - Log to candidate_email_log (email_type='interview_request', delivery_status='pending')
  d. Return updated candidate + status_history record
      - Rate limit: 30 req/min per recruiter
    - GET /api/candidates/:id/status-history — View status transitions for a candidate
        - Scoped to user's company
      - Returns: [{ from_status, to_status, changed_by, changed_at, reason }, ...]
  2. Extend backend/src/services/n8nService.ts:
    - Add async triggerN8nInterviewFlow(companyId: string, candidateId: string, recruiterEmail: string, candidateEmail: string): Promise<void>
        - Calls N8N_WEBHOOK_URL + '/interview-flow' or determines n8n flow URL from config
      - Payload:
  {
    "event": "interview_requested",
    "company_id": "uuid",
    "candidate_id": "uuid",
    "recruiter_email": "recruiter@company.com",
    "candidate_email": "candidate@email.com",
    "triggered_at": "ISO string"
  }
      - n8n flow will:
  a. Send Resend email to candidate: "Confirm your interview time"
  b. Add event to recruiter's Google Calendar (via Google Calendar API in n8n)
  c. POST back to /api/candidates/:id/interview-scheduled to confirm
  3. Create new route backend/src/routes/candidates.ts (extended):
    - POST /api/candidates/:id/interview-scheduled — Callback from n8n after Calendar API success
        - Input: { calendar_event_id: string, interview_date: ISO string }
      - Updates candidates.interview_scheduled_at + interview_calendar_event_id
      - Logs to candidate_email_log with delivery_status='sent'
      - Note: This endpoint is called by n8n (trusted webhook), so minimal auth (can check for internal IP or share secret)
  4. Create new route backend/src/routes/reports.ts:
    - GET /api/reports/daily-contacted?company_id=...&date=YYYY-MM-DD — Daily contacted candidates report
        - Gated to role==='empresa'
      - Queries candidate_status_history WHERE to_status='en_contacto' AND changed_at::date = :date AND company_id=:company_id
      - Groups by recruiter
      - Returns CSV or JSON:
  {
    "company_id": "uuid",
    "date": "2025-02-15",
    "recruited_by_recruiter": [
      {
        "recruiter_email": "recruiter1@company.com",
        "recruiter_name": "Name",
        "candidates_contacted": [
          { "candidate_id", "name", "position", "contacted_at" }
        ]
      }
    ],
    "total_contacted": 5
  }
      - Rate limit: 5 req/min per empresa (prevent spam queries)
  5. Update backend/src/config/index.ts:
    - Add if not already there:
  N8N_INTERVIEW_FLOW_WEBHOOK_URL: z.string().url().optional(),
  INTERVIEW_CALLBACK_SECRET: z.string().optional(), // Secret to validate n8n callbacks

  Frontend Changes

  1. Add status change UI to candidate detail/table:
    - Existing: /procesos page has inline status selector
    - Clicking status dropdown and selecting 'en_contacto' triggers:
  const response = await fetch(`/api/candidates/${candidateId}/status`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'en_contacto', reason: 'interview_requested' })
  });
  // Shows toast: "Email enviado al candidato para confirmar entrevista"
  2. Show email log in candidate detail modal:
    - New section: "Historial de Comunicación"
    - Lists candidate_email_log records for this candidate
    - Shows: email_type, recipient, sent_at, delivery_status, n8n_request_id (if failed, show retry button)
  3. Add email delivery status indicator:
    - In candidate table: small icon next to status showing if interview email was sent
    - Hover: "Email enviado 2025-02-15 a las 14:30"

  N8n Workflow Design (no code, configuration only)

  New n8n Flow: "Interview Request & Google Calendar"
  - Trigger: HTTP webhook POST from backend /api/candidates/:id/status with event='interview_requested'
  - Steps:
    a. Parse payload (candidate_id, recruiter_email, candidate_email, company_id)
    b. Send email to candidate via Resend: "Confirm your interview schedule"
    c. Read recruiter's Google Calendar credentials from n8n env (assumes OAuth already stored)
    d. Create Calendar event (30 min slot, 2 days from now by default)
    e. Send calendar invite to candidate_email
    f. POST back to backend: /api/candidates/{candidate_id}/interview-scheduled with event_id + date
  - Error handling: log errors, don't break chat flow (n8n side)

  Security Considerations

  - Status update authorization: Only recruiters can update candidates in their company
  - N8n callback validation: Backend validates callback origin (IP whitelist or HMAC signature from n8n)
  - Email delivery: Logged but not exposed to frontend (privacy: don't leak candidate emails in UI)
  - Google Calendar: Credentials stored in n8n, never in Semillero backend
  - Rate limits: Prevents spam status updates

  Testing

  - Test PATCH /api/candidates/:id/status with valid recruiter token → 200
  - Test PATCH with wrong company_id → 403
  - Test PATCH to 'en_contacto' triggers n8n webhook
  - Test n8n callback updates interview_scheduled_at correctly
  - Test GET /api/reports/daily-contacted with empresa role → returns correct data
  - Test with recruiter role → 403

  Deliverables

  - Status change endpoint with audit trail
  - N8n interview flow trigger
  - Daily report endpoint (for empresa)
  - Email delivery tracking

  ---
  PHASE 5: SERVER-SIDE ROUTE PROTECTION & RLS ENFORCEMENT (Week 5, Security hardening)

  Objective

  Add server-side middleware to protect empresa-only and recruiter-only routes; enforce RLS as security boundary (not just convenience); add CORS/webhook auth.

  Database Changes

  No new migrations (RLS already defined in 006)

  Verify RLS is enforced:
  - Test that anon key cannot bypass RLS
  - Confirm service role key used only for admin ops (user creation, audit logging)

  Backend Changes

  1. Create comprehensive auth/authorization service backend/src/services/authService.ts:
    - async verifyAndGetUser(token: string): Promise<{ user: AuthUser, profile: UserProfile }>
    - async requireEmpresa(user: AuthUser, profile: UserProfile, requiredCompanyId?: string): Promise<void>
        - Throws 403 if role !== 'empresa' or (requiredCompanyId && company_id !== requiredCompanyId)
    - async requireRecruiter(user: AuthUser, profile: UserProfile, requiredCompanyId?: string): Promise<void>
        - Throws 403 if role !== 'recruiter' or (requiredCompanyId && company_id !== requiredCompanyId)
    - async requireSuperAdmin(profile: UserProfile): Promise<void>
        - For backward-compat superAdmin endpoints only
    - Type:
  interface AuthUser {
    id: string;
    email: string;
  }
  interface UserProfile {
    id: string;
    role: 'superAdmin' | 'empresa' | 'recruiter';
    company_id?: string;
    full_name: string;
    suspended?: boolean;
  }
  2. Create route guard middleware backend/src/middlewares/routeGuards.ts:
    - export const requireAuth = (...) => middleware
    - export const requireEmpresaRole = (...) => middleware
    - export const requireRecruiterRole = (...) => middleware
    - export const validateWebhookSignature = (secret: string) => middleware — Validates HMAC signature for n8n callbacks
    - Example usage:
  router.patch('/:id', validateCompanyScope, requireRecruiterRole, updateCandidateStatus);
  router.get('/recruiters', requireEmpresaRole, listRecruiters);
  router.post('/webhook/interview-scheduled', validateWebhookSignature(config.INTERVIEW_CALLBACK_SECRET), interviewScheduledCallback);
  3. Update all routes to use auth service:
    - /api/chat/* → use requireRecruiterRole
    - /api/recruiters/* → use requireEmpresaRole
    - /api/candidates/:id/status → use requireRecruiterRole
    - /api/reports/* → use requireEmpresaRole
    - /api/n8n-webhook → no role check (validates via company_id in payload + optional HMAC)
    - /api/candidates/:id/interview-scheduled → validateWebhookSignature (n8n callback)
  4. Add webhook authentication:
    - For inbound n8n webhook: Validate company_id exists; optionally validate HMAC signature (if secret provided)
    - For interview-scheduled callback: Always validate HMAC signature (trusts n8n flow)
    - Update config to include N8N_WEBHOOK_SECRET + INTERVIEW_CALLBACK_SECRET
  5. Enforce suspended recruiter blocking:
    - In requireRecruiterRole: Check profile.suspended === false before allowing access
    - Suspended recruiters get 403 on any protected route
  6. Add CORS hardening:
    - Existing: cors({ origin: config.CORS_ORIGIN, ... })
    - Verify origin only allows frontend URL (localhost:3002 or prod URL)
    - Add preflight caching: maxAge: 600 (10 min)
  7. Update n8n-webhook.ts with signature validation:
    - If config.N8N_WEBHOOK_SECRET set, require X-N8N-Signature header
    - Calculate HMAC-SHA256 of request body + secret
    - Compare with header signature (timing-safe comparison)

  Frontend Changes

  1. Add server-side middleware for route protection:
    - Create frontend/src/middleware.ts (Next.js 14 App Router):
  export async function middleware(request: NextRequest) {
    // Check user role from cookie/session
    // Redirect empresa users accessing /chat → /dashboard
    // Redirect recruiters accessing /recruiters → /dashboard
    // Redirect unauthenticated → /login
  }
  export const config = {
    matcher: ['/chat/:path*', '/recruiters/:path*', '/reports/:path*', ...]
  }
  2. Add client-side route guards for better UX:
    - Update Sidebar.tsx: only show routes based on role (already partially done)
    - Add route-level protection in layout.tsx or page.tsx for each role-specific route
    - Example: /app/recruiters/layout.tsx:
  export default async function RecruiterLayout({ children }) {
    const session = await getSession();
    if (session?.user?.role !== 'empresa') {
      redirect('/dashboard');
    }
    return children;
  }
  3. Improve error handling:
    - Catch 403 responses from API routes → show "No tienes permiso para esta acción"
    - Catch 401 responses → redirect to /login

  Integration Points

  1. N8n webhook → Backend:
    - n8n signs outbound webhooks (if secret configured)
    - Backend validates signature on /api/n8n-webhook and /api/candidates/:id/interview-scheduled
  2. Frontend → Backend:
    - All API calls include Authorization header
    - Backend validates role + company_id on each endpoint
    - Middleware catches unauthorized attempts early

  Security Considerations

  - Defense in depth: Client-side checks + server middleware + API route checks + RLS at DB
  - Webhook auth: Critical for n8n integration (prevents spoofing)
  - Suspended recruiter: Checked on every request after token validation
  - Company scope: Enforced at middleware level (not just RLS), allowing fast rejection
  - Token validation: Re-check on every request (not cached, to catch revocations)

  Testing

  - Test recruiting a route as wrong role → 403
  - Test accessing recruiter route with empresa token → redirected (middleware) + 403 (API)
  - Test suspended recruiter attempting login → 403 on first protected route
  - Test n8n webhook without signature → 401
  - Test n8n webhook with invalid signature → 401
  - Test n8n webhook with valid signature → 200 + candidate created

  Deliverables

  - Comprehensive auth/authorization service
  - Route guard middleware for all protected routes
  - Server-side middleware for Next.js routes
  - Webhook signature validation
  - Suspended recruiter enforcement

  ---
  PHASE 6: FRONTEND POLISH & RECRUITER 3-SECTION EXPERIENCE (Week 5-6, UI refinement)

  Objective

  Finish recruiter interface (Procesos, Chats, Perfil tabs); implement intuitive candidate status workflows; add search/filter on Procesos; styling + accessibility.

  Database Changes

  No new migrations

  Backend Changes

  Minor extensions:

  1. Extend GET /api/candidates (if building Procesos page):
    - Support filtering by status, source, date range
    - Query params: ?status=en_contacto&source=scraping&sort=created_at:desc&limit=20&offset=0
    - Scoped to user's company
    - Returns paginated results
  2. Extend GET /api/chats (session list endpoint):
    - If not already exists, create lightweight session list
    - Query: GET /api/chat/sessions?limit=5&offset=0
    - Scoped to recruiter + company
    - Returns: [{ id, name, created_at, message_count, candidate_count }, ...]

  Frontend Changes

  1. Refactor chat UI to 3-tab layout:
    - New file: frontend/src/app/recruiter/layout.tsx
    - Wraps 3 sections with tab navigation:
  [Procesos] [Chats] [Perfil]
    - Each tab lazy-loads its content
  2. Procesos (All Candidates):
    - Page: frontend/src/app/recruiter/procesos/page.tsx
    - Components:
        - ProcessFilterBar — Status, Source, Date range filters
      - ProcessList — Table view of all candidates
            - Columns: Avatar, Name, Position, Experience, Salary, Location, Status, Last Modified, Actions
        - Inline status change (dropdown)
        - Click row → candidate detail modal
      - CandidateDetailModal — Show full profile, status history, email log, add notes
    - Features:
        - Search by name/position
      - Filter by status (Rechazado, En Contacto, Seguimiento)
      - Filter by source (Scraping, Internal, Applicant)
      - Sort by date modified, name, status
      - Bulk actions: change status for multiple candidates (future)
  3. Chats (Query History):
    - Page: frontend/src/app/recruiter/chats/page.tsx
    - Show list of sessions (max 5)
    - Click to view/continue session
    - Redirect to main /chat interface but with session pre-loaded
    - Or: embed chat interface directly in this tab
  4. Perfil (Recruiter Profile):
    - Page: frontend/src/app/recruiter/profile/page.tsx
    - Components:
        - ProfileInfo — name, email, company, role label, joined date
      - ProfileStats — total chats, total candidates found, recent searches
      - ProfileActions — edit password, view company info (contact empresa admin), logout button
    - Features:
        - Read-only display of recruiter info
      - Change password form (links to backend /api/auth/change-password, if implemented)
      - Company info card (read-only): company name, logo, # recruiters, joined date
  5. Candidate Detail Modal:
    - New component: frontend/src/components/candidate/CandidateDetailModal.tsx
    - Sections:
        - Header: Avatar, Name, Position, Status (with color coding)
      - Contact: Email, LinkedIn URL, Phone
      - Profile: Experience, Salary, Location, Source, Created date
      - Status History: Timeline of status changes with reasons + changers
      - Email Log: List of emails sent to/about candidate
      - Notes: (if candidate_notes table exists from 003 migration)
      - Actions: Change status, add note, view on LinkedIn, open email client
  6. Styling & Theming:
    - Ensure consistent color coding:
        - Rechazado → Red (#EF4444)
      - En Contacto → Blue (#3B82F6)
      - Seguimiento → Amber (#F59E0B)
    - Use existing design tokens (if Semillero has a CSS theme file)
    - Responsive layout (mobile: stack tabs vertically, desktop: horizontal tabs)
  7. Accessibility:
    - All form inputs labeled + aria-labels
    - Modals: focus trap + close on Escape
    - Tables: sortable headers with aria-sort
    - Status indicators: not color-only (add text labels)

  Integration Points

  1. Procesos ↔ Chat:
    - Recruiter sees candidate in Procesos
    - Clicks "Add to Interview" (status → en_contacto)
    - Interview email sent via n8n
    - Status updated in Procesos
    - Breadcrumb: "Candidate → Found via: [Chat Session 3]" (if search history linked)
  2. Perfil ↔ Company Info:
    - Recruiter views own company (read-only)
    - Link to contact empresa admin: "¿Necesitas ayuda? Contacta a [empresa-admin-email]"

  Testing

  - Test Procesos loads and filters correctly
  - Test status change sends email automation
  - Test Chats shows ≤5 sessions
  - Test Perfil displays correct info
  - Test modal interactions (open, close, edit, save)
  - Test responsive layout on mobile

  Deliverables

  - 3-section recruiter experience (Procesos, Chats, Perfil)
  - Polished candidate detail modal
  - Status-based filtering + search
  - Accessibility improvements

  ---
  PHASE 7: PLATFORM MATURITY & FUTURE EXTENSIONS (Week 6+, Long-term)

  Objective

  Document remaining features, identify extension points, establish governance for future phases.

  Not In Scope (Documented for Future)

  1. Candidate Portal (Future Phase 7a):
    - Self-service login for candidates
    - Candidates view their own profile, status in recruitment process
    - Interview confirmation + Google Calendar integration
    - Decline/accept interview slots
    - Note: Requires new roles + auth flow, separate from current recruiter/empresa scope
  2. Bulk Operations (Future Phase 7b):
    - Bulk candidate import (CSV upload)
    - Bulk status change (select multiple, change status)
    - Bulk email (send message to all candidates in status X)
  3. Advanced Analytics (Future Phase 7c):
    - Recruiter performance dashboard: candidates found, interview-to-hire ratio, time-to-fill
    - Company analytics: recruitment funnel, cost-per-hire
    - Export reports to PDF/Excel
  4. Integration Marketplace (Future Phase 7d):
    - More n8n workflows (LinkedIn recruiter, email scraping, background checks)
    - Zapier integration (connect to other HRIS/ATS systems)

  Extension Points

  1. Webhook Handlers:
    - Register new n8n triggers in n8nService.ts
    - Add new POST endpoints for n8n callbacks
  2. Email Templates:
    - Expand candidate_email_log to track template variations
    - Support company-branded emails (via n8n, Resend templates)
  3. Candidate Fields:
    - Add new columns to candidates table as needed (e.g., skills, certifications)
    - Update SAFE_CANDIDATE_FIELDS in chat.ts accordingly
  4. Authorization Model:
    - Introduce team/department level within empresa (e.g., HR team, Engineering team)
    - Recruiters assigned to teams, can only see team's candidates
    - Empresa sees all teams + cross-team analytics

  Deliverables

  - Documentation of extension points
  - Roadmap for Candidate Portal, bulk ops, analytics
  - Architecture review & recommendations

  ---
  MIGRATION EXECUTION CHECKLIST

  Pre-Migration (Phase 0)

  - [ ] Backup Supabase database
  - [ ] Test migration scripts in staging environment
  - [ ] Verify all config vars set (OPENAI_API_KEY, SUPABASE_*, N8N_WEBHOOK_URL, etc.)

  Phase 1 (DB Normalization)

  - [ ] Run migrations 007-010 in order (Supabase SQL Editor or via backend migration runner)
  - [ ] Verify data transformation (old enums → new)
  - [ ] Test RLS policies still work
  - [ ] Update n8n-webhook.ts source value
  - [ ] Update chat.ts to include company_id in search_history

  Phase 2 (Recruiter CRUD)

  - [ ] Deploy backend companyAuthMiddleware + recruitersRouter
  - [ ] Deploy frontend Empresa admin page
  - [ ] Create test empresa + recruiter accounts
  - [ ] Verify role-based access control works

  Phase 3 (Chat Sessions)

  - [ ] Run migration 006 if not already (verify chat_sessions, chat_messages exist)
  - [ ] Refactor chat.ts to use sessions
  - [ ] Deploy recruiter 3-section UI
  - [ ] Test max 5 sessions enforcement
  - [ ] Verify N8n fallback triggers

  Phase 4 (Status Automation)

  - [ ] Run migration 012 (interview_data columns)
  - [ ] Deploy status update endpoint
  - [ ] Configure n8n interview flow + Google Calendar integration
  - [ ] Test email automation end-to-end

  Phase 5 (Security)

  - [ ] Deploy auth/authorization service + route guards
  - [ ] Add server-side middleware to Next.js routes
  - [ ] Enable webhook signature validation
  - [ ] Test 403s on unauthorized access

  Phase 6 (UI Polish)

  - [ ] Deploy recruiter 3-section layout
  - [ ] Test Procesos filtering + Chats listing + Perfil display
  - [ ] Accessibility review
  - [ ] Mobile testing

  Post-Deployment

  - [ ] Monitor backend logs for auth errors
  - [ ] Verify N8n webhook connectivity
  - [ ] Train empresa admins on recruiter management
  - [ ] Document user flows for recruiters + empresa

  ---
  CRITICAL FILES FOR IMPLEMENTATION

  Database Migrations (Sequential)

  - backend/src/db/migrations/007_fix_candidate_source_enum.sql
  - backend/src/db/migrations/008_fix_candidate_status_enum.sql
  - backend/src/db/migrations/009_fix_search_history_not_null.sql
  - backend/src/db/migrations/010_add_recruiter_crud_audit.sql
  - backend/src/db/migrations/011_add_recruiter_meta.sql
  - backend/src/db/migrations/012_add_interview_data.sql

  Backend Core

  - backend/src/config/index.ts — Add N8N_WEBHOOK_URL, INTERVIEW_CALLBACK_SECRET, etc.
  - backend/src/middlewares/companyAuth.ts — New: company-scoped auth
  - backend/src/middlewares/routeGuards.ts — New: role-based guards
  - backend/src/services/authService.ts — New: comprehensive auth logic
  - backend/src/services/n8nService.ts — New: outbound webhook + interview triggers
  - backend/src/services/recruiterService.ts — New: recruiter CRUD
  - backend/src/services/chatService.ts — New: session + message management
  - backend/src/routes/chat.ts — Refactor: session-based, company-scoped, N8n triggers
  - backend/src/routes/n8n-webhook.ts — Update: source enum, signature validation
  - backend/src/routes/recruiters.ts — New: empresa recruiter CRUD
  - backend/src/routes/candidates.ts — New: status change + interview scheduling
  - backend/src/routes/reports.ts — New: daily report endpoint
  - backend/src/app.ts — Mount new routes + middleware

  Frontend Core

  - frontend/src/types/index.ts — Reconcile types (roles, status, source)
  - frontend/src/middleware.ts — New: server-side route protection (if Next.js 14 middleware available)
  - frontend/src/components/layout/Sidebar.tsx — Update nav based on role + company
  - frontend/src/app/api/admin/users/route.ts — Keep for superAdmin backward compat
  - frontend/src/app/recruiters/page.tsx — New: empresa recruiter management page
  - frontend/src/app/recruiter/layout.tsx — New: 3-section wrapper (Procesos, Chats, Perfil)
  - frontend/src/app/recruiter/procesos/page.tsx — New: candidate list + filters
  - frontend/src/app/recruiter/chats/page.tsx — New: chat session history
  - frontend/src/app/recruiter/profile/page.tsx — New: recruiter profile
  - frontend/src/app/chat/page.tsx — Refactor: session-based UI
  - frontend/src/components/chat/CandidateResultsTable.tsx — New: search results
  - frontend/src/components/candidate/CandidateDetailModal.tsx — New: candidate detail view
  - Remove: frontend/src/app/apply/ (all)
  - Remove: frontend/src/app/api/apply/ (all)

  Integration & Config

  - .env.backend — Add N8N_WEBHOOK_URL, INTERVIEW_CALLBACK_SECRET
  - .env.frontend — No new env vars (all backend-side)
  - n8n Flow: "Interview Request & Google Calendar" (design + test separately)

  ---
  SUMMARY OF KEY DECISIONS

  ┌─────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────┐
  │                            Decision                             │                        Rationale                         │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Status enum 3-state ('rechazado', 'en_contacto', 'seguimiento') │ Matches user spec; 'en_contacto' triggers automation     │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ CandidateSource lowercase (internal, scraping, applicant)       │ Consistency across DB + code; fixes n8n enum violation   │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Interview automation via n8n webhook                            │ Avoids Google OAuth in backend; centralizes scheduling   │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Daily report via n8n Schedule Trigger                           │ Lightweight; no backend cron job needed                  │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Max 5 sessions + 5-message memory                               │ Balances context quality + storage; matches requirements │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Empresa role required for recruiter CRUD                        │ Enforces hierarchy; prevents recruiter self-creation     │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Server-side route protection (Next.js middleware)               │ Defense in depth; catches unauthorized access early      │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Deprecated apply portal (/apply/*)                              │ Scope reduction; new flow is recruiter-driven            │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Webhook signature validation (HMAC)                             │ Prevents n8n spoof; critical for interview automation    │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Soft-delete suspended recruiters                                │ Allows undo; audit trail preserved                       │
  └─────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘

  ---
  This plan is ready to execute phase-by-phase. Each phase is self-contained with clear dependencies. Estimated total duration: 6-7 weeks for full implementation +
  testing.

  Critical Files for Implementation
  │ Deprecated apply portal (/apply/*)                              │ Scope reduction; new flow is recruiter-driven            │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Webhook signature validation (HMAC)                             │ Prevents n8n spoof; critical for interview automation    │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Soft-delete suspended recruiters                                │ Allows undo; audit trail preserved                       │
  └─────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘

  ---
  This plan is ready to execute phase-by-phase. Each phase is self-contained with clear dependencies. Estimated total duration: 6-7 weeks for full implementation +
  testing.
  - backend/src/db/migrations/007_fix_candidate_source_enum.sql
  - backend/src/db/migrations/008_fix_candidate_status_enum.sql
  - backend/src/config/index.ts
  - backend/src/middlewares/companyAuth.ts
  - backend/src/services/n8nService.ts
  - backend/src/routes/chat.ts
  - backend/src/routes/recruiters.ts
  - backend/src/routes/chat.ts
  - backend/src/routes/recruiters.ts
  │ Empresa role required for recruiter CRUD                        │ Enforces hierarchy; prevents recruiter self-creation     │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Server-side route protection (Next.js middleware)               │ Defense in depth; catches unauthorized access early      │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Deprecated apply portal (/apply/*)                              │ Scope reduction; new flow is recruiter-driven            │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Webhook signature validation (HMAC)                             │ Prevents n8n spoof; critical for interview automation    │
  ├─────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
  │ Soft-delete suspended recruiters                                │ Allows undo; audit trail preserved                       │
  └─────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘

  ---
  This plan is ready to execute phase-by-phase. Each phase is self-contained with clear dependencies. Estimated total duration: 6-7 weeks for full implementation +
  testing.

  Critical Files for Implementation

  - backend/src/db/migrations/007_fix_candidate_source_enum.sql
  - backend/src/db/migrations/008_fix_candidate_status_enum.sql
  - backend/src/config/index.ts
  - backend/src/middlewares/companyAuth.ts
  - backend/src/services/n8nService.ts
  - backend/src/routes/chat.ts
  - backend/src/routes/recruiters.ts
  - frontend/src/types/index.ts
  - frontend/src/app/recruiter/layout.tsx
  - frontend/src/app/chat/page.tsx
  - frontend/src/components/layout/Sidebar.tsx