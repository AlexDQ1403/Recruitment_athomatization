# Auditoría de seguridad de la capa de datos — Semillero

**Fecha:** 2026-09-03
**Alcance:** esquema Supabase, políticas RLS, y el código backend/frontend que accede a la base.
**Método:** revisión de las migraciones 003→012, del router Express y de los servicios del frontend.

---

## Contexto que hace que esto importe

`NEXT_PUBLIC_SUPABASE_ANON_KEY` viaja en el bundle del navegador: es pública por diseño.
Cualquiera puede tomarla y consultar Supabase **directamente**, sin pasar por el frontend ni
por Express. Por eso las políticas RLS no son una capa secundaria de defensa: son *la* frontera
de seguridad. Todo `USING (true)` equivale a publicar esa tabla en internet.

---

## Hallazgos por severidad

### C1 — CRÍTICO · Webhook de n8n sin autenticación

`backend/src/routes/n8n-webhook.ts`, montado en `app.ts` sin middleware.

El endpoint es público, escribe con `service_role` (ignora RLS) y toma el `company_id`
**del body**. No hay firma, token ni secreto compartido. Cualquiera en internet puede
inyectar candidatos en la empresa que elija:

```bash
curl -X POST https://<host>/api/n8n-webhook \
  -H 'Content-Type: application/json' \
  -d '{"company_id":"<uuid>","IdSolicitud":"x","Nombre":"payload"}'
```

La única validación es que la empresa exista — y **H3** permite listar todos los UUID de
empresa, así que la cadena de ataque está completa.

**Impacto:** escritura arbitraria en la base, contaminación del pool de candidatos,
vector de XSS almacenado si algún campo se renderiza sin escapar.

---

### C2 — CRÍTICO (a confirmar) · `profiles` sin RLS conocida → escalada de privilegios

Ninguna migración del repo habilita RLS sobre `profiles` ni define políticas. Las
migraciones 001 y 002 no están versionadas, así que el estado real debe verificarse en la
base (query al final de este documento).

Si `profiles` permite que un usuario actualice su propia fila sin restricción de columnas,
todo el modelo multi-tenant cae, porque **cada política del sistema resuelve la empresa
leyendo esta tabla**:

```js
// desde la consola del navegador, con la anon key pública
await supabase.from('profiles').update({ role: 'empresa' }).eq('id', miId)         // escalada de rol
await supabase.from('profiles').update({ company_id: otraEmpresa }).eq('id', miId) // salto de tenant
```

El segundo caso es el peor: cambiar el propio `company_id` reescribe el resultado de
`candidates_read_own_company` y de todas las demás. El aislamiento entre empresas se evapora.

**Impacto:** lectura y escritura de los datos de cualquier empresa; toma de control del panel
de administración.

---

### H1 — ALTO · `vacancies` completamente abierta entre empresas

`005_vacancies.sql`

```sql
FOR SELECT TO authenticated USING (true)       -- lee las vacantes de todas las empresas
FOR INSERT TO authenticated WITH CHECK (true)  -- crea vacantes a nombre de cualquiera
FOR UPDATE TO authenticated USING (true)       -- edita las de la competencia
```

Agravante: la tabla **no tiene `company_id`**. Solo `company TEXT` (etiqueta libre, no
verificable) y `created_by`. No existe hoy forma de aislarla sin cambiar el esquema.

---

### H2 — ALTO · Vacantes expuestas a usuarios anónimos

`005_vacancies.sql`

```sql
CREATE POLICY "Público lee vacantes activas"
  ON public.vacancies FOR SELECT TO anon USING (status = 'active');
```

Servía al portal público `/apply`, **eliminado en este rediseño**. La política sobrevivió a la
funcionalidad: hoy publica salarios, descripciones y condiciones a cualquiera con la anon key,
sin login.

---

### H3 — ALTO · Enumeración de empresas

`006_empresa_jerarquia.sql`

```sql
CREATE POLICY "companies_read" ON companies FOR SELECT USING (true);
```

Sin cláusula `TO`, aplica también a `anon`. Devuelve el UUID y el nombre de todas las
empresas del sistema — que es justo el insumo que **C1** necesita.

---

### M1 — MEDIO · Inyección de filtros PostgREST en la búsqueda

`frontend/src/services/candidateService.ts:42`

```ts
query.or(`full_name.ilike.%${filters.search}%,position.ilike.%${filters.search}%,...`)
```

`filters.search` entra sin sanear en la sintaxis de filtros de PostgREST. Una coma cierra la
condición e inyecta uno nuevo: `x,status.eq.rechazado`. No es SQL injection clásica —
PostgREST parametriza— pero permite reescribir la lógica del filtro.

RLS contiene el daño (no cruza empresas), y por eso queda en MEDIO. El equivalente del
backend (`candidates.ts:57`) ya limpia `%,()`.

---

### M2 — MEDIO · Políticas heredadas de la migración 003

`003_candidate_features.sql` definía `candidate_notes` y `candidate_status_history` con
`USING (true)`. En **este** entorno esa migración nunca se aplicó y las tablas fueron creadas
por 010/011 ya scopeadas, así que no hay exposición aquí. Queda registrado porque cualquier
entorno donde sí corriera 003 mantiene las notas de todas las empresas legibles.

