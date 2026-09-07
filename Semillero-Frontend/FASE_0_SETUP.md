# FASE 0: Setup de Base de Datos en Supabase

## 📋 Resumen

Esta fase implementa:
- ✅ Tabla `companies` (empresas)
- ✅ Jerarquía Empresa → Reclutador
- ✅ Nuevos estados de candidatos: `seguimiento`, `rechazado`, `contratacion`
- ✅ Endpoint webhook para n8n
- ✅ Sesiones de chat (máx 5 por reclutador)
- ✅ Historial de búsquedas por empresa

---

## 🚀 PASO 1: Ejecutar Migración en Supabase

### 1.1 Acceder a Supabase SQL Editor

1. Abre [app.supabase.com](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **SQL Editor** → **New Query**

### 1.2 Ejecutar Script de Migración

Copia y pega **COMPLETO** el contenido de:
```
backend/src/db/migrations/006_empresa_jerarquia.sql
```

**IMPORTANTE:**
- Ejecuta TODO el script de una vez (NO por partes)
- Si hay errores, léelos cuidadosamente (probablemente tablas que ya existen)
- Es seguro ejecutar múltiples veces (usa `IF NOT EXISTS`)

### 1.3 Verificar Tablas Creadas

En Supabase, ve a **Table Editor** y verifica que existan:
- ✅ `companies`
- ✅ `chat_sessions`
- ✅ `chat_messages`
- ✅ `search_history`

Y que `profiles` y `candidates` tengan las nuevas columnas:
- `profiles`: `company_id`
- `candidates`: `company_id`, `email`, `linkedin_url`, `n8n_request_id`, `n8n_search_date`

---

## 🎯 PASO 2: Crear Empresa de Prueba

### En Supabase Table Editor:

1. **Tabla `companies`** → Click en **Insert row**
   ```
   name: "Empresa Test"
   industry: "Tecnología"
   logo_url: null
   ```
   Copiar el `id` generado (UUID)

2. **Tabla `profiles`** → Actualizar un usuario existente:
   - Selecciona tu usuario
   - Establece `company_id` al UUID de la empresa
   - Cambia `role` a `recruiter` (o deja `superAdmin`)

---

## 🔌 PASO 3: Configurar Webhook de n8n

### 3.1 URL del Webhook

El backend expone:
```
POST http://localhost:3001/api/n8n-webhook
```

Pero en producción será:
```
POST https://tu-dominio.com/api/n8n-webhook
```

### 3.2 Body que n8n debe enviar

El webhook espera este JSON en el body:

```json
{
  "company_id": "uuid-de-empresa",
  "IdSolicitud": "id_unico_de_busqueda",
  "Nombre": "Juan Pérez",
  "Correo Personal": "juan@example.com",
  "urlLinkedin": "https://linkedin.com/in/juanperez",
  "Especializacion/descripcion": "Desarrollador React Senior",
  "Experiencia": 5,
  "Aspiracion": 5000000,
  "Fecha de busqueda": "2026-08-09T12:00:00Z"
}
```

**Notas importantes:**
- `company_id`: REQUERIDO (UUID)
- `Correo Personal`: Opcional (puede venir vacío)
- `urlLinkedin`: Opcional (puede venir vacío)
- `Experiencia`: Número (años de experiencia)
- `Aspiracion`: Número (salario esperado en COP)

### 3.3 Configurar en n8n

1. En tu flujo "Automated_Recruiter webhook"
2. Encuentra el nodo de salida (HTTP Request o Webhook Response)
3. Configura:

**Method:** `POST`
**URL:** `http://localhost:3001/api/n8n-webhook`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "company_id": "{{ $node['Trigger'].json.company_id }}",
  "IdSolicitud": "{{ $node['Trigger'].json.IdSolicitud }}",
  "Nombre": "{{ $node['Trigger'].json.Nombre }}",
  "Correo Personal": "{{ $node['Trigger'].json['Correo Personal'] }}",
  "urlLinkedin": "{{ $node['Trigger'].json.urlLinkedin }}",
  "Especializacion/descripcion": "{{ $node['Trigger'].json['Especializacion/descripcion'] }}",
  "Experiencia": "{{ $node['Trigger'].json.Experiencia }}",
  "Aspiracion": "{{ $node['Trigger'].json.Aspiracion }}",
  "Fecha de busqueda": "{{ $node['Trigger'].json['Fecha de busqueda'] }}"
}
```

**O si usas un nodo HTTP Request que llama a nuestro endpoint:**

```
POST {{ $env.BACKEND_URL }}/api/n8n-webhook
```

Con variables de entorno:
```
BACKEND_URL=http://localhost:3001/api (desarrollo)
BACKEND_URL=https://tu-dominio.com/api (producción)
```

### 3.4 Probar Webhook

**Opción A: cURL (desde terminal)**
```bash
curl -X POST http://localhost:3001/api/n8n-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "tu-uuid-empresa-aqui",
    "IdSolicitud": "test_001",
    "Nombre": "Test Candidate",
    "Correo Personal": "test@example.com",
    "urlLinkedin": "https://linkedin.com/in/test",
    "Especializacion/descripcion": "Developer",
    "Experiencia": 3,
    "Aspiracion": 4000000,
    "Fecha de busqueda": "2026-08-09T12:00:00Z"
  }'
