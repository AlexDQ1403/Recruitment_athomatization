# 📊 FASE 0: RESUMEN EJECUTIVO

## ✅ Lo que creamos

### **Base de Datos (Supabase)**

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE SCHEMA                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  companies                                                   │
│  ├─ id (UUID)                                               │
│  ├─ name                                                    │
│  ├─ industry                                                │
│  └─ logo_url                                                │
│                                                              │
│  profiles (MODIFICADO)                                      │
│  ├─ id, email, full_name, role                              │
│  └─ company_id ← FK companies                               │
│                                                              │
│  candidates (MODIFICADO)                                    │
│  ├─ id, full_name, position, status                         │
│  ├─ email ★ (VITAL - para comunicación)                    │
│  ├─ linkedin_url ★ (VITAL - para comunicación)             │
│  ├─ experience_years, expected_salary, location            │
│  ├─ source ('Interno' | 'Web scraping')                    │
│  ├─ status ('seguimiento' | 'rechazado' | 'contratacion')  │
│  ├─ company_id ← FK companies                               │
│  └─ n8n_request_id, n8n_search_date (meta)                 │
│                                                              │
│  chat_sessions (NUEVO)                                      │
│  ├─ id, user_id, company_id                                 │
│  ├─ name ("Sesión 1", etc)                                  │
│  └─ created_at, updated_at                                  │
│                                                              │
│  chat_messages (NUEVO)                                      │
│  ├─ id, session_id (FK chat_sessions)                       │
│  ├─ role ('user' | 'assistant')                             │
│  ├─ content                                                 │
│  └─ candidates (JSON array)                                 │
│                                                              │
│  search_history (NUEVO)                                     │
│  ├─ id, user_id, company_id                                 │
│  ├─ query, candidates_found                                 │
│  └─ created_at                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### **Backend (Node.js/Express)**

```
┌─────────────────────────────────────────────────────────────┐
│            NEW ENDPOINT: n8n Webhook                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /api/n8n-webhook                                      │
│  ├─ Input: JSON con datos de candidato                      │
│  │  {                                                       │
│  │    "company_id": "uuid",                                │
│  │    "IdSolicitud": "id_busqueda",                        │
│  │    "Nombre": "Juan Pérez",                              │
│  │    "Correo Personal": "juan@example.com",               │
│  │    "urlLinkedin": "https://linkedin.com/...",          │
│  │    "Especializacion/descripcion": "Developer",          │
│  │    "Experiencia": 5,                                    │
│  │    "Aspiracion": 5000000,                               │
│  │    "Fecha de busqueda": "2026-08-09T12:00:00Z"         │
│  │  }                                                      │
│  │                                                          │
│  ├─ Validaciones:                                          │
│  │  ✓ company_id existe                                    │
│  │  ✓ Nombre e IdSolicitud obligatorios                   │
│  │  ✓ Detecta duplicados (n8n_request_id)                 │
│  │                                                          │
│  └─ Output: 201 + candidate object                         │
│     {                                                      │
│       "success": true,                                     │
│       "action": "inserted|updated",                        │
│       "candidate": {...}                                   │
│     }                                                      │
│                                                              │
│  File: backend/src/routes/n8n-webhook.ts                    │
│  Registered: backend/src/app.ts                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### **Frontend (Types)**

```typescript
// Nuevos tipos en frontend/src/types/index.ts

type UserRole = 'empresa' | 'recruiter';
type CandidateStatus = 'seguimiento' | 'rechazado' | 'contratacion';
type CandidateSource = 'Interno' | 'Web scraping';

interface Company {
  id: string;
  name: string;
  industry?: string;
  logo_url?: string;
}

interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string;  // ← NUEVO
  company?: Company;   // ← NUEVO
}

interface Candidate {
  id: string;
  company_id: string;  // ← NUEVO
  full_name: string;
  email?: string;      // ← NUEVO (VITAL)
  linkedin_url?: string; // ← NUEVO (VITAL)
  position: string;
  experience_years?: number;
  expected_salary?: number;
  location?: string;
  status: CandidateStatus;  // ← CAMBIADO
  source: CandidateSource;  // ← SIMPLIFICADO
  profile_url?: string;
  n8n_request_id?: string;  // ← NUEVO
  n8n_search_date?: string; // ← NUEVO
}

interface ChatSession {  // ← NUEVO
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  session_id: string;  // ← NUEVO (antes no existía)
  role: 'user' | 'assistant';
  content: string;
  candidates?: Candidate[];
  created_at: string;
}

