# 📋 PLAN EJECUTIVO - REESTRUCTURACIÓN DEL PROYECTO

## 🎯 Objetivo General

Transformar **Semillero** de una plataforma monolítica global a una **plataforma multi-empresa** donde:
- Empresas gestionan sus propios Reclutadores
- Reclutadores buscan candidatos dentro de su empresa
- n8n trae candidatos automáticamente
- Chats organizados en sesiones con límite de 5

---

## 📊 ESTADO ACTUAL (Después de FASE 0)

### ✅ Completado

**Base de Datos:**
- ✅ Tabla `companies` (empresas)
- ✅ Relación `profiles.company_id` → `companies`
- ✅ Candidatos asociados a empresas
- ✅ Nuevos estados: `seguimiento`, `rechazado`, `contratacion`
- ✅ Sesiones de chat y mensajes
- ✅ Historial de búsquedas por empresa
- ✅ RLS configurado para privacidad

**Backend:**
- ✅ Endpoint `/api/n8n-webhook` operativo
- ✅ Validación de company_id
- ✅ Inserción/actualización de candidatos
- ✅ Logging y correlationId

**Frontend (Tipos):**
- ✅ Nuevos tipos: `Company`, `ChatSession`, `ChatMessage`
- ✅ Roles actualizados: `empresa` + `recruiter`
- ✅ Estados simplificados
- ✅ Candidatos con `company_id` + email + linkedin

---

## 🚀 ROADMAP DE FASES

### FASE 0: ✅ HECHO - Setup de Base de Datos
**Estado:** Completo
**Tiempo:** Ya invertido
**Próximo:** Ejecutar en Supabase + probar webhook

---

### FASE 1: 🔄 ELIMINAR PORTAL PÚBLICO
**Objetivo:** Remover la capacidad pública de aplicar

**Archivos a eliminar:**
```
frontend/src/app/apply/
frontend/src/app/api/apply/
frontend/src/components/apply/
```

**Archivos a actualizar:**
```
frontend/src/types/index.ts (eliminar fuente "Aplicante")
frontend/src/components/layout/Sidebar.tsx (remover enlace /apply)
```

**Tiempo estimado:** 30 min
**Complejidad:** Baja

---

### FASE 2: 🔄 JERARQUÍA EMPRESA EN FRONTEND
**Objetivo:** Que un empresa pueda crear/gestionar reclutadores

**Cambios:**
```
Nueva página: /companies
├─ Ver empresas
├─ Crear empresa (solo si eres superAdmin global)
├─ Asignar reclutadores a empresa
└─ Ver candidatos de la empresa

Nueva página: /company-users
├─ Listar reclutadores de tu empresa
├─ Crear reclutador
└─ Eliminar reclutador
```

**Backend (nuevo):**
```
POST /api/companies           (crear empresa)
GET /api/companies/:id        (ver empresa + reclutadores)
PUT /api/companies/:id        (actualizar empresa)
DELETE /api/companies/:id     (eliminar empresa)
GET /api/companies/:id/users  (reclutadores de empresa)
```

**Tiempo estimado:** 4-6 horas
**Complejidad:** Media

---

### FASE 3: 🔄 FILTRAR CHAT POR EMPRESA
**Objetivo:** Que el chat de GPT solo vea candidatos de la empresa del reclutador

**Cambios en `/api/chat`:**
```
ANTES:
SELECT * FROM candidates LIMIT 150

AHORA:
SELECT * FROM candidates 
WHERE company_id = user.company_id
AND status != 'rechazado'
LIMIT 150
```

**También:**
- ✅ NO incluir email + linkedin en prompt a GPT
- ✅ SÍ incluir email + linkedin en respuesta al reclutador
- ✅ Validar que user.company_id existe

**Tiempo estimado:** 1-2 horas
**Complejidad:** Baja

---

### FASE 4: 🔄 SESIONES DE CHAT (máx 5)
**Objetivo:** Cambiar de chat global a sesiones limitadas

**Cambios en Frontend:**
```
/chat page (totalmente reescrita)
├─ Sidebar izquierdo: Lista de sesiones
│  ├─ Mostrar hasta 5 sesiones
│  ├─ Click para cargar sesión
│  ├─ "Ⓧ" para eliminar sesión
│  └─ "+ Nueva" para crear
│
└─ Panel derecho: Chat
   ├─ Mostrar último mensaje de sesión
   ├─ Input bar
   └─ Límite de 5 mensajes por sesión
```

**Cambios en Backend:**
```
POST /api/chat-sessions (crear sesión)
GET /api/chat-sessions (listar sesiones)
DELETE /api/chat-sessions/:id (eliminar)
POST /api/chat (enviar mensaje)
├─ Requiere: session_id en body
├─ Valida: máx 5 mensajes por sesión
└─ Guarda en: chat_messages (no chat_history)
```

**Tiempo estimado:** 6-8 horas
**Complejidad:** Alta

---

### FASE 5: 🔄 CAMBIO DE ESTADOS
**Objetivo:** Implementar flujo de estados de candidatos

**Cambios en Backend:**
```
PUT /api/candidates/:id/status
├─ Body: { status: "seguimiento" | "rechazado" | "contratacion" }
├─ Valida: user.company_id == candidate.company_id
├─ Si status == "contratacion":
│  └─ Llama webhook a n8n para generar informe
└─ Guarda en: candidates.status
```