---

### M3 — MEDIO · El esquema base no es reproducible

Faltan las migraciones 001 y 002 (`CLAUDE.md` referencia un `002_supabase_schema.sql`
inexistente). `profiles` y `candidates` se crearon a mano en Supabase. No hay forma de
auditar ni de recrear el entorno desde cero, que es precisamente cómo **C2** pasó inadvertido.

---

### L1 — BAJO · `candidates.company_id` admite NULL

Las filas sin empresa quedan invisibles para toda política (`company_id = NULL` nunca es
verdadero) pero siguen ocupando la tabla. Datos huérfanos que ningún usuario puede ver ni
depurar desde la aplicación.

---

## Plan de mitigación

Ordenado por reducción de riesgo sobre esfuerzo. Cada fase es independiente y desplegable.

### Fase 1 — Cerrar la escritura pública (C1) · ~30 min

1. Verificar `N8N_WEBHOOK_SECRET` en el arranque y **exigir firma HMAC-SHA256** en
   `/api/n8n-webhook`, comparándola en tiempo constante (`crypto.timingSafeEqual`).
2. Incluir *timestamp* en la firma y rechazar peticiones con más de 5 minutos → corta replays.
3. Rate limit propio del webhook, más estricto que el global.
4. Registrar cada rechazo con su correlation ID.
5. Reflejar la firma en el nodo HTTP Request de n8n.

**Criterio de aceptación:** una petición sin cabecera `X-N8N-Signature`, o con firma inválida,
devuelve 401 y no escribe nada.

### Fase 2 — Blindar `profiles` (C2) · ~45 min · *migración 013*

1. Confirmar el estado real (query abajo) **antes** de escribir la migración.
2. `ENABLE ROW LEVEL SECURITY` sobre `profiles`.
3. `SELECT`: la propia fila, o las de la misma empresa.
4. `UPDATE`: la propia fila, **con un trigger `BEFORE UPDATE` que rechace cambios en `role`,
   `company_id` y `suspended`** salvo que provengan de `service_role`. Restringir columnas es
   imposible solo con RLS: por eso el trigger.
5. Sin políticas de `INSERT`/`DELETE` para usuarios: altas y bajas pasan por el backend, que
   ya audita en `recruiter_audit_log`.

**Criterio de aceptación:** un reclutador que ejecute `update({role:'empresa'})` con la anon
key recibe un error y su fila no cambia.

### Fase 3 — Aislar `vacancies` (H1, H2) · ~30 min · *migración 014*

1. `ADD COLUMN company_id UUID REFERENCES companies(id)`.
2. Backfill desde `created_by → profiles.company_id`; las que queden sin dueño se revisan a
   mano (la tabla está vacía hoy, así que probablemente sea un no-op).
3. `NOT NULL` una vez rellena, e índice por `company_id`.
4. Sustituir las cuatro políticas `USING (true)` por el filtro de empresa, con `DELETE`
   restringido al rol `empresa`.
5. **Eliminar** la política `TO anon`: el portal público ya no existe.

**Criterio de aceptación:** un usuario de la empresa A no ve ninguna vacante de la B, y un
cliente anónimo no ve ninguna.

### Fase 4 — Superficie residual (H3, M1, L1) · ~30 min · *migración 015*

1. `companies`: limitar el `SELECT` a la empresa propia (`TO authenticated`), quitando `anon`.
2. Sanear `filters.search` en `candidateService.list` con el mismo criterio que el backend, y
   extraerlo a un helper compartido para que no vuelvan a divergir.
3. Poner `candidates.company_id` en `NOT NULL` tras revisar huérfanos.

### Fase 5 — Reproducibilidad (M3) · ~1 h

1. Volcar el esquema real (`supabase db dump`) a `000_baseline.sql`.
2. Corregir la referencia rota de `CLAUDE.md`.
3. Documentar el orden de aplicación en un README de migraciones.

---

## Verificación previa obligatoria

Ejecutar **antes** de la Fase 2; su resultado determina el contenido de la migración 013:

```sql
-- ¿Tiene RLS activo?
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('profiles','candidates','vacancies','companies');

-- ¿Qué políticas existen realmente?
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

Si `profiles.relrowsecurity` es `false`, **C2 está confirmado y activo**: cualquier usuario
autenticado puede reescribir su propio rol y su empresa.

---

## Pruebas de regresión

| Prueba | Esperado |
|---|---|
| POST al webhook sin firma | 401, sin escritura |
| POST al webhook con firma de hace 10 min | 401 (replay) |
| Reclutador hace `update({role:'empresa'})` | Error, fila intacta |
| Reclutador hace `update({company_id:'<otra>'})` | Error, fila intacta |
| Usuario de empresa A lista `vacancies` | Solo las de A |
| Cliente `anon` lista `vacancies` | 0 filas |
| Usuario de empresa A lista `companies` | Solo la suya |
| Búsqueda con `x,status.eq.rechazado` | Tratada como texto literal |