interface SearchHistory {
  id: string;
  company_id: string;  // ← NUEVO
  user_id: string;
  query: string;
  candidates_found: number;
  created_at: string;
}
```

---

## 🔄 Flujo Actual de Datos (FASE 0)

```
n8n Webhook (LinkedIn Scraping)
         ↓
    Genera Candidatos
         ↓
  POST /api/n8n-webhook
  {
    company_id: "abc123",
    Nombre: "Juan",
    Correo: "juan@mail.com",
    urlLinkedin: "linkedin.com/...",
    ...
  }
         ↓
  Backend (n8n-webhook.ts)
  ├─ Valida company_id
  ├─ Busca duplicados (n8n_request_id)
  ├─ Inserta o actualiza candidato
  └─ Retorna {success, candidate}
         ↓
  Supabase: INSERT INTO candidates
  {
    company_id: "abc123",
    full_name: "Juan",
    email: "juan@mail.com",
    linkedin_url: "linkedin.com/...",
    source: "Web scraping",
    status: "seguimiento",
    n8n_request_id: "n8n_001",
    ...
  }
         ↓
  Candidato disponible para Reclutador
```

---

## 📋 Cambios Estructurales

### USUARIOS/ROLES

**ANTES:**
```
superAdmin (global)
Recruiter (global)
```

**AHORA:**
```
empresa (superAdmin de empresa)
  └─ Solo ve sus reclutadores y candidatos
  
recruiter (dentro de empresa)
  └─ Solo ve candidatos de su empresa
```

### CANDIDATOS

**ANTES:**
```
status: 'Pendiente' | 'Entrevistado' | 'Contratado' | 'Rechazado'
source: 'Interno' | 'Web scraping' | 'Aplicante'
Alcance: Global
```

**AHORA:**
```
status: 'seguimiento' | 'rechazado' | 'contratacion'
source: 'Interno' | 'Web scraping'
Alcance: Por Empresa
Email + LinkedIn: VISIBLE (vital para comunicación)
```

### CHAT

**ANTES:**
```
chat_history: todos los mensajes globales
Historial: últimos 6 mensajes del usuario
```

**AHORA:**
```
chat_sessions: máx 5 sesiones por reclutador
chat_messages: máx 5 mensajes por sesión
search_history: por empresa (no por usuario)
```

---

## 🔒 Seguridad (RLS en Supabase)

### Row Level Security Habilitado:

**candidates:**
```sql
-- Reclutador solo ve candidatos de su empresa
SELECT * FROM candidates 
WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
```

**chat_sessions:**
```sql
-- Usuario solo ve sus propias sesiones
SELECT * FROM chat_sessions 
WHERE user_id = auth.uid()
```

**chat_messages:**
```sql
-- Usuario solo ve mensajes de sus sesiones
SELECT * FROM chat_messages 
WHERE session_id IN (
  SELECT id FROM chat_sessions WHERE user_id = auth.uid()
)
```

---

## 📦 Archivos Modificados/Creados

### ✅ CREADOS:
```
backend/src/db/migrations/006_empresa_jerarquia.sql
backend/src/routes/n8n-webhook.ts
FASE_0_SETUP.md (documento de instrucciones)
FASE_0_RESUMEN.md (este archivo)
```

### ✨ MODIFICADOS:
```
frontend/src/types/index.ts (tipos actualizados)
backend/src/app.ts (registra webhook route)
```

### ⚠️ NO MODIFICADOS (aún):
```
backend/src/routes/chat.ts (próxima fase)
frontend/src/components/chat/ChatView.tsx (próxima fase)
frontend/src/app/apply/* (se eliminará en FASE 1)
```

---

## 🎯 Próximas Fases

```
FASE 0: ✅ HECHO - Setup de BD
  ├─ Tablas creadas
  ├─ Webhook de n8n implementado
  └─ Tipos actualizados

FASE 1: 🔄 SIGUIENTE - Eliminar Portal Público
  ├─ Borrar /apply (frontend)
  ├─ Borrar /api/apply (backend)
  └─ Actualizar rutas

FASE 2: 🔄 SIGUIENTE - Jerarquía en Frontend
  ├─ Nueva página /companies (solo empresa)
  ├─ CRUD de empresas
  └─ Asignar reclutadores

FASE 3: 🔄 SIGUIENTE - Filtrar Chat por Empresa
  ├─ Actualizar /api/chat para usar company_id
  ├─ Excluir candidatos rechazados
  └─ Ocultar email + linkedin de GPT

FASE 4: 🔄 SIGUIENTE - Sesiones de Chat
  ├─ Límite de 5 sesiones
  ├─ UI sidebar con lista de sesiones
  └─ Límite de 5 mensajes por sesión

FASE 5: 🔄 SIGUIENTE - Cambio de Estados
  ├─ Endpoint para cambiar status
  ├─ Validar empresa
  └─ Webhook a n8n para "contratacion"
```

---

## ✅ CHECKLIST PARA EJECUTAR FASE 0

- [ ] Leer `FASE_0_SETUP.md` completo
- [ ] Ejecutar script SQL en Supabase
- [ ] Crear empresa de prueba
- [ ] Asignar usuario a empresa
- [ ] Probar webhook (cURL o Postman)
- [ ] Verificar candidato en Supabase
- [ ] `npm run typecheck` en backend (sin errores)
- [ ] `npm run typecheck` en frontend (sin errores)
- [ ] Backend inicia (`npm run dev`)
- [ ] ✅ FASE 0 COMPLETA

---

*FASE 0 Completada: 2026-08-09*
*Próxima: FASE 1 - Eliminar Portal Público*
