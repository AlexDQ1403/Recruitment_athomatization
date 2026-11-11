# Feature: Integración chat ↔ n8n (pendientes 1–5)

Estado: implementado y probado (backend 48/48, typecheck limpio). Migración 021 pendiente de aplicar tras revisar duplicados. Alcance: backend (Express) + pruebas. El flujo de n8n se corrige después, con el MCP, y depende de lo definido aquí.

## Requisitos (formato EARS)

R1. While corre la suite de backend, when se ejecuta `chat.test.ts`, the system shall pasar 6/6 pruebas montando el router con un middleware falso que inyecte `req.locals` (`user`, `profile`, `companyId`).

R2. While `POST /api/n8n-webhook` recibe una petición, when falta o no coincide la cabecera `X-N8N-Secret`, the system shall responder 401 sin tocar la base de datos y registrar el intento (sin volcar el secreto).

R3. While llega un candidato ya existente (mismo LinkedIn o mismo email dentro de la empresa), when se procesa el webhook, the system shall actualizar solo los campos vacíos y nunca modificar `status`, `created_by` ni `company_id`. Dos candidatos distintos de una misma solicitud shall conservarse ambos.

R4. While un mensaje del chat termina sin resultados, when el backend dispara `no_search_results`, the system shall omitir `candidate_shortage` en esa misma petición. `candidate_shortage` shall dispararse como máximo una vez por hora por empresa.

R5. While se cambia `n8nService` o `n8n-webhook`, when corre `vitest`, the system shall ejecutar pruebas que cubran firma saliente, secreto entrante, validación, inserción, deduplicación y carrera de inserción.

## Hallazgos de partida (verificados en el código)

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| 1 | `chat.test.ts` monta `chatRouter` sin `companyAuthMiddleware`; el router lee `req.locals` y responde 401 | `chat.test.ts:41-44`, `chat.ts` (`req.locals?.user?.id`) |
| 2 | `/api/n8n-webhook` no tiene autenticación ni límite de tasa | `app.ts` ("Rutas sin autenticación"); ya listado como C1 en `specs/db_security_design.md` |
| 3 | La deduplicación usa `n8n_request_id = IdSolicitud`, que es igual para todos los candidatos de una solicitud; además el `update` reescribe `status: 'seguimiento'` | `n8n-webhook.ts` (pasos 4 y 5) |
| 4 | `candidate_shortage` se dispara en **cada** mensaje si hay < 30 candidatos | `chat.ts` (bloque `if (count < 30)`) |
| 5 | No hay pruebas de `n8nService` ni de `n8n-webhook` | `ls backend/src/**/*.test.ts` |

## Arquitectura

### [Backend]

**Paso 1 — arreglar `chat.test.ts`**
- Cambiar `buildApp` para montar `app.use('/api/chat', fakeAuth, chatRouter)`, donde `fakeAuth` toma el `Authorization` del test: sin cabecera → 401; con token inválido (`mockGetUser` con error) → 401; si no, inyecta `req.locals = { user: { id: 'user-1', email }, companyId: 'company-1', profile: { role: 'recruiter' } }`.
- Quitar el mock de `OPENROUTER_API_KEY` si ya no aplica; el mock de `config` debe incluir `SUPABASE_SERVICE_ROLE_KEY` y `N8N_WEBHOOK_URL: undefined`.
- Los mocks de `from()` deben cubrir las tablas nuevas que consulta el chat (`chat_sessions`, `chat_messages`, `company_candidates`, `candidates`, `search_history`). Usar un `mockFrom` por tabla en lugar de una sola cadena.

**Paso 2 — autenticar el webhook entrante**
- Nuevo middleware `backend/src/middlewares/n8nSecret.ts`: lee `X-N8N-Secret`, compara con `config.N8N_WEBHOOK_SECRET` usando `crypto.timingSafeEqual` (longitudes iguales primero). Si el secreto no está configurado → 503 (falla cerrado). Si no coincide → 401 + `logger.warn` con `correlationId` e IP, sin el valor recibido.
- Montarlo en `app.ts`: `app.use('/api/n8n-webhook', n8nWebhookLimiter, n8nSecret, n8nWebhookRouter)`, con `express-rate-limit` (p. ej. 60 req/min por IP).
- Validar el cuerpo con Zod: `company_id` uuid, `IdSolicitud` y `Nombre` string 1–200, correo con formato de email o vacío, `urlLinkedin` URL de `linkedin.com` o vacía, `Experiencia` y `Aspiracion` enteros ≥ 0 y acotados, fecha ISO válida (hoy `new Date(...).toISOString()` lanza con fechas inválidas y devuelve 500).
- Respuesta mínima: `{ success, action, candidate_id }`. No devolver el registro completo (incluye email).
- Lado n8n (para el paso posterior): el nodo HTTP enviará `X-N8N-Secret` desde una credencial de n8n, no escrita en el JSON.

**Paso 3 — deduplicación correcta**
- Orden de búsqueda dentro de la empresa: `linkedin_url` normalizado → `lower(email)` → `(n8n_request_id, lower(full_name))`. `n8n_request_id` deja de ser clave por sí solo.
- Actualización sin pisar curación: solo rellena columnas que estén `null`; no toca `status`, `created_by`, `company_id`, `vacancy_id`.
- Migración `021_candidates_dedupe_indexes.sql`: índices únicos parciales `(company_id, lower(email)) WHERE email IS NOT NULL` y `(company_id, linkedin_url) WHERE linkedin_url IS NOT NULL`. **Antes de aplicarla**, correr una consulta de duplicados existentes; si hay, limpiarlos primero o la migración falla.
- Carrera entre dos peticiones: si el insert devuelve `23505`, repetir la búsqueda y tratarlo como actualización.