**Cambios en Frontend:**
```
/candidates (actualizar)
├─ Cambiar estado inline (dropdown)
├─ Validar que estado sea válido
└─ Actualizar optimistamente
```

**Tiempo estimado:** 3-4 horas
**Complejidad:** Media

---

### FASE 6: 🔄 FLUJO COMPLETO DE CONTRATACIÓN
**Objetivo:** Cuando estado = "contratacion", generar informe en n8n

**Backend:**
```
Al cambiar estado a "contratacion":
├─ UPDATE candidates SET status = 'contratacion'
└─ POST http://localhost:5678/webhook-test/procesoReclutamiento
   {
     "action": "contract_report",
     "company_id": candidate.company_id,
     "candidate": {...}
   }
```

**n8n:**
```
Recibe webhook
├─ Extrae company_id
├─ Genera informe (PDF o email)
└─ Envía a empresa
```

**Tiempo estimado:** 2-3 horas
**Complejidad:** Baja (solo coordinar con n8n)

---

## 📅 CRONOGRAMA SUGERIDO

| Fase | Descripción | Tiempo | Fecha Estimada |
|---|---|---|---|
| **0** | Setup BD | 1h | ✅ Hoy |
| **1** | Eliminar /apply | 30min | Hoy |
| **2** | Jerarquía empresa | 5h | Mañana |
| **3** | Filtrar chat | 2h | Pasado mañana |
| **4** | Sesiones chat | 7h | Próxima semana |
| **5** | Estados | 3h | Próxima semana |
| **6** | n8n contract | 2h | Próxima semana |
| **Testing** | QA y fixes | 4h | Próxima semana |
| **TOTAL** | | ~24h | ~10 días (part-time) |

---

## 🎓 PRÓXIMO PASO RECOMENDADO

### Opción A: Ejecutar FASE 0 Ahora ⭐ RECOMENDADO
1. Ejecutar script SQL en Supabase (5 min)
2. Crear empresa de prueba (2 min)
3. Probar webhook con cURL/Postman (5 min)
4. Verificar que backend compila sin errores (5 min)
5. **TOTAL: 15 min**

**Ventajas:**
- Validar que toda la BD está bien
- Probar el flujo n8n antes de continuar
- Tener base sólida para FASE 1

### Opción B: Empezar FASE 1 Directamente
Pasar a eliminar portal público sin validar FASE 0

**Riesgo:**
- Si FASE 0 tiene errores, FASE 1 se verá afectada

---

## 📝 DECISIÓN REQUERIDA

¿Qué hacemos ahora?

**Responde sí o no a cada pregunta:**

1. **¿Ejecutamos FASE 0 (probar webhook) primero?**
   - ✅ Sí, queremos validar
   - ❌ No, directamente FASE 1

2. **¿Usamos fullstack-guardian para FASE 1?**
   - ✅ Sí, para calidad de código
   - ❌ No, vamos rápido

3. **¿Queremos que agreguemos tests?**
   - ✅ Sí, testes en cada fase
   - ❌ No, solo después

---

## 💡 Notas Importantes

### Email + LinkedIn URL
✅ **GUARDADOS en BD** (vital para comunicación)
✅ **VISIBLES al reclutador** (puede contactar)
❌ **OCULTOS de GPT** (seguridad)

### Supabase vs Local
✅ **Elegiste: Supabase** ($0-25/mes)
- Cero mantenimiento
- Auth integrado
- Backups automáticos
- Plan Free suficiente para MVP

### Webhook de n8n
✅ **Company_id en body** (como pediste)
```
POST /api/n8n-webhook
{
  "company_id": "uuid",
  "IdSolicitud": "...",
  "Nombre": "...",
  ...
}
```

---

## 📚 Documentos Creados

```
FASE_0_SETUP.md          ← Instrucciones detalladas para ejecutar FASE 0
FASE_0_RESUMEN.md        ← Visualización de cambios en BD y backend
PLAN_EJECUTIVO.md        ← Este documento (roadmap completo)
```

**Ubicación:**
```
/Semillero-Frontend/
├── FASE_0_SETUP.md
├── FASE_0_RESUMEN.md
├── PLAN_EJECUTIVO.md
├── backend/
│   └── src/db/migrations/006_empresa_jerarquia.sql
│   └── src/routes/n8n-webhook.ts
└── frontend/
    └── src/types/index.ts (actualizado)
```

---

## ✨ Resumen

**¿Qué logramos en FASE 0?**
- ✅ Tabla `companies` para empresas
- ✅ Jerarquía empresa → reclutador en BD
- ✅ Webhook de n8n completamente funcional
- ✅ Sesiones y mensajes de chat preparados
- ✅ Tipos TypeScript modernos
- ✅ Seguridad con RLS

**¿Qué sigue?**
- 🔄 FASE 1: Eliminar portal público
- 🔄 FASE 2: UI de empresas
- 🔄 FASE 3-6: Mejoras progresivas

**¿Qué falta?**
- Ejecutar FASE 0 en Supabase (15 min)
- Eliminar portal público (30 min)
- Actualizar rutas de chat (2 horas)
- Sesiones en UI (7 horas)

---

*Documento creado: 2026-08-09*
*Reestructuración: En curso*
