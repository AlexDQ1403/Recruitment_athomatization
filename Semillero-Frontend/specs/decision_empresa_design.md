# Candidatos aprobados → empresa decide (contratar / descartar)

## Reglas
1. A la empresa SOLO le llegan candidatos que un reclutador aprobó (`company_candidates.presented_to_company = true`). Todo lo demás es invisible para el rol `empresa`, incluso por la vista de candidatos de una vacante.
2. La empresa decide por su cuenta: **contratar** o **descartar**. Es independiente del pipeline del reclutador (`status`: seguimiento / en_contacto / rechazado).
3. La decisión de la empresa es definitiva (sin deshacer) y la pide confirmar en pantalla.
4. Una vez que la empresa decidió, el reclutador ya no puede cambiar el pipeline ni retirar al candidato (409).
5. Solo el reclutador aprueba; solo la empresa contrata/descarta.

## Datos (migración 024)
`company_candidates.company_decision` (`pendiente` por defecto | `contratado` | `descartado`), `company_decided_at`, `company_decided_by`.

## Backend
- `POST /api/vacancies/:vacancyId/applicants/:kind/:id/approve` (recruiter): presenta al candidato a la empresa. Funciona para candidatos con cuenta y fichas heredadas (hasta ahora solo las heredadas podían aprobarse, desde el chat). Rechazado no se puede aprobar (409). Repetir es idempotente.
- `GET /api/company/candidates` (empresa): suma `kind`, `decision`, `decided_at` y `summary { pendiente, contratado, descartado }` (conteos exactos, no de la página).
- `PATCH /api/company/candidates/:kind/:id/decision` `{ decision: 'contratar' | 'descartar' }` (empresa): solo si está presentado y pendiente. 404 si no está aprobado o es de otra empresa; 409 si ya decidió otra cosa; la repetición idéntica es idempotente.
- `GET /api/vacancies/:vacancyId/applicants`: para `empresa` solo devuelve los aprobados; para todos incluye `presented` y `company_decision`.
- `PATCH .../status`: ahora solo reclutador (403 a empresa) y 409 si la empresa ya decidió. Lo mismo en `/api/candidates/:id/decision` y `/status`.
- Dashboard del reclutador: tarjeta "Contratados por la empresa".

## Seguridad
Empresa y rol salen del token; ids uuid; Zod; las consultas se acotan por `company_id` y por `presented_to_company`. Actualización condicional (`company_decision = 'pendiente'`) para evitar carreras. Errores genéricos al cliente, detalle en el log.

## Frontend
- "Candidatos aceptados" (empresa): columna Decisión con Contratar/Descartar + confirmación. Dashboard de empresa con Por decidir / Contratados / Descartados.
- Modal "Ver candidatos": reclutador → Aprobar + pipeline; empresa → solo aprobados con Contratar/Descartar.

## Fuera de alcance
No se cambia el estado visible al candidato (`applications.status` no tiene "contratado") ni se notifica por correo. El contador `applicants_count` de la lista de vacantes sigue contando todos los postulantes.
