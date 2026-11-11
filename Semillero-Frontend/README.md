# Kmella (Semillero) — Plataforma de Reclutamiento

Plataforma de reclutamiento multi-empresa: las empresas publican vacantes, los reclutadores buscan candidatos con un chat de IA y los candidatos gestionan su hoja de vida y sus postulaciones.

> **¿Qué puede hacer esta plataforma?** Lee el manual en [FUNCIONALIDADES.md](./FUNCIONALIDADES.md).
> **Despliegue de prueba en Render:** [DEPLOY_PRUEBA.md](./DEPLOY_PRUEBA.md).

---

## Requisitos

- Node.js 22+
- Un proyecto de [Supabase](https://supabase.com)
- Una API key de [OpenRouter](https://openrouter.ai/keys) o de [OpenAI](https://platform.openai.com/api-keys)

---

## Inicio rápido

### 1. Variables de entorno

Copia los ejemplos y complétalos:

- `backend/.env` ← [backend/.env.example](./backend/.env.example)
- `frontend/.env.local` ← `frontend/.env.local.example`

```env
# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_API_URL=http://localhost:3001/api
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # Supabase → Settings → API
```

### 2. Base de datos en Supabase

En el SQL Editor ejecuta, en orden, los archivos de [backend/src/db/migrations/](./backend/src/db/migrations/): primero `002_esquema_base.sql` y después `003` → `031`. Todos son idempotentes.

En **Storage** crea el bucket público `avatars` (fotos de perfil). El bucket privado `resumes` (hojas de vida) lo crea el backend solo.

Opcional, para probar con datos: [backend/src/db/seed_dev.sql](./backend/src/db/seed_dev.sql) y `npm run seed:test-accounts` en `backend/`.

### 3. Instalar y arrancar

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev   # → http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm install
PORT=3002 npm run dev   # → http://localhost:3002
```

---

## Comandos

| Directorio | Comando | Descripción |
|---|---|---|
| `backend/` | `npm run dev` | Express con hot reload |
| `backend/` | `npm run typecheck` | Verificación de tipos |
| `backend/` | `npm run test` | Tests (Vitest) |
| `backend/` | `npm run check:schema` | Revisa que la base tenga las columnas que usa el código |
| `frontend/` | `npm run dev` | Next.js en desarrollo |
| `frontend/` | `npm run typecheck` | Verificación de tipos |
| `frontend/` | `npm run test` | Tests (Vitest + React Testing Library) |

---

## Arquitectura

```
Semillero-Frontend/
├── backend/            # API Express (puerto 3001)
│   ├── src/routes/     # chat, candidatos, vacantes, portal del candidato, empresa, reportes…
│   ├── src/services/   # LLM, afinidad, extracción de HV, ofertas externas, n8n…
│   ├── src/db/migrations/
│   └── n8n/            # n8n local (docker compose) y sus flujos
├── frontend/           # Next.js 14 App Router (puerto 3002)
│   └── src/
│       ├── app/        # Páginas y API routes (proxy autenticado al backend)
│       ├── components/
│       └── services/
├── deploy/n8n/         # Imagen de n8n para Render
├── specs/              # Diseños de las funcionalidades
└── render.yaml         # Blueprint de Render
```

- **Datos:** Supabase (Postgres + Auth + Storage). El navegador habla con las API routes de Next.js, que reenvían al backend con el token de la sesión; el backend valida rol y empresa y usa la service role para las escrituras.
- **IA:** el chat del reclutador y la extracción/consejos de HV llaman al LLM desde el backend (la clave nunca llega al navegador).
- **n8n:** busca candidatos externos (LinkedIn vía SerpApi) y devuelve resultados al webhook `/api/n8n-webhook`.

---

## Roles

| Rol | Qué hace |
|---|---|
| `superAdmin` | Administra usuarios de la plataforma |
| `empresa` | Publica vacantes, gestiona sus reclutadores y decide sobre los candidatos que le presentan |
| `recruiter` | Busca candidatos con el chat de IA, los contacta y los presenta a la empresa |
| `candidato` | Sube su HV, ve vacantes con su % de afinidad y sigue sus postulaciones |

---

## CI

GitHub Actions ([.github/workflows/ci.yml](../.github/workflows/ci.yml), en la raíz del repositorio) corre typecheck y tests del backend y del frontend en cada push a `main` o `Desarrollo` y en cada PR a `main`.