```

**Opción B: Postman**
1. Crea un nuevo request `POST`
2. URL: `http://localhost:3001/api/n8n-webhook`
3. Tab **Body** → JSON
4. Pega el JSON de arriba (reemplazando `company_id` con tu UUID)
5. Click **Send**

**Respuesta esperada (éxito):**
```json
{
  "success": true,
  "action": "inserted",
  "candidate": {
    "id": "uuid-generado",
    "company_id": "tu-uuid-empresa",
    "full_name": "Test Candidate",
    "email": "test@example.com",
    ...
  }
}
```

**Respuesta si company_id no existe:**
```json
{
  "error": "Empresa uuid-invalid no encontrada"
}
```

---

## 🧪 PASO 4: Verificar en Supabase

Después de enviar candidatos por el webhook:

1. Ve a **Table Editor** → `candidates`
2. Deberías ver nuevas filas con:
   - `source`: "Web scraping"
   - `status`: "seguimiento"
   - `n8n_request_id`: el IdSolicitud que enviaste
   - `company_id`: la empresa que enviaste
   - `email` y `linkedin_url`: llenos (si los enviaste)

---

## 🔒 SEGURIDAD

### Email + LinkedIn NO se envían a GPT

En `backend/src/routes/chat.ts`, la constante `SAFE_CANDIDATE_FIELDS` excluye:
```typescript
const SAFE_CANDIDATE_FIELDS = [
  'id', 'full_name', 'position', 'experience_years', 
  'expected_salary', 'location', 'source', 'status', 'profile_url'
  // ❌ NO incluye: email, linkedin_url
];
```

Pero cuando retornamos candidatos al **reclutador**, SÍ incluimos email + linkedin (necesario para comunicarse).

---

## 📊 Cambios de Estructura

### Antes vs Ahora

| Aspecto | ANTES | AHORA |
|---|---|---|
| Roles | `superAdmin`, `recruiter` | `empresa`, `recruiter` |
| Fuentes | Interno, Web scraping, Aplicante | Interno, Web scraping |
| Estados | Pendiente, Entrevistado, Contratado, Rechazado | `seguimiento`, `rechazado`, `contratacion` |
| Candidatos | Globales | Por Empresa |
| Chat | Global | Por Sesión (máx 5 sesiones) |

### Nueva Jerarquía

```
Empresa (superAdmin)
  ├─ Reclutador 1
  ├─ Reclutador 2
  └─ ...

Cada Reclutador:
  ├─ Ve SOLO candidatos de su Empresa
  ├─ Puede cambiar estado: seguimiento → rechazado → contratacion
  └─ Tiene máx 5 sesiones de chat
```

---

## ⚠️ Troubleshooting

### "Error: relation 'companies' does not exist"
- Ejecutaste solo parte del script SQL
- **Solución:** Ejecuta TODO el script de una vez

### "company_id is required"
- n8n no está enviando `company_id` en el body
- **Solución:** Revisa la configuración de n8n webhook (PASO 3.3)

### "Empresa uuid-invalid no encontrada"
- El `company_id` que enviaste no existe en Supabase
- **Solución:** Copia el UUID correcto de la tabla `companies`

### "No candidates visible in chat"
- Probablemente RLS está bloqueando
- **Solución:** Verifica que `user.company_id` coincida con `candidate.company_id`

---

## ✅ Checklist Final

- [ ] Ejecuté el script SQL 006_empresa_jerarquia.sql
- [ ] Verifiqué que existan todas las tablas nuevas
- [ ] Creé una empresa de prueba
- [ ] Asigné mi usuario a esa empresa
- [ ] Probé el webhook con cURL o Postman
- [ ] Vi el candidato en Supabase Table Editor
- [ ] El backend compila sin errores (`npm run typecheck`)

---

## 📞 Próximos Pasos

Después de FASE 0:

**FASE 1:** Eliminar portal público (`/apply`)
**FASE 2:** Implementar jerarquía en Frontend
**FASE 3:** Cambiar endpoint `/api/chat` para filtrar por empresa
**FASE 4:** Implementar sesiones de chat (máx 5)
**FASE 5:** Validaciones de RLS en endpoints

---

*Documento creado: 2026-08-09*
*FASE 0: Setup de Base de Datos*
