# ✅ EJECUTAR FASE 0 - Paso a Paso

## 🎯 Objetivo
Crear estructura de BD en Supabase para soportar empresas, reclutadores y webhook de n8n.

---

## 📋 PASO 1: Ir a Supabase SQL Editor

1. Abre [app.supabase.com](https://app.supabase.com)
2. Selecciona tu proyecto **Semillero**
3. Ve a **SQL Editor** (lado izquierdo)
4. Click en **New Query** (botón azul)

---

## 🔗 PASO 2: Copiar Script

**Abre este archivo:**
```
backend/src/db/migrations/006_empresa_jerarquia.sql
```

**Copia TODO el contenido** (Ctrl+A, Ctrl+C)

---

## 💾 PASO 3: Pegar en Supabase

En la ventana de SQL Editor de Supabase:
1. Click en el área de texto (donde dice "Enter some SQL")
2. Pega TODO el script (Ctrl+V)
3. Verifica que veas TODO el texto (desplázate hasta el final)

---

## ▶️ PASO 4: Ejecutar Script

Click en el botón **Run** (botón azul, esquina superior derecha)

**Espera a que termine** (debería tomar 2-3 segundos)

---

## ✨ PASO 5: Verificar Éxito

**Si ves un mensaje verde que dice:**
```
✓ Success. No rows returned
```

**FELICIDADES - El script pasó sin errores** ✅

Si ves un error rojo, copia el mensaje y comparte conmigo.

---

## 🔍 PASO 6: Verificar Tablas Creadas

En Supabase, ve a **Table Editor** (lado izquierdo):

Verifica que existan estas tablas:
- ✅ `companies`
- ✅ `chat_sessions`
- ✅ `chat_messages`
- ✅ `search_history`

Y que `candidates` tenga estas columnas:
- ✅ `company_id`
- ✅ `email`
- ✅ `linkedin_url`
- ✅ `n8n_request_id`
- ✅ `n8n_search_date`

---

## 🧪 PASO 7: Crear Empresa de Prueba

### En Supabase Table Editor:

1. Click en tabla **`companies`**
2. Click en **Insert row** (botón "+")
3. Llena:
   - `name`: `"Empresa Test"`
   - `industry`: `"Tecnología"`
   - `logo_url`: dejar vacío
4. Click en **Save** (o Enter)

**Copia el UUID generado** (ej: `550e8400-e29b-41d4-a716-446655440000`)

---

## 👤 PASO 8: Asignar Empresa a tu Usuario

1. Ve a tabla **`profiles`**
2. Busca tu usuario (normalmente el primero)
3. Click en la fila para editar
4. Campo `company_id`: pega el UUID de la empresa
5. Campo `role`: asegúrate que dice `"recruiter"` o `"empresa"`
6. Click en **Save**

---

## 🌐 PASO 9: Probar Webhook de n8n

### Con cURL (desde terminal):

```bash
curl -X POST http://localhost:3001/api/n8n-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "PEGA_AQUI_EL_UUID_DE_LA_EMPRESA",
    "IdSolicitud": "test_001",
    "Nombre": "Juan Pérez Test",
    "Correo Personal": "juan@example.com",
    "urlLinkedin": "https://linkedin.com/in/juan",
    "Especializacion/descripcion": "Desarrollador Senior",
    "Experiencia": 5,
    "Aspiracion": 5000000,
    "Fecha de busqueda": "2026-08-09T12:00:00Z"
  }'
```

**Reemplaza** `PEGA_AQUI_EL_UUID_DE_LA_EMPRESA` con el UUID de la empresa que creaste.

---

## ✅ PASO 10: Verificar Candidato Insertado

1. En Supabase Table Editor, ve a **`candidates`**
2. Busca un candidato con:
   - `full_name`: "Juan Pérez Test"
   - `source`: "Web scraping"
   - `status`: "seguimiento"
   - `company_id`: el UUID de tu empresa

Si ves estos datos, **TODO FUNCIONÓ CORRECTAMENTE** ✅

---

## 📊 Resultado Esperado

**Respuesta del webhook (en terminal):**
```json
{
  "success": true,
  "action": "inserted",
  "candidate": {
    "id": "uuid-generado",
    "company_id": "tu-uuid-empresa",
    "full_name": "Juan Pérez Test",
    "email": "juan@example.com",
    "linkedin_url": "https://linkedin.com/in/juan",
    "position": "Desarrollador Senior",
    "experience_years": 5,
    "expected_salary": 5000000,
    "source": "Web scraping",
    "status": "seguimiento",
    "n8n_request_id": "test_001",
    ...
  }
}
```

---

## ⚠️ Si Hay Errores

### "syntax error at or near..."
**Problema:** Script copiado parcialmente
**Solución:** Vuelve al PASO 2 y copia TODO el archivo

### "Empresa uuid no encontrada"
**Problema:** El UUID de la empresa es incorrecto
**Solución:** Verifica que copiaste bien el UUID en PASO 8

### "No authorization"
**Problema:** El backend no está corriendo
**Solución:** 
```bash
cd backend
npm run dev
```

---

## ✨ Checklist Final

- [ ] Ejecuté script en Supabase
- [ ] Vi mensaje de éxito ✓
- [ ] Verifiqué que existen las 4 tablas nuevas
- [ ] Creé empresa de prueba
- [ ] Asigné empresa a mi usuario
- [ ] Probé webhook con cURL
- [ ] Vi candidato en tabla `candidates`

**Si todo está marcado: ✅ FASE 0 COMPLETADA**

---

## 🎉 Siguiente Paso

Después de validar FASE 0:

**FASE 1:** Eliminar portal público (`/apply`)
- Tiempo: 30 min
- Complejidad: Baja

¿Continuamos?

---

*Instrucciones FASE 0 - 2026-08-09*