**Paso 4 — dejar de disparar `candidate_shortage` en cada mensaje**
- En `chat.ts`: guardar un indicador `noResultsTriggered`; si es `true`, no evaluar escasez.
- Throttle por empresa en `n8nService` (`Map<companyId, timestamp>`, ventana de 1 h). Es en memoria: se reinicia con el servidor y no se comparte entre instancias. Aceptable mientras haya una sola instancia; si se escala, mover a una tabla.
- Lo mismo para `no_search_results`: no repetir la misma consulta de la misma empresa dentro de 10 min (evita ráfagas si el reclutador reintenta).

**Paso 5 — pruebas**
- `n8nService.test.ts`: sin `N8N_WEBHOOK_URL` no llama a `fetch`; con URL envía `X-N8N-Signature` válido (HMAC-SHA256 del cuerpo); el payload de `no_search_results` incluye `mensaje`, `company_id`, `session_id`; el throttle bloquea el segundo `candidate_shortage`.
- `n8n-webhook.test.ts`: 503 sin secreto configurado; 401 sin cabecera y con cabecera errónea; 400 por `company_id` inválido; 404 empresa inexistente; inserta nuevo; dos candidatos con la misma `IdSolicitud` → dos inserts; duplicado por LinkedIn → actualiza sin cambiar `status`; `23505` → reintento como actualización.
- `chat.test.ts` (ampliar): resultado vacío dispara `no_search_results` y agrega el aviso; con resultados no se dispara; `candidate_shortage` no se dispara junto con `no_search_results`.

### [Frontend]
Sin cambios de código en este alcance. El aviso de búsqueda externa viaja dentro de `message`. **Por verificar:** que `ChatView` muestre los saltos de línea del mensaje (si no usa `whitespace-pre-wrap`, el aviso se verá pegado al texto anterior).

### [Security]
- Autenticación: secreto compartido con comparación en tiempo constante; falla cerrado.
- Autorización: el `company_id` del cuerpo solo es confiable porque la petición está autenticada; se valida que la empresa exista.
- Entrada: Zod en el cuerpo; consultas parametrizadas por el cliente de Supabase.
- Salida: no se devuelven datos personales a n8n.
- Tasa: límite en el endpoint; throttle en el disparo saliente (evita abuso de coste de LLM/SerpApi).
- Registro: intentos fallidos con `correlationId`; no se registran secretos ni cuerpos completos (hoy se registran 200 caracteres del cuerpo en el `catch`; reducir a claves presentes).
- Fuera de alcance pero abierto: rotar la `apikey` de SerpApi y la clave de Supabase que están en `backend/n8n/workflows.json`, y quitarlas del repo.

## Plan de implementación

Orden pensado para que cada paso deje la suite en verde.

- [x] 1. Arreglar `chat.test.ts` (R1). Verificar: `npx vitest run src/routes/chat.test.ts` → 6/6.
- [x] 2. Middleware `n8nSecret` + límite de tasa + esquema Zod; montarlos en `app.ts` (R2).
- [x] 3. Pruebas del paso 2 en `n8n-webhook.test.ts` (parte de R5).
- [x] 4. Reescribir deduplicación y actualización parcial; migración 021 tras revisar duplicados (R3).
- [x] 5. Pruebas del paso 4, incluida la carrera `23505` (parte de R5).
- [x] 6. Throttle en `n8nService` y exclusión mutua de eventos en `chat.ts` (R4).
- [x] 7. `n8nService.test.ts` y ampliación de `chat.test.ts` (parte de R5).
- [x] 8. `npm run typecheck` y `npx vitest run` en `backend/`; revisión manual del aviso en `ChatView`.

## Criterios de aceptación

- `npm run typecheck` sin errores y `vitest` en verde en backend (hoy 19/23).
- `curl -X POST /api/n8n-webhook` sin `X-N8N-Secret` → 401; con secreto correcto y cuerpo válido → 200.
- Tres candidatos con la misma `IdSolicitud` y distinta persona → tres filas.
- Un candidato movido a `en_contacto` conserva ese estado tras un reenvío desde n8n.
- Con 8 candidatos en la empresa, 10 mensajes seguidos del chat generan como máximo 1 evento `candidate_shortage`.

## Riesgos y decisiones abiertas

| Tema | Riesgo | Decisión propuesta |
|------|--------|--------------------|
| Migración 021 | Falla si ya hay emails o URLs duplicados | Consulta previa de duplicados; limpiar antes |
| Secreto compartido | Reutiliza `N8N_WEBHOOK_SECRET` (hoy firma el saliente) | Aceptable; si se quiere separar, añadir `N8N_INBOUND_SECRET` |
| Throttle en memoria | Se pierde al reiniciar; no sirve con varias instancias | Aceptable ahora; tabla si se escala |
| Cambio de contrato | El flujo de n8n actual no envía `X-N8N-Secret` | El webhook empezará a devolver 401 hasta actualizar el flujo; coordinar con la corrección del flujo |
