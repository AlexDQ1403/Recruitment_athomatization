# Feature: Decisiones del reclutador sobre un candidato (aprobar · seguimiento · rechazar)

Estado: implementado y probado (typecheck limpio en backend y frontend). **No requiere migración**: usa solo los tres estados que el plan ya define. Alcance: `backend/src/routes/candidates.ts`, tipos y pantallas del frontend (chat, panel, kanban, dashboard) y la lista de la empresa.

## Decisión de diseño: no hay estado "stand by"

Una primera versión añadía un cuarto estado `stand_by`. Se descartó: **`seguimiento` ya es el estado para seguir considerando a un candidato sin descartarlo**, y el plan fija solo tres estados (`seguimiento · en_contacto · rechazado`). Un cuarto estado duplicaba el significado, obligaba a tocar cuatro restricciones de la base de datos y todas las pantallas que enumeran estados. "Dejar en pausa" es, simplemente, `seguimiento`.

## Contexto (lo que ya existía, verificado en el código)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Pipeline interno | `candidates.status` ∈ `seguimiento · en_contacto · rechazado` (migraciones 008, 010, 015) | `rechazado` es terminal (`ALLOWED_TRANSITIONS`). `en_contacto` dispara la entrevista por n8n |
| Aprobación | `company_candidates.presented_to_company = true` (migración 018) | Habilita lo que la **empresa** ve. Solo reclutador. La empresa nunca escribe |
| Lista de la empresa | `GET /api/company/candidates` → `CompanyCandidatesHistoryView` | Solo filas con `presented_to_company = true` |
| Historial | `candidate_status_history` | Una fila por cambio de estado, con `changed_by` y `reason` |
| Chat | `ChatView` → `CandidateCards` | Mostraba candidatos **sin ninguna acción** |

Faltaba una acción explícita desde el chat y que rechazar o devolver a seguimiento saque al candidato de la lista de aceptados.

## Requisitos (EARS)

R1. While un reclutador ve un candidato en el chat, when pulsa **Aprobar**, the system shall marcarlo como presentado a la empresa (entra en su lista de candidatos aceptados) y registrar quién y cuándo.

R2. While un reclutador ve un candidato, when pulsa **Seguimiento**, the system shall dejarlo en `seguimiento`, sacarlo de la lista de aceptados si estaba, y mantenerlo en el pipeline sin descartarlo.

R3. While un reclutador ve un candidato, when pulsa **Rechazar** (con confirmación), the system shall pasarlo a `rechazado`, sacarlo de la lista de aceptados y dejar de ofrecer acciones sobre él.

R4. While un candidato está `rechazado`, when se intenta aprobarlo o dejarlo en seguimiento, the system shall responder 409 sin cambiar nada (estado terminal).

R5. While se aplica una decisión que cambia el estado, the system shall registrar el cambio en `candidate_status_history` con el reclutador y el motivo opcional.

R6. While el chat muestra tarjetas de mensajes antiguos, when el estado del candidato cambió desde entonces, the system shall mostrar el estado actual, no el de la captura del mensaje.

R7. While el usuario no es reclutador, when llama a la decisión, the system shall responder 403. La empresa solo ve su lista; nunca decide.

## Modelo

```
seguimiento ⇄ en_contacto        (cualquiera → rechazado, que es terminal)
```

| Decisión | Efecto en `candidates.status` | Efecto en `company_candidates` | Lista de la empresa |
|---|---|---|---|
| **aprobar** | no cambia | upsert con `presented_to_company = true`, `presented_at`, `presented_by` | **entra** |
| **seguimiento** | → `seguimiento` (si venía de `en_contacto`, queda en el historial) | `presented_to_company = false`, `status = 'seguimiento'` | sale |
| **rechazar** | → `rechazado` | `presented_to_company = false`, `status = 'rechazado'` | sale |

Aprobar no contacta al candidato: `en_contacto` (con su entrevista y correo por n8n) sigue siendo una acción distinta. Un candidato aprobado puede estar en `seguimiento` o en `en_contacto`.

## Arquitectura

### [Backend] `backend/src/routes/candidates.ts`
- `PATCH /api/candidates/:id/decision` — body `{ decision: 'aprobar' | 'seguimiento' | 'rechazar', reason?: string (≤500) }`, validado con Zod; `:id` debe ser UUID. Cualquier otra decisión (incluida `stand_by`) → 400.
  1. Rol `recruiter` (403 si no). `companyId` del token, nunca del cuerpo.
  2. Lee el candidato **filtrando por `company_id`** (404 si no es de su empresa).
  3. `rechazado` + cualquier decisión distinta de `rechazar` → 409. Misma decisión repetida → 200 con `unchanged: true`.
  4. Actualiza `candidates` si cambia el estado, inserta historial, sincroniza `company_candidates`.
  5. Responde `{ id, status, presented, unchanged? }`. Nunca email ni teléfono.
- `GET /api/candidates/decisions?ids=a,b,c` — hasta 100 ids UUID, solo de su empresa. Devuelve `{ [id]: { status, presented } }` para el chat (R6). Se registra antes de `/:id`.
- `PATCH /:id/status` (Kanban y panel) al pasar a `rechazado` también saca al candidato de la lista de aceptados, para que haya un solo resultado por camino. Pasar a `en_contacto` o `seguimiento` por ahí no toca la lista.
- `PATCH /:id/present` se conserva por compatibilidad.

### [Frontend]
- `ChatView`: cada tarjeta con 3 botones (Aprobar · Seguimiento · Rechazar). Rechazar pide confirmación (`ConfirmModal`). Tras la acción la tarjeta muestra el estado ("Aceptado", "Rechazado") y deshabilita lo que ya no aplica. Los estados reales se cargan con `/decisions`.
- Si un id no existe en `candidates` (candidatos con cuenta propia), no se ofrecen botones: ese flujo queda fuera de este alcance.
- Vista de la empresa: se titula **Candidatos aceptados**. Su contenido es solo lo aprobado y vigente.

### [Security]
- Autorización en el servidor: rol + `company_id` en cada consulta; el cliente no decide nada.
- Entrada: Zod en cuerpo, UUID en `:id` y en `ids`, tope de 100 ids, `reason` acotado.
- Salida mínima: estado y bandera de presentado; no se devuelven datos personales.
- Auditoría: historial con `changed_by`, y log con candidato, empresa, reclutador y decisión.
- Idempotencia: repetir una decisión no duplica historial; cada paso es reintentable.
- Rechazo terminal evita reactivar candidatos por error o por una carrera entre dos reclutadores.

## Criterios de aceptación
- Aprobar un candidato desde el chat → aparece en `GET /api/company/candidates` de su empresa.
- Seguimiento o Rechazar sobre un candidato aprobado → deja de aparecer ahí.
- Aprobar un `rechazado` → 409; la decisión de un usuario que no es reclutador → 403; un candidato de otra empresa → 404; `stand_by` → 400.
- Cada cambio de estado queda en `candidate_status_history` con el reclutador.
- Reabrir una sesión antigua muestra el estado actual de cada tarjeta.
- Ninguna respuesta de estos endpoints contiene email ni teléfono.

## Riesgos y decisiones abiertas
| Tema | Decisión |
|---|---|
| Candidatos con cuenta propia (`candidate_profiles`) | Sin botones por ahora: `present` y `status` ya eran solo para `candidates`. Es el siguiente paso natural |
| Empresa ve rechazados | No: salen de su lista al rechazar. Si se quiere un histórico completo, sería otra vista |
| Devolver a seguimiento a alguien en contacto | Es explícito (botón o decisión) y queda en el historial; el Kanban sigue permitiendo mover entre estados |
