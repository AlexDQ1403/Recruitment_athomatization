# Semillero — Plataforma de Reclutamiento

Plataforma que automatiza el proceso de contratación: desde publicar una vacante hasta contratar al candidato, con búsqueda por inteligencia artificial y notificaciones automáticas por email.

> **¿Qué puede hacer esta plataforma?** Lee el manual completo en [FUNCIONALIDADES.md](./FUNCIONALIDADES.md).

---

## Requisitos

- Node.js 20+
- Una cuenta de [Supabase](https://supabase.com) (gratuita)
- Una API key de [OpenAI](https://platform.openai.com/api-keys)

---

## Inicio rápido

### 1. Clonar y configurar entorno

```bash
git clone <url-del-repo>
cd semillero
```

**Backend** (`backend/.env`):
```env
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3002
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=http://localhost:3001
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Supabase → Settings → API → service_role
RESEND_API_KEY=re_...              # resend.com → API Keys (opcional, para emails)
```

### 2. Configurar la base de datos en Supabase

En el SQL Editor de Supabase, ejecuta en orden:

1. `backend/src/db/migrations/002_supabase_schema.sql` — tablas principales (candidatos, perfiles, chat)
2. `backend/src/db/migrations/003_candidate_features.sql` — notas e historial de etapas
3. `backend/src/db/migrations/004_applicant_source.sql` — fuente "applicant" para portal público
4. `backend/src/db/migrations/005_vacancies.sql` — sistema de vacantes

Luego en **Storage → New bucket**:
- Nombre: `resumes`
- Public: ✅ (para que los links de CV sean accesibles)

### 3. Instalar dependencias y arrancar

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev   # → http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev   # → http://localhost:3002
```

Abre [http://localhost:3002](http://localhost:3002) en el navegador.

---

## Comandos disponibles

| Directorio | Comando | Descripción |
|---|---|---|
| `backend/` | `npm run dev` | Servidor Express con hot reload |
| `backend/` | `npm run typecheck` | Verificación de tipos TypeScript |
| `backend/` | `npm run test` | Tests con Vitest |
| `frontend/` | `npm run dev` | Next.js en modo desarrollo |
| `frontend/` | `npm run typecheck` | Verificación de tipos TypeScript |
| `frontend/` | `npm run test` | Tests con Vitest + React Testing Library |

---

## Arquitectura

```
semillero/
├── backend/          # Express — solo proxy de OpenAI (puerto 3001)
│   └── src/
│       ├── routes/chat.ts        # Único endpoint: POST /api/chat
│       ├── config/index.ts       # Validación de env vars (Zod)
│       └── utils/                # Logger (Winston) + tracing
│
└── frontend/         # Next.js 14 App Router (puerto 3002)
    └── src/
        ├── app/                  # Páginas + API routes
        │   ├── apply/            # Portal público de aplicación (sin login)
        │   ├── candidates/       # Gestión de candidatos
        │   ├── vacancies/        # Gestión de vacantes
        │   ├── chat/             # Búsqueda IA
        │   ├── dashboard/        # Estadísticas
        │   ├── history/          # Historial de búsquedas
        │   ├── users/            # Gestión de usuarios (superAdmin)
        │   └── api/              # API routes internas
        │       ├── chat/         # Proxy → backend Express
        │       ├── apply/        # Aplicación pública + upload CV
        │       ├── admin/users/  # CRUD usuarios con Supabase Admin SDK
        │       └── notify/       # Envío de emails con Resend
        ├── components/
        │   ├── apply/            # ApplyLanding, ApplyVacancyForm
        │   ├── candidates/       # CandidatesView, CandidateTable, KanbanBoard, CandidatePanel
        │   ├── vacancies/        # VacanciesView
        │   ├── chat/             # ChatView, SearchHistoryView
        │   ├── dashboard/        # DashboardView
        │   └── layout/           # AppShell + Sidebar (responsive)
        └── services/
            ├── candidateService.ts   # CRUD candidatos + notas + historial + CV upload
            └── vacancyService.ts     # CRUD vacantes
```

**Fuente única de datos:** Supabase. El backend Express existe únicamente para mantener `OPENAI_API_KEY` fuera del navegador.

**Flujo del chat IA:**
1. Usuario escribe → `ChatView` → `POST /api/chat` (Next.js proxy)
2. → `backend/routes/chat.ts` (valida token Supabase)
3. → OpenAI `gpt-4o-mini` con candidatos (sin datos sensibles)
4. GPT responde con IDs + razón de match → backend busca registros completos
5. Respuesta guardada en `chat_history`; búsquedas con resultados en `search_history`

---

## Roles de usuario

| Rol | Permisos |
|---|---|
| `superAdmin` | Todo: crear/eliminar usuarios, ver candidatos, usar chat IA, administrar pipeline |
| `recruiter` | Ver candidatos, cambiar estados, agregar notas, usar chat IA |

Los roles se gestionan en la tabla `profiles` de Supabase.

---

## CI

GitHub Actions corre en cada push/PR a `main`:
- TypeScript typecheck (backend + frontend)
- Tests Vitest (backend + frontend)

Ver `.github/workflows/ci.yml`.
